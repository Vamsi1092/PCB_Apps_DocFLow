import { useState } from 'react';
import { AlertTriangle, Check, Search, Settings2, User, Zap, type LucideIcon } from 'lucide-react';
import { GREEN, RED } from '@/lib/theme';
import { activity, type ActivityCategory, type ActivityKind } from '@/data';

const KIND_ICON: Record<ActivityKind, LucideIcon> = {
  bolt: Zap,
  check: Check,
  alert: AlertTriangle,
  user: User,
  gear: Settings2,
};

const KIND_COLOR: Record<ActivityKind, string> = {
  bolt: 'var(--navy)',
  check: GREEN,
  alert: RED,
  user: 'var(--muted)',
  gear: 'var(--muted)',
};

const CHIPS: [string, string][] = [
  ['all', 'All'],
  ['ai', 'AI'],
  ['human', 'Human'],
  ['system', 'System'],
];

export default function ActivityPage() {
  const [filter, setFilter] = useState<'all' | ActivityCategory>('all');
  const [search, setSearch] = useState('');

  const stats = [
    { key: 'all' as const, label: 'Total Events Logged', n: activity.length },
    { key: 'ai' as const, label: 'AI Actions', n: activity.filter((a) => a.cat === 'ai').length },
    { key: 'human' as const, label: 'Human Actions', n: activity.filter((a) => a.cat === 'human').length },
    { key: 'system' as const, label: 'System Events', n: activity.filter((a) => a.cat === 'system').length },
  ];

  const q = search.trim().toLowerCase();
  const rows = activity
    .filter((a) => filter === 'all' || a.cat === filter)
    .filter((a) => !q || `${a.who} ${a.action} ${a.target}`.toLowerCase().includes(q));

  return (
    <div className="pcb-view">
      <div className="mb-4">
        <h1 className="mb-[3px] text-[23px] font-bold tracking-[-.02em]">Activity</h1>
        <p className="text-[13.5px] text-muted-foreground">Audit trail · you &amp; the automation engine</p>
      </div>

      <div className="mb-4 grid grid-cols-4 gap-3.5">
        {stats.map((x) => {
          const on = filter === x.key;
          return (
            <div
              key={x.key}
              onClick={() => setFilter(x.key)}
              className="pcb-lift cursor-pointer rounded-xl bg-surface p-[15px_17px] transition-[border-color]"
              style={{
                border: `1px solid ${on ? 'var(--navy)' : 'var(--border)'}`,
                boxShadow: on ? '0 1px 2px rgba(30,58,138,.14)' : '0 1px 2px rgba(16,24,40,.04)',
                padding: '15px 17px',
              }}
            >
              <div className="text-[28px] font-extrabold leading-none tracking-[-.03em] tabular-nums">{x.n}</div>
              <div className="mt-1.5 text-[12.5px] font-medium text-muted-foreground">{x.label}</div>
            </div>
          );
        })}
      </div>

      <div className="mb-4 flex flex-wrap gap-2.5">
        <div className="relative flex min-w-[220px] flex-1 items-center">
          <span className="pointer-events-none absolute left-[13px] flex text-faint">
            <Search size={16} />
          </span>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search documents, vendors, actions…"
            className="h-10 w-full rounded-lg border border-line bg-surface pl-[38px] pr-3.5 text-[13.5px] text-foreground"
          />
        </div>
        <div className="flex gap-[7px]">
          {CHIPS.map(([id, label]) => {
            const on = filter === id;
            return (
              <button
                key={id}
                type="button"
                onClick={() => setFilter(id as 'all' | ActivityCategory)}
                className="pcb-btn h-[38px] whitespace-nowrap rounded-lg px-4 text-[13px] font-semibold"
                style={{
                  border: `1px solid ${on ? 'var(--navy)' : 'var(--line)'}`,
                  background: on ? 'var(--navy)' : 'var(--surface)',
                  color: on ? '#fff' : 'var(--text3)',
                }}
              >
                {label}
              </button>
            );
          })}
        </div>
      </div>

      <div
        className="rounded-xl border border-border bg-surface shadow-[0_1px_2px_rgba(16,24,40,.04)]"
        style={{ padding: '6px 20px' }}
      >
        {rows.map((a, i) => {
          const Icon = KIND_ICON[a.kind];
          return (
            <div key={i} className="flex gap-[15px] border-b border-borderf py-3.5">
              <div
                className="flex h-8 w-8 flex-none items-center justify-center rounded-[9px]"
                style={{ background: KIND_COLOR[a.kind] }}
              >
                <Icon size={15} color="#fff" />
              </div>
              <div className="flex-1">
                <div className="text-[13.5px]">
                  <strong>{a.who}</strong> {a.action} <span className="font-semibold tabular-nums text-navy">{a.target}</span>
                </div>
                <div className="mt-0.5 text-xs text-faint">{a.when}</div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
