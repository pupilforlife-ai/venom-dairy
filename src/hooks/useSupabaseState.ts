import { useEffect, useRef, useState } from 'react';
import { supabase } from '../lib/supabase';

interface AppStateRow<T> {
  key: string;
  value: T;
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
          return jsonEqual(remoteById.get(id), baseById.get(id));
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

export function useSupabaseState<T>(key: string, initialValue: T) {
  const [storedValue, setStoredValue] = useState<T>(() => readLocalValue(key, initialValue));
  const valueRef = useRef(storedValue);
  // Supabase writes replace the complete JSON document for a key. Serialise
  // them so a slower request cannot finish after a newer edit and restore an
  // older snapshot (this was especially visible when saving several rounds).
  const writeQueueRef = useRef<Promise<void>>(Promise.resolve());
  const localWriteVersionRef = useRef(0);
  const serverValueRef = useRef<T | undefined>(undefined);

  const queuePersist = (baseValue: T, nextValue: T, localVersion: number) => {
    const client = supabase;
    if (!client) return;

    writeQueueRef.current = writeQueueRef.current
      .catch(() => undefined)
      .then(async () => {
        const { data: remoteRow, error: readError } = await client
          .from('app_state')
          .select('key, value')
          .eq('key', key)
          .maybeSingle<AppStateRow<T>>();
        if (readError) console.error(`Error reading latest ${key} before save:`, readError);

        const remoteValue = remoteRow?.value ?? serverValueRef.current ?? baseValue;
        const mergedValue = mergePersistedValue(baseValue, nextValue, remoteValue);
        const { error } = await client
          .from('app_state')
          .upsert({ key, value: mergedValue }, { onConflict: 'key' });
        if (error) console.error(`Error saving ${key} to Supabase:`, error);
        if (error) return;

        serverValueRef.current = mergedValue;
        // If no newer local edit happened while this request was in flight,
        // reflect any preserved remote fields in the visible/local snapshot.
        if (localWriteVersionRef.current === localVersion) {
          valueRef.current = mergedValue;
          setStoredValue(mergedValue);
          window.localStorage.setItem(key, JSON.stringify(mergedValue));
        }
      });
  };

  useEffect(() => {
    let cancelled = false;
    const loadVersion = localWriteVersionRef.current;

    const loadValue = async () => {
      if (!supabase) return;

      const { data, error } = await supabase
        .from('app_state')
        .select('key, value')
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
        if (localWriteVersionRef.current !== loadVersion) return;
        serverValueRef.current = data.value;
        valueRef.current = data.value;
        setStoredValue(data.value);
        window.localStorage.setItem(key, JSON.stringify(data.value));
        return;
      }

      if (localWriteVersionRef.current !== loadVersion) return;
      const localValue = valueRef.current;
      queuePersist(localValue, localValue, loadVersion);
    };

    void loadValue();

    return () => {
      cancelled = true;
    };
  }, [key]);

  const setValue = (value: T | ((currentValue: T) => T)) => {
    const baseValue = valueRef.current;
    const nextValue = value instanceof Function ? value(baseValue) : value;
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

  return [storedValue, setValue] as const;
}
