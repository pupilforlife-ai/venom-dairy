import { useEffect, useRef, useState } from 'react';
import { supabase } from '../lib/supabase';

interface AppStateRow<T> {
  key: string;
  value: T;
  version: number;
}

type JsonRecord = Record<string, unknown>;

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function jsonEqual(left: unknown, right: unknown) {
  return JSON.stringify(left) === JSON.stringify(right);
}

// Merge a local edit onto the latest server snapshot. State is stored as one
// JSON array per collection, so replacing the whole array from a stale tab
// can otherwise erase another user's round update. We preserve server items
// that the local edit did not touch and merge object fields independently.
function mergePersistedValue<T>(base: T, next: T, remote: T): T {
  if (Array.isArray(base) && Array.isArray(next) && Array.isArray(remote)) {
    const hasStableIds = [...base, ...next, ...remote].every(item => isRecord(item) && typeof item.id === 'string');
    if (hasStableIds) {
      const baseById = new Map(base.map(item => [String((item as JsonRecord).id), item]));
      const nextById = new Map(next.map(item => [String((item as JsonRecord).id), item]));
      const remoteById = new Map(remote.map(item => [String((item as JsonRecord).id), item]));
      const merged = remote.filter(item => {
        const id = String((item as JsonRecord).id);
        // A deletion is honoured only when the remote item is still the same
        // item the local edit started from; otherwise preserve the newer edit.
        if (!nextById.has(id) && baseById.has(id)) {
          return !jsonEqual(remoteById.get(id), baseById.get(id));
        }
        return true;
      }).map(item => {
        const id = String((item as JsonRecord).id);
        const baseItem = baseById.get(id);
        const nextItem = nextById.get(id);
        if (!baseItem || !nextItem || jsonEqual(baseItem, nextItem)) return item;
        return mergePersistedValue(baseItem, nextItem, item);
      });

      // Preserve locally added records that are not on the server yet.
      next.forEach(item => {
        const id = String((item as JsonRecord).id);
        if (!remoteById.has(id) && !baseById.has(id)) merged.push(item);
      });
      return merged as T;
    }
  }

  if (isRecord(base) && isRecord(next) && isRecord(remote)) {
    const merged: JsonRecord = { ...remote };
    const keys = new Set([...Object.keys(base), ...Object.keys(next)]);
    keys.forEach(key => {
      const baseHas = Object.prototype.hasOwnProperty.call(base, key);
      const nextHas = Object.prototype.hasOwnProperty.call(next, key);
      const baseValue = base[key];
      const nextValue = next[key];
      const remoteValue = remote[key];

      if (!nextHas && baseHas) {
        if (jsonEqual(remoteValue, baseValue)) delete merged[key];
        return;
      }
      if (!nextHas || jsonEqual(baseValue, nextValue)) return;
      if (nextValue === undefined) {
        if (jsonEqual(remoteValue, baseValue)) delete merged[key];
        return;
      }
      if (isRecord(baseValue) && isRecord(nextValue) && isRecord(remoteValue)) {
        merged[key] = mergePersistedValue(baseValue, nextValue, remoteValue);
      } else {
        merged[key] = nextValue;
      }
    });
    return merged as T;
  }

  return next;
}

function readLocalValue<T>(key: string, initialValue: T): T {
  try {
    const item = window.localStorage.getItem(key);
    return item ? JSON.parse(item) as T : initialValue;
  } catch (error) {
    console.error(`Error loading ${key} from localStorage:`, error);
    return initialValue;
  }
}

// A milk receipt can exist only in an open device's cache if an older client
// overwrote the shared array before realtime synchronization was available.
// Recover only recent, complete receipts and never replace a server lot. This
// is deliberately limited to milk lots; other collections must not resurrect
// records that were intentionally removed during maintenance.
function recoverRecentCachedMilkLots<T>(key: string, cached: T, remote: T): T {
  if (key !== 'vejoy_milkLots' || !Array.isArray(cached) || !Array.isArray(remote)) return remote;

  const remoteRecords = remote.filter(isRecord);
  const remoteIds = new Set(remoteRecords.map(item => String(item.id || '')));
  const remoteCodes = new Set(remoteRecords.map(item => String(item.lotCode || '')));
  const recentCutoff = Date.now() - (14 * 24 * 60 * 60 * 1000);
  const recoverableByCode = new Map<string, JsonRecord>();

  cached.forEach(item => {
    if (!isRecord(item)) return;
    const id = typeof item.id === 'string' ? item.id : '';
    const lotCode = typeof item.lotCode === 'string' ? item.lotCode.trim() : '';
    const receiptDate = typeof item.receiptDate === 'string' ? item.receiptDate : '';
    const receiptTimestamp = Date.parse(`${receiptDate}T00:00:00`);
    if (!id || !lotCode || !Number.isFinite(receiptTimestamp) || receiptTimestamp < recentCutoff) return;
    if (remoteIds.has(id) || remoteCodes.has(lotCode)) return;

    // New lots are appended, so if a user had to enter the same receipt twice
    // the last cached copy is the one linked to the latest production records.
    recoverableByCode.set(lotCode, item);
  });

  if (recoverableByCode.size === 0) return remote;
  return [...remote, ...recoverableByCode.values()] as T;
}

export function useSupabaseState<T>(key: string, initialValue: T) {
  // When Supabase is enabled, browser localStorage is only a cache. Never use
  // an old demo/cache snapshot as the initial production source of truth.
  // Local demo mode is the only path that intentionally reads localStorage.
  const [storedValue, setStoredValue] = useState<T>(() => supabase
    ? (Array.isArray(initialValue) ? [] as T : initialValue)
    : readLocalValue(key, initialValue));
  const [hasLoaded, setHasLoaded] = useState(!supabase);
  const valueRef = useRef(storedValue);
  // Supabase writes replace the complete JSON document for a key. Serialise
  // them so a slower request cannot finish after a newer edit and restore an
  // older snapshot (this was especially visible when saving several rounds).
  const writeQueueRef = useRef<Promise<void>>(Promise.resolve());
  const localWriteVersionRef = useRef(0);
  const serverValueRef = useRef<T | undefined>(undefined);
  const pendingWritesRef = useRef(0);

  const applyServerValue = (row: AppStateRow<T>) => {
    serverValueRef.current = row.value;
    valueRef.current = row.value;
    setStoredValue(row.value);
    window.localStorage.setItem(key, JSON.stringify(row.value));
  };

  const queuePersist = (baseValue: T, nextValue: T, localVersion: number) => {
    const client = supabase;
    if (!client) return;
    pendingWritesRef.current += 1;

    writeQueueRef.current = writeQueueRef.current
      .catch(() => undefined)
      .then(async () => {
        let lastError: unknown;
        for (let attempt = 0; attempt < 8; attempt += 1) {
          const { data: remoteRow, error: readError } = await client
            .from('app_state')
            .select('key, value, version')
            .eq('key', key)
            .maybeSingle<AppStateRow<T>>();
          if (readError) throw readError;

          const remoteValue = remoteRow?.value ?? serverValueRef.current ?? baseValue;
          const mergedValue = mergePersistedValue(baseValue, nextValue, remoteValue);

          if (!remoteRow) {
            const { data: insertedRow, error: insertError } = await client
              .from('app_state')
              .insert({ key, value: mergedValue })
              .select('key, value, version')
              .single<AppStateRow<T>>();
            if (insertError) {
              lastError = insertError;
              if (insertError.code === '23505') continue;
              throw insertError;
            }
            serverValueRef.current = insertedRow.value;
            if (localWriteVersionRef.current === localVersion) applyServerValue(insertedRow);
            return;
          }

          // Compare-and-swap: if another device updates this collection after
          // our read, zero rows match and we retry against its newer snapshot.
          const { data: savedRow, error: saveError } = await client
            .from('app_state')
            .update({ value: mergedValue })
            .eq('key', key)
            .eq('version', remoteRow.version)
            .select('key, value, version')
            .maybeSingle<AppStateRow<T>>();
          if (saveError) throw saveError;
          if (!savedRow) continue;

          serverValueRef.current = savedRow.value;
          if (localWriteVersionRef.current === localVersion) applyServerValue(savedRow);
          return;
        }
        throw lastError || new Error(`Could not save ${key} after concurrent updates`);
      })
      .catch(async (error) => {
        console.error(`Error saving ${key} to Supabase:`, error);
        // A rejected write must not leave a false local-only view. Reload the
        // authoritative server copy when this was the most recent edit.
        if (localWriteVersionRef.current !== localVersion) return;
        const { data } = await client
          .from('app_state')
          .select('key, value, version')
          .eq('key', key)
          .maybeSingle<AppStateRow<T>>();
        if (data) applyServerValue(data);
      })
      .finally(() => {
        pendingWritesRef.current = Math.max(0, pendingWritesRef.current - 1);
      });
  };

  useEffect(() => {
    let cancelled = false;
    const loadVersion = localWriteVersionRef.current;
    const cachedValue = readLocalValue(key, initialValue);
    const client = supabase;

    const loadValue = async () => {
      if (!client) return;

      const { data, error } = await client
        .from('app_state')
        .select('key, value, version')
        .eq('key', key)
        .maybeSingle<AppStateRow<T>>();

      if (cancelled) return;

      if (error) {
        console.error(`Error loading ${key} from Supabase:`, error);
        return;
      }

      if (data) {
        // Do not let a slow initial read overwrite an edit made while that
        // read was in flight. The edit is already queued for persistence.
        if (localWriteVersionRef.current !== loadVersion) {
          setHasLoaded(true);
          return;
        }
        const recoveredValue = recoverRecentCachedMilkLots(key, cachedValue, data.value);
        if (!jsonEqual(recoveredValue, data.value)) {
          localWriteVersionRef.current += 1;
          const recoveryVersion = localWriteVersionRef.current;
          valueRef.current = recoveredValue;
          setStoredValue(recoveredValue);
          window.localStorage.setItem(key, JSON.stringify(recoveredValue));
          setHasLoaded(true);
          queuePersist(data.value, recoveredValue, recoveryVersion);
          return;
        }

        applyServerValue(data);
        setHasLoaded(true);
        return;
      }

      // Do not seed a missing production key with mock/demo data. The first
      // real user edit will create the row through setValue/queuePersist.
      setHasLoaded(true);
    };

    void loadValue();

    if (!client) return undefined;

    const channel = client
      .channel(`app-state-${key}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'app_state', filter: `key=eq.${key}` },
        (payload) => {
          const row = payload.new as AppStateRow<T>;
          if (!row?.key || row.key !== key) return;
          serverValueRef.current = row.value;
          if (pendingWritesRef.current === 0) applyServerValue(row);
        },
      )
      .subscribe();

    return () => {
      cancelled = true;
      void client.removeChannel(channel);
    };
  }, [key]);

  const setValue = (value: T | ((currentValue: T) => T)) => {
    const baseValue = valueRef.current;
    const nextValue = value instanceof Function ? value(baseValue) : value;
    if (jsonEqual(baseValue, nextValue)) return;
    localWriteVersionRef.current += 1;
    const localVersion = localWriteVersionRef.current;
    valueRef.current = nextValue;
    setStoredValue(nextValue);

    try {
      window.localStorage.setItem(key, JSON.stringify(nextValue));
    } catch (error) {
      console.error(`Error saving ${key} to localStorage:`, error);
    }

    queuePersist(baseValue, nextValue, localVersion);
  };

  return [storedValue, setValue, hasLoaded] as const;
}
