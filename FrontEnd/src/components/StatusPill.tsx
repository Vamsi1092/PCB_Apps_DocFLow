import { cn } from '@/lib/utils';

interface StatusPillProps {
  label: string;
  color: string;
  border: string;
  background: string;
  dotColor?: string;
  dot?: boolean;
  className?: string;
}

/** Generic status/tag pill (dot + label) driven entirely by the color props
 * a page passes in — used for Worklist row status and AP Inbox message
 * tags, which each have their own status → color mapping. */
export function StatusPill({ label, color, border, background, dotColor, dot = true, className }: StatusPillProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 py-[3px] text-xs font-semibold',
        className,
      )}
      style={{ color, borderColor: border, background }}
    >
      {dot && <span className="h-1.5 w-1.5 rounded-full" style={{ background: dotColor ?? color }} />}
      {label}
    </span>
  );
}
