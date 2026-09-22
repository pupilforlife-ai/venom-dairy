import { useEffect, useRef, useState } from 'react';
import { supabase } from '../lib/supabase';

interface AppStateRow<T> {
  key: string;
  value: T;
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

  useEffect(() => {
    let cancelled = false;

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
        valueRef.current = data.value;
        setStoredValue(data.value);
        window.localStorage.setItem(key, JSON.stringify(data.value));
        return;
      }

      const localValue = valueRef.current;
      const { error: seedError } = await supabase
        .from('app_state')
        .upsert({ key, value: localValue }, { onConflict: 'key' });

      if (seedError) {
        console.error(`Error seeding ${key} in Supabase:`, seedError);
      }
    };

    void loadValue();

    return () => {
      cancelled = true;
    };
  }, [key]);

  const setValue = (value: T | ((currentValue: T) => T)) => {
    const nextValue = value instanceof Function ? value(valueRef.current) : value;
    valueRef.current = nextValue;
    setStoredValue(nextValue);

    try {
      window.localStorage.setItem(key, JSON.stringify(nextValue));
    } catch (error) {
      console.error(`Error saving ${key} to localStorage:`, error);
    }

    if (supabase) {
      void supabase
        .from('app_state')
        .upsert({ key, value: nextValue }, { onConflict: 'key' })
        .then(({ error }) => {
          if (error) console.error(`Error saving ${key} to Supabase:`, error);
        });
    }
  };

  return [storedValue, setValue] as const;
}
