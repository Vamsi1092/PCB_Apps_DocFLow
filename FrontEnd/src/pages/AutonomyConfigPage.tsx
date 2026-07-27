import { useMemo, Fragment } from 'react';
import { Eye, Info, Lock, RotateCcw, Zap, type LucideIcon } from 'lucide-react';
import { docTypes, autonomyStages, autonomyGrid, type AutonomyLevel, type AutonomyCell } from '@/data';
import { useLocalStorage } from '@/hooks/useLocalStorage';

const ORDER: AutonomyLevel[] = ['auto', 'assist', 'human'];

const META: Record<Exclude<AutonomyLevel, 'na'>, { label: string; icon: LucideIcon; bg: string; border: string; color: string }> = {
  auto: { label: 'Autonomous', icon: Zap, bg: '#ECFDF5', border: '#A7F3D0', color: '#0D9488' },
  assist: { label: 'AI-Assisted', icon: Eye, bg: '#F5F1FE', border: '#E4D9FB', color: '#7C3AED' },
  human: { label: 'Human-Required', icon: Lock, bg: '#FEF3C7', border: '#FDE68A', color: '#B45309' },
};

const MATURITY_BLUE = '#3B82F6';
const STORAGE_KEY = 'docflow.autonomyGrid.v1';

function flatten(): Record<string, AutonomyCell> {
  const g: Record<string, AutonomyCell> = {};
  docTypes.forEach((dt) => autonomyGrid[dt].forEach((c, i) => { g[`${dt}|${i}`] = c; }));
  return g;
}

// The shipped-default grid, for the "reset to default" action and for detecting
// whether the current (persisted) grid has been customized away from it.
const DEFAULT_GRID = flatten();

function Legend({ icon: Icon, bg, color, bd, text }: { icon: LucideIcon; bg: string; color: string; bd?: string; text: string }) {
  return (
    <span
      className="inline-flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-[12.5px] font-semibold"
      style={{ background: bg, color, border: `1px solid ${bd ?? bg}` }}
    >
      <Icon size={13} />
      {text}
    </span>
  );
}

export default function AutonomyConfigPage() {
  // Persisted locally so edits survive a refresh; the summary stats below are
  // derived from THIS state (not the static import) so they always reflect
  // whatever the user has actually configured.
  const [grid, setGrid] = useLocalStorage<Record<string, AutonomyCell>>(STORAGE_KEY, flatten);

  const cycle = (dt: string, i: number) => {
    const k = `${dt}|${i}`;
    setGrid((prev) => {
      const cur = prev[k];
      if (cur.level === 'na' || (cur.level === 'human' && cur.gate === 'locked')) return prev;
      const next = ORDER[(ORDER.indexOf(cur.level) + 1) % ORDER.length];
      return { ...prev, [k]: { level: next, gate: next === 'human' ? (cur.gate ?? 'maturity') : undefined } };
    });
  };

  const resetToDefault = () => {
    if (window.confirm('Reset the autonomy grid to its default configuration? This discards your local customizations.')) {
      setGrid(flatten());
    }
  };

  // Derived entirely from the current `grid` state — this is the fix for the bug
  // where these used to read the static `autonomyGrid` import and never moved
  // when a cell was edited.
  const { statCards, totalCells, naCount, changedCount } = useMemo(() => {
    const cells = Object.values(grid);
    const total = cells.length;
    const countLevel = (lvl: AutonomyLevel) => cells.filter((c) => c.level === lvl).length;
    const changed = docTypes.reduce((n, dt) => {
      return n + autonomyStages.reduce((m, _s, i) => {
        const key = `${dt}|${i}`;
        const cur = grid[key];
        const def = DEFAULT_GRID[key];
        return m + (cur && def && (cur.level !== def.level || cur.gate !== def.gate) ? 1 : 0);
      }, 0);
    }, 0);
    return {
      totalCells: total,
      naCount: countLevel('na'),
      changedCount: changed,
      statCards: [
        { level: 'auto' as const, count: countLevel('auto'), sub: 'AI acts alone' },
        { level: 'assist' as const, count: countLevel('assist'), sub: 'AI proposes, human confirms' },
        { level: 'human' as const, count: countLevel('human'), sub: 'Decision reserved for a person' },
      ],
    };
  }, [grid]);
  const pct = (n: number) => (totalCells ? Math.round((n / totalCells) * 100) : 0);

  return (
    <div className="pcb-view">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="mb-[3px] text-[23px] font-bold uppercase tracking-[.01em]">Autonomy Configuration</h1>
          <p className="max-w-[820px] text-[13.5px] leading-[1.55] text-muted-foreground">
            Set how much authority the AI agent has at each stage of the AP document lifecycle.
            Configure what the AI can do alone, what it proposes for human confirmation, and what
            must always be a human decision. Saved locally on this device.
          </p>
        </div>
        <div className="flex flex-none items-center gap-2">
          {changedCount > 0 && (
            <span className="rounded-full border border-line bg-surface2 px-2.5 py-1 text-[11.5px] font-semibold text-text2">
              {changedCount} cell{changedCount === 1 ? '' : 's'} customized
            </span>
          )}
          <button
            type="button"
            onClick={resetToDefault}
            disabled={changedCount === 0}
            className="pcb-btn flex h-[32px] items-center gap-1.5 rounded-lg border border-line bg-surface px-3 text-[12px] font-semibold text-text2 disabled:opacity-40"
          >
            <RotateCcw size={13} />
            Reset to default
          </button>
        </div>
      </div>

      <div className="mb-4 flex flex-wrap items-stretch justify-between gap-4">
        <div className="flex flex-1 flex-wrap gap-3">
          {statCards.map((s) => {
            const m = META[s.level];
            const Icon = m.icon;
            return (
              <div
                key={s.level}
                className="flex flex-1 items-start gap-3 rounded-xl border p-4"
                style={{ background: m.bg, borderColor: m.border, minWidth: 230 }}
              >
                <span
                  className="flex h-9 w-9 flex-none items-center justify-center rounded-[9px]"
                  style={{ background: '#fff', color: m.color }}
                >
                  <Icon size={17} />
                </span>
                <div>
                  <div className="flex items-baseline gap-1.5 leading-none">
                    <span className="text-[21px] font-extrabold tracking-[-.02em] tabular-nums" style={{ color: m.color }}>
                      {s.count}
                    </span>
                    <span className="text-[14px] font-bold" style={{ color: m.color }}>{m.label}</span>
                    <span className="text-[12.5px] font-semibold text-muted-foreground">({pct(s.count)}%)</span>
                  </div>
                  <div className="mt-1.5 text-[12px] text-muted-foreground">{s.sub}</div>
                </div>
              </div>
            );
          })}
        </div>
        <div className="flex flex-col items-end justify-center whitespace-nowrap text-right text-[12.5px] text-muted-foreground">
          <span>{totalCells - naCount} configurable stages · {naCount} N/A</span>
          <span>{docTypes.length} document types × {autonomyStages.length} workflow stages</span>
        </div>
      </div>

      <div className="mb-4 flex items-start gap-3 rounded-xl border p-4" style={{ background: '#FEFBF0', borderColor: '#F0E6C8' }}>
        <Info size={17} className="mt-0.5 flex-none text-muted-foreground" />
        <div className="text-[13px] leading-[1.6] text-text2">
          <strong className="font-bold text-foreground">Design principle:</strong> Some gates are
          human today because the AI model is still maturing — these can be promoted as accuracy
          improves. Others remain human by design — they are governance and compliance
          checkpoints, not capability gaps, and should never be automated.
          <div className="mt-2 flex flex-wrap gap-4">
            <span className="inline-flex items-center gap-1.5 text-[12.5px] font-semibold" style={{ color: MATURITY_BLUE }}>
              <span className="h-2 w-2 rounded-full" style={{ background: MATURITY_BLUE }} />
              Maturity-gated
            </span>
            <span className="inline-flex items-center gap-1.5 text-[12.5px] font-semibold" style={{ color: '#B45309' }}>
              <Lock size={12} />
              Permanently locked
            </span>
          </div>
        </div>
      </div>

      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2.5">
          <Legend icon={Zap} bg={META.auto.bg} color={META.auto.color} bd={META.auto.border} text="Autonomous" />
          <Legend icon={Eye} bg={META.assist.bg} color={META.assist.color} bd={META.assist.border} text="AI-Assisted" />
          <Legend icon={Lock} bg={META.human.bg} color={META.human.color} bd={META.human.border} text="Human-Required" />
          <span className="inline-flex items-center gap-2 rounded-lg border border-dashed px-2.5 py-1.5 text-[12.5px] font-semibold text-faint" style={{ borderColor: 'var(--border2)' }}>
            — N/A
          </span>
        </div>
        <div className="flex flex-wrap gap-4 text-[12px] font-semibold">
          <span className="inline-flex items-center gap-1.5" style={{ color: MATURITY_BLUE }}>
            <span className="h-2 w-2 rounded-full" style={{ background: MATURITY_BLUE }} />
            Maturity-gated (promotable)
          </span>
          <span className="inline-flex items-center gap-1.5" style={{ color: '#B45309' }}>
            <Lock size={11} />
            Locked (compliance gate)
          </span>
        </div>
      </div>

      <div className="overflow-x-auto rounded-xl border border-border bg-surface p-[18px_20px] shadow-[0_1px_2px_rgba(16,24,40,.04)]">
        <div className="grid gap-2" style={{ gridTemplateColumns: '170px repeat(7,minmax(120px,1fr))', minWidth: 1000 }}>
          <div className="flex items-end pb-1.5 text-[11.5px] font-bold uppercase tracking-[.05em] text-faint">
            Document Type
          </div>
          {autonomyStages.map((sg) => (
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
              {autonomyStages.map((stageName, i) => {
                const cell = grid[`${dt}|${i}`];

                if (cell.level === 'na') {
                  return (
                    <div
                      key={i}
                      className="flex h-10 items-center justify-center rounded-[9px] border border-dashed text-[13px] text-faint"
                      style={{ borderColor: 'var(--border2)' }}
                      aria-label={`${dt}, ${stageName} stage: not applicable`}
                    >
                      —
                    </div>
                  );
                }

                const m = META[cell.level];
                const Icon = m.icon;
                const locked = cell.level === 'human' && cell.gate === 'locked';
                const maturityGated = cell.level === 'human' && cell.gate === 'maturity';
                const gateNote = locked ? ' — compliance-locked, cannot be changed' : maturityGated ? ' — maturity-gated, promotable as the AI improves' : '';

                return (
                  <button
                    key={i}
                    type="button"
                    onClick={() => cycle(dt, i)}
                    disabled={locked}
                    aria-label={`${dt}, ${stageName} stage: ${m.label}${gateNote}${locked ? '' : '. Click to change.'}`}
                    className={`pcb-cell relative flex h-10 items-center justify-center gap-1.5 rounded-[9px] font-sans transition-all ${locked ? 'cursor-default' : ''}`}
                    style={{ background: m.bg, color: m.color, border: `1px solid ${m.border}` }}
                  >
                    {maturityGated && (
                      <span
                        className="absolute -right-1 -top-1 h-[9px] w-[9px] rounded-full border-2 border-surface"
                        style={{ background: MATURITY_BLUE }}
                      />
                    )}
                    <Icon size={13} color={m.color} />
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
