import { Check } from 'lucide-react';

/** Shared toast banner — pair with `useToast()`. Renders nothing when `message`
 * is null. `aria-live="polite"` so screen readers announce it without stealing focus. */
export function Toast({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <div
      role="status"
      aria-live="polite"
      className="pcb-view fixed bottom-6 left-1/2 z-[100] flex -translate-x-1/2 items-center gap-[9px] rounded-[10px] bg-[#111a33] px-5 py-3 text-[13.5px] font-semibold text-white shadow-[0_8px_30px_rgba(0,0,0,.28)]"
    >
      <Check size={17} color="#5eead4" />
      {message}
    </div>
  );
}
