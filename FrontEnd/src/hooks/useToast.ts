import { useEffect, useRef, useState } from 'react';

const DEFAULT_DURATION_MS = 2600;

/**
 * A small local (per-page) toast: one message at a time, auto-dismissed after
 * `duration`. Replaces the 4 near-duplicate toast implementations that used to
 * exist across Approvals/Settings/Inbox/TopNav — each page calls this hook and
 * renders <Toast message={toast} /> instead of hand-rolling its own timer.
 */
export function useToast(duration = DEFAULT_DURATION_MS) {
  const [message, setMessage] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => () => clearTimeout(timer.current), []);

  const showToast = (text: string, overrideDuration?: number) => {
    setMessage(text);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setMessage(null), overrideDuration ?? duration);
  };

  return { toast: message, showToast };
}
