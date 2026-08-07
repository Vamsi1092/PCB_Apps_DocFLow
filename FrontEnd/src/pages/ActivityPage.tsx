import { useState } from 'react';
import { AlertTriangle, Check, Search, Settings2, User, Zap, type LucideIcon } from 'lucide-react';
import { GREEN, RED } from '@/lib/theme';
import { activity, type ActivityCategory, type ActivityKind } from '@/data';
import { SidebarToggle } from '@/components/SidebarToggle';

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

// Activity has no stable id in the underlying static data (src/data.ts) — build
// one from its own fields so React keys survive filtering/search reordering
// (an array index would not).
function activityKey(a: (typeof activity)[number], i: number): string {
  return `${a.who}-${a.action}-${a.target}-${i}`;
}

export default function ActivityPage() {
  const [filter, setFilter] = useState<'all' | ActivityCategory>('all');
  const [search, setSearch] = useState('');

  const stats = [
    { key: 'all' as const, label: 'Total Events Logged', n: activity.length },
    { key: 'ai' as const, label: 'Automated Actions', n: activity.filter((a) => a.cat === 'ai').length },
    { key: 'human' as const, label: 'Human Actions', n: activity.filter((a) => a.cat === 'human').length },
    { key: 'system' as const, label: 'System Events', n: activity.filter((a) => a.cat === 'system').length },
  ];

  const q = search.trim().toLowerCase();
  const rows = activity
    .map((a, i) => ({ ...a, _key: activityKey(a, i) }))
    .filter((a) => filter === 'all' || a.cat === filter)
    .filter((a) => !q || `${a.who} ${a.action} ${a.target}`.toLowerCase().includes(q));

  return (
    <div className="pcb-view">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <SidebarToggle />
        <div className="relative min-w-[220px] flex-1 sm:max-w-[320px] sm:flex-none">
          <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search documents, vendors, actions…"
            aria-label="Search documents, vendors, or actions"
            className="h-[34px] w-full rounded-lg border border-line bg-surface pl-8 pr-3 text-[12.5px] font-medium text-text2 outline-none placeholder:text-muted-foreground focus:border-navy sm:w-[280px]"
          />
        </div>
      </div>

      <div className="mb-4 grid grid-cols-2 gap-3.5 sm:grid-cols-4">
        {stats.map((x) => {
          const on = filter === x.key;
          return (
            <button
              key={x.key}
              type="button"
              aria-pressed={on}
              onClick={() => setFilter(x.key)}
              className="pcb-lift cursor-pointer rounded-xl bg-surface p-[15px_17px] text-left transition-[border-color]"
              style={{
                border: `1px solid ${on ? 'var(--navy)' : 'var(--border)'}`,
                boxShadow: on ? '0 1px 2px rgba(30,58,138,.14)' : '0 1px 2px rgba(16,24,40,.04)',
                padding: '15px 17px',
              }}
            >
              <div className="text-[28px] font-extrabold leading-none tracking-[-.03em] tabular-nums">{x.n}</div>
              <div className="mt-1.5 text-[12.5px] font-medium text-muted-foreground">{x.label}</div>
            </button>
          );
        })}
      </div>

      {rows.length === 0 ? (
        <div className="rounded-xl border border-border bg-surface p-10 text-center text-[13.5px] text-muted-foreground">
          No matching activity.
        </div>
      ) : (
        <div
          className="rounded-xl border border-border bg-surface shadow-[0_1px_2px_rgba(16,24,40,.04)]"
          style={{ padding: '6px 20px' }}
        >
          {rows.map((a) => {
            const Icon = KIND_ICON[a.kind];
            return (
              <div key={a._key} className="flex items-center gap-[15px] border-b border-borderf py-3.5">
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
      )}
    </div>
  );
}
