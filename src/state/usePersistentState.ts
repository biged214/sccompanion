import { useEffect, useState, type Dispatch, type SetStateAction } from 'react';

const UI_STATE_PREFIX = 'sc-companion:ui-state:v1:';

export function usePersistentState<T>(key: string, initialValue: T): [T, Dispatch<SetStateAction<T>>] {
  const storageKey = `${UI_STATE_PREFIX}${key}`;
  const [value, setValue] = useState<T>(() => {
    try {
      const stored = window.localStorage.getItem(storageKey);
      if (stored === null) return initialValue;
      const parsed = JSON.parse(stored) as T;
      return isCompatibleValue(parsed, initialValue) ? parsed : initialValue;
    } catch {
      return initialValue;
    }
  });

  useEffect(() => {
    try {
      window.localStorage.setItem(storageKey, JSON.stringify(value));
    } catch {
      // UI state persistence is optional when storage is unavailable or full.
    }
  }, [storageKey, value]);

  return [value, setValue];
}

export function hasPersistentState(key: string): boolean {
  try {
    return window.localStorage.getItem(`${UI_STATE_PREFIX}${key}`) !== null;
  } catch {
    return false;
  }
}

function isCompatibleValue<T>(value: T, initialValue: T): boolean {
  if (initialValue === null) return value === null || typeof value === 'number';
  if (Array.isArray(initialValue)) return Array.isArray(value);
  return typeof value === typeof initialValue;
}
