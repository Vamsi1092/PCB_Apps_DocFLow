import { ArrowDown, ArrowUp, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { RED, GREEN } from '@/lib/theme';

export type KpiAccent = 'default' | 'red' | 'green';

interface KpiCardProps {
  icon: LucideIcon;
  value: string;
  label: string;
  trend: string;
  accent?: KpiAccent;
  onClick?: () => void;
}

const ACCENTS: Record<KpiAccent, {
  border: string;
  iconBg: string;
  iconColor: string;
  value: string;
  trend: string;
  trendWeight: string;
}> = {
  default: { border: 'var(--border)', iconBg: 'var(--tint)', iconColor: 'var(--navy)', value: 'var(--text)', trend: 'var(--muted)', trendWeight: 'font-semibold' },
  red: { border: '#f3d0d0', iconBg: 'var(--redsoft)', iconColor: RED, value: RED, trend: RED, trendWeight: 'font-bold' },
  green: { border: '#bbf0c9', iconBg: 'var(--greensoft)', iconColor: GREEN, value: GREEN, trend: GREEN, trendWeight: 'font-bold' },
};

/** Compact metric card (icon + big number + label + trend). `accent` drives
 * the semantic color rule: 'default' = brand/neutral, 'red' = needs
 * attention, 'green' = performing well. */
export function KpiCard({ icon: Icon, value, label, trend, accent = 'default', onClick }: KpiCardProps) {
  const a = ACCENTS[accent];
  const isDown = trend.startsWith('-') || trend.startsWith('−');
  const TrendIcon = isDown ? ArrowDown : ArrowUp;
  const trendText = trend.replace(/^[+\-−]/, '');
  return (
    <div
      className={cn(
        'pcb-lift rounded-xl bg-surface p-[15px] shadow-[0_1px_2px_rgba(16,24,40,.04)]',
        onClick && 'cursor-pointer',
      )}
      style={{ border: `1px solid ${a.border}` }}
      onClick={onClick}
    >
      <div className="mb-[13px] flex items-center justify-between">
        <div
          className="flex h-9 w-9 items-center justify-center rounded-[9px]"
          style={{ background: a.iconBg, color: a.iconColor }}
        >
          <Icon size={18} />
        </div>
        <span className={cn('flex items-center gap-[2px] text-[11.5px]', a.trendWeight)} style={{ color: a.trend }}>
          <TrendIcon size={11} strokeWidth={2.75} />
          {trendText}
        </span>
      </div>
      <div
        className="text-[27px] font-extrabold leading-none tracking-[-.03em] tabular-nums"
        style={{ color: a.value }}
      >
        {value}
      </div>
      <div className="mt-[5px] text-[12.5px] font-medium text-muted-foreground">{label}</div>
    </div>
  );
}
