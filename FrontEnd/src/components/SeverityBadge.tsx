import { cn } from '@/lib/utils';
import { sevColor, type Severity } from '@/lib/theme';

const LABELS: Record<Severity, string> = {
  critical: 'Critical',
  high: 'High',
  medium: 'Medium',
  low: 'Low',
};

interface SeverityBadgeProps {
  severity: Severity;
  className?: string;
}

/** Severity pill: colored dot (single navy/red intensity ramp) + label.
 * Red text/background is reserved for 'critical' — everything else stays
 * neutral so red keeps meaning "needs action now". */
export function SeverityBadge({ severity, className }: SeverityBadgeProps) {
  const critical = severity === 'critical';
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 py-[3px] text-xs font-semibold',
        critical ? 'border-[#f3c0c0] bg-redsoft text-destructive' : 'border-border bg-surface2 text-text3',
        className,
      )}
    >
      <span className="h-[7px] w-[7px] rounded-full" style={{ background: sevColor(severity) }} />
      {LABELS[severity]}
    </span>
  );
}
