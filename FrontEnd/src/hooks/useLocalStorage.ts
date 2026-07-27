import { useEffect, useState } from 'react';

/**
 * Generic localStorage-backed state, for the frontend-only persistence used by
 * theme preference, the Autonomy grid, and Settings sections. Reads once on
 * mount (falling back to `initialValue` if unset or unparseable) and writes on
 * every change. Not shared across tabs/windows — this is a single-tab demo
 * persistence layer, not a sync mechanism.
 */
export function useLocalStorage<T>(key: string, initialValue: T | (() => T)) {
  const [value, setValue] = useState<T>(() => {
    try {
      const stored = window.localStorage.getItem(key);
      if (stored != null) return JSON.parse(stored) as T;
    } catch {
      // Corrupt/foreign value under this key — fall through to the initial value.
    }
    return initialValue instanceof Function ? initialValue() : initialValue;
  });

  useEffect(() => {
    try {
      window.localStorage.setItem(key, JSON.stringify(value));
    } catch {
      // Storage unavailable (private browsing, quota) — persistence is best-effort.
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, value]);

  return [value, setValue] as const;
}
