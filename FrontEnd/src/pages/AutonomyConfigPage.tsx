import { useState, Fragment } from 'react';
import { Eye, Lock, Zap, type LucideIcon } from 'lucide-react';
import { RED } from '@/lib/theme';
import { docTypes, stages, autonomyGrid, type AutonomyLevel } from '@/data';

const ORDER: AutonomyLevel[] = ['auto', 'assist', 'human'];

const META: Record<AutonomyLevel, { label: string; bg: string; color: string; bd: string; icon: LucideIcon }> = {
  auto: { label: 'Autonomous', bg: 'var(--navy)', color: '#fff', bd: 'var(--navy)', icon: Zap },
  assist: { label: 'AI-Assisted', bg: 'var(--border2)', color: 'var(--text3)', bd: 'var(--border)', icon: Eye },
  human: { label: 'Human', bg: 'var(--surface)', color: 'var(--muted)', bd: 'var(--line)', icon: Lock },
};

function flatten() {
  const g: Record<string, AutonomyLevel> = {};
  docTypes.forEach((dt) => autonomyGrid[dt].forEach((v, i) => { g[`${dt}|${i}`] = v; }));
  return g;
}

function Legend({ icon: Icon, bg, color, bd, text }: { icon: LucideIcon; bg: string; color: string; bd?: string; text: string }) {
  return (
    <span className="inline-flex items-center gap-[7px] text-[12.5px] font-medium text-text3">
      <span
        className="flex h-6 w-6 items-center justify-center rounded-[7px]"
        style={{ background: bg, color, border: bd ? `1px solid ${bd}` : 'none' }}
      >
        <Icon size={13} />
      </span>
      {text}
    </span>
  );
}

export default function AutonomyConfigPage() {
  const [grid, setGrid] = useState<Record<string, AutonomyLevel>>(flatten);

  const cycle = (dt: string, i: number) => {
    const k = `${dt}|${i}`;
    setGrid((prev) => ({ ...prev, [k]: ORDER[(ORDER.indexOf(prev[k]) + 1) % 3] }));
  };

  return (
    <div className="pcb-view">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="mb-[3px] text-[23px] font-bold tracking-[-.02em]">Autonomy Configuration</h1>
          <p className="text-[13.5px] text-muted-foreground">
            Set the automation level per document type &amp; stage. Click a cell to cycle.
          </p>
        </div>
        <div className="flex flex-wrap gap-4">
          <Legend icon={Zap} bg="var(--navy)" color="#fff" text="Autonomous" />
          <Legend icon={Eye} bg="var(--border2)" color="var(--text3)" text="AI-Assisted" />
          <Legend icon={Lock} bg="var(--surface)" color="var(--muted)" bd="var(--line)" text="Human-Required" />
        </div>
      </div>

      <div className="overflow-x-auto rounded-xl border border-border bg-surface p-[18px_20px] shadow-[0_1px_2px_rgba(16,24,40,.04)]">
        <div className="grid gap-2" style={{ gridTemplateColumns: '170px repeat(6,minmax(120px,1fr))', minWidth: 860 }}>
          <div className="flex items-end pb-1.5 text-[11.5px] font-bold uppercase tracking-[.05em] text-faint">
            Doc Type / Stage
          </div>
          {stages.map((sg) => (
            <div
              key={sg}
              className="flex items-end justify-center pb-1.5 text-center text-[11.5px] font-bold uppercase tracking-[.03em] text-muted-foreground"
            >
              {sg}
            </div>
          ))}
          {docTypes.map((dt) => (
            <Fragment key={dt}>
              <div className="flex items-center pr-1.5 text-[13px] font-semibold">{dt}</div>
              {stages.map((_sg, i) => {
                const st = grid[`${dt}|${i}`] || 'auto';
                const m = META[st];
                const breach = dt === 'Non-PO' && i === 2;
                const Icon = m.icon;
                return (
                  <button
                    key={i}
                    type="button"
                    onClick={() => cycle(dt, i)}
                    className="pcb-cell flex h-10 items-center justify-center gap-1.5 rounded-[9px] font-sans transition-all"
                    style={{
                      background: breach ? 'var(--redsoft)' : m.bg,
                      color: breach ? RED : m.color,
                      border: `1px solid ${breach ? '#f3c0c0' : m.bd}`,
                    }}
                  >
                    <Icon size={13} color={breach ? RED : m.color} />
                    <span className="text-[11.5px] font-semibold">{m.label}</span>
                  </button>
                );
              })}
            </Fragment>
          ))}
        </div>
      </div>
    </div>
  );
}
