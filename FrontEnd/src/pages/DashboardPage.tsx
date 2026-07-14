import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  AlarmClock, AlertTriangle, Check, CheckCircle2, ChevronDown, Clock, Eye,
  Filter, RefreshCw, Sparkles, Truck, type LucideIcon,
} from 'lucide-react';
import { KpiCard, type KpiAccent } from '@/components/KpiCard';
import { GREEN, RED, sevColor } from '@/lib/theme';
import { pipeline, sla, severity, kpiStrip } from '@/data';

interface KpiDef {
  icon: LucideIcon;
  value: string;
  label: string;
  trend: string;
  accent: KpiAccent;
  to: string;
}

const KPIS: KpiDef[] = [
  { icon: Truck, value: '1,284', label: 'Active Invoices', trend: '+8.2%', accent: 'default', to: '/worklist' },
  { icon: Eye, value: '218', label: 'Pending Review', trend: '+2.4%', accent: 'default', to: '/worklist' },
  { icon: AlertTriangle, value: '87', label: 'Open Exceptions', trend: '+12', accent: 'red', to: '/exceptions' },
  { icon: Clock, value: '342', label: 'Pending Approvals', trend: '−3.1%', accent: 'default', to: '/approvals' },
  { icon: CheckCircle2, value: '156', label: 'Posting Ready', trend: '+9.7%', accent: 'green', to: '/worklist' },
  { icon: AlarmClock, value: '6', label: 'SLA Breached', trend: '+3', accent: 'red', to: '/worklist' },
];

const TIME_OPTIONS = ['Today', 'This Week', 'This Month', 'Last 100'];
const MONTH_ABBR = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export default function DashboardPage() {
  const navigate = useNavigate();
  const [pipe, setPipe] = useState(false);
  const [count, setCount] = useState(0);
  const [tf, setTf] = useState('This Week');
  const [tfOpen, setTfOpen] = useState(false);
  const [customOpen, setCustomOpen] = useState(false);
  const [cfrom, setCfrom] = useState('');
  const [cto, setCto] = useState('');
  const [syncing, setSyncing] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const tt = useRef<ReturnType<typeof setTimeout>>();
  const st = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    const t0 = setTimeout(() => setPipe(true), 140);
    const start = Date.now();
    const dur = 1150;
    const ci = setInterval(() => {
      const t = Math.min(1, (Date.now() - start) / dur);
      setCount(1 - Math.pow(1 - t, 3));
      if (t >= 1) clearInterval(ci);
    }, 33);
    return () => { clearTimeout(t0); clearInterval(ci); clearTimeout(tt.current); clearTimeout(st.current); };
  }, []);

  const doSync = () => {
    if (syncing) return;
    setSyncing(true);
    clearTimeout(st.current);
    st.current = setTimeout(() => { setSyncing(false); setToast('Outlook synced — 6 new documents captured'); }, 1600);
    clearTimeout(tt.current);
    tt.current = setTimeout(() => setToast(null), 4200);
  };

  const applyCustom = () => {
    if (!cfrom || !cto) return;
    const f = (v: string) => { const p = v.split('-'); return MONTH_ABBR[+p[1] - 1] + ' ' + (+p[2]); };
    setTf(f(cfrom) + ' – ' + f(cto));
    setTfOpen(false);
    setCustomOpen(false);
  };

  const cprog = count;
  const pipelineSteps = pipeline.map((s, i) => ({
    name: s.name,
    n: Math.round(s.v * cprog).toLocaleString('en-US'),
    hasConn: i > 0,
    delay: i * 0.11,
    isLast: i === pipeline.length - 1,
  }));

  return (
    <div className="pcb-view">
      <div className="mb-[18px] flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="mb-[3px] text-[23px] font-bold tracking-[-.02em]">Payables Overview</h1>
          <p className="text-[13.5px] text-muted-foreground">
            Monday, July 13 · <span className="font-semibold" style={{ color: GREEN }}>Live</span> · Last sync 2 min ago
          </p>
        </div>
        <div className="flex gap-2">
          <div className="relative">
            <button
              type="button"
              onClick={() => setTfOpen((o) => !o)}
              className="pcb-btn flex h-[38px] items-center gap-2 rounded-[9px] border border-line bg-surface px-3.5 text-[13px] font-semibold text-text2"
            >
              <Filter size={15} />{tf}
              <span
                className="ml-0.5 flex opacity-60 transition-transform"
                style={{ transform: tfOpen ? 'rotate(180deg)' : 'none' }}
              >
                <ChevronDown size={13} />
              </span>
            </button>
            {tfOpen && (
              <div className="pcb-view absolute right-0 top-11 z-30 min-w-[170px] rounded-[10px] border border-border bg-surface p-[5px] shadow-[0_10px_30px_rgba(16,24,40,.14)]">
                {TIME_OPTIONS.map((o) => {
                  const on = tf === o;
                  return (
                    <button
                      key={o}
                      type="button"
                      onClick={() => { setTf(o); setTfOpen(false); setCustomOpen(false); }}
                      className="flex h-9 w-full items-center justify-between gap-2.5 rounded-[7px] border-none px-[11px] text-[13px]"
                      style={{ background: on ? 'var(--tint)' : 'transparent', color: on ? 'var(--navy)' : 'var(--text2)', fontWeight: on ? 700 : 500 }}
                    >
                      <span>{o}</span>
                      <span className="flex text-navy" style={{ opacity: on ? 1 : 0 }}><Check size={14} /></span>
                    </button>
                  );
                })}
                <button
                  type="button"
                  onClick={() => setCustomOpen((v) => !v)}
                  className="mt-1 flex h-9 w-full items-center justify-between gap-2.5 rounded-[7px] border-none border-t border-border2 px-[11px] text-[13px]"
                  style={{ background: customOpen ? 'var(--tint)' : 'transparent', color: customOpen ? 'var(--navy)' : 'var(--text2)', fontWeight: customOpen ? 700 : 500 }}
                >
                  <span>Custom Range</span>
                  <span className="flex text-navy" style={{ opacity: customOpen ? 1 : 0 }}><Check size={14} /></span>
                </button>
                {customOpen && (
                  <div className="flex flex-col gap-2 px-1.5 pb-1 pt-2">
                    <label className="text-[11px] font-bold uppercase tracking-[.04em] text-faint">
                      From
                      <input
                        type="date"
                        value={cfrom}
                        onChange={(e) => setCfrom(e.target.value)}
                        className="mt-1 h-[34px] w-full rounded-lg border border-line bg-surface px-2.5 font-sans text-[13px] text-foreground"
                      />
                    </label>
                    <label className="text-[11px] font-bold uppercase tracking-[.04em] text-faint">
                      To
                      <input
                        type="date"
                        value={cto}
                        onChange={(e) => setCto(e.target.value)}
                        className="mt-1 h-[34px] w-full rounded-lg border border-line bg-surface px-2.5 font-sans text-[13px] text-foreground"
                      />
                    </label>
                    <button
                      type="button"
                      onClick={applyCustom}
                      className="mt-0.5 h-[34px] rounded-lg border-none bg-navy text-[12.5px] font-semibold text-white"
                    >
                      Apply range
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
          <button
            type="button"
            onClick={doSync}
            className="pcb-btn flex h-[38px] items-center gap-2 rounded-[9px] border-none bg-navy px-4 text-[13px] font-semibold text-white shadow-[0_1px_2px_rgba(30,58,138,.3)]"
          >
            <span className="flex origin-center" style={{ animation: syncing ? 'pcbSpin .8s linear infinite' : 'none' }}>
              <RefreshCw size={15} />
            </span>
            {syncing ? 'Syncing…' : 'Sync Outlook'}
          </button>
        </div>
      </div>

      <div className="mb-[18px] grid grid-cols-6 gap-3">
        {KPIS.map((k) => (
          <KpiCard key={k.label} icon={k.icon} value={k.value} label={k.label} trend={k.trend} accent={k.accent} onClick={() => navigate(k.to)} />
        ))}
      </div>

      <div className="mb-[18px] rounded-xl border border-border bg-surface p-[20px_22px] shadow-[0_1px_2px_rgba(16,24,40,.04)]">
        <div className="mb-5 flex items-center justify-between">
          <div className="text-xs font-bold uppercase tracking-[.06em] text-muted-foreground">Document Pipeline</div>
          <div className="text-[12.5px] text-faint">Today · 1,284 ingested</div>
        </div>
        <div className="flex items-start">
          {pipelineSteps.map((s) => (
            <div key={s.name} className="relative flex flex-1 flex-col items-center text-center">
              {s.hasConn && (
                <div
                  className="absolute top-[19px] h-1 overflow-hidden rounded"
                  style={{ left: 'calc(-50% + 20px)', right: 'calc(50% + 20px)', background: 'var(--border2)' }}
                >
                  <div
                    className="h-full rounded"
                    style={{
                      width: pipe ? '100%' : '0%',
                      background: 'linear-gradient(90deg,var(--navy),var(--navy2),var(--navy))',
                      backgroundSize: '200% 100%',
                      animation: 'pcbShimmer 2.6s linear infinite',
                      transition: `width .8s cubic-bezier(.4,0,.2,1) ${s.delay}s`,
                    }}
                  />
                  <div
                    className="absolute top-0 h-full w-[34%] rounded"
                    style={{
                      background: 'linear-gradient(90deg,rgba(255,255,255,0),rgba(255,255,255,.85),rgba(255,255,255,0))',
                      opacity: pipe ? 1 : 0,
                      animation: `pcbFlow 1.9s linear infinite ${0.4 + s.delay}s`,
                    }}
                  />
                </div>
              )}
              <div
                className="pcb-node relative z-[2] flex h-10 w-10 items-center justify-center rounded-full bg-navy text-white"
                style={{
                  boxShadow: '0 2px 6px rgba(30,58,138,.28)',
                  opacity: pipe ? 1 : 0.35,
                  transform: pipe ? 'scale(1)' : 'scale(.85)',
                  transition: `opacity .5s ease ${s.delay}s, transform .5s ease ${s.delay}s`,
                  animation: pipe && s.isLast ? 'pcbPulse 2.4s ease-in-out infinite 1s' : 'none',
                }}
              >
                <Check size={17} color="#fff" />
              </div>
              <div className="mt-2.5 text-[22px] font-extrabold leading-none tracking-[-.02em] tabular-nums">{s.n}</div>
              <div className="mt-[3px] text-[12.5px] font-medium text-muted-foreground">{s.name}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="mb-[18px] grid grid-cols-[1.35fr_1fr] gap-4">
        <div className="overflow-hidden rounded-xl border border-border bg-surface shadow-[0_1px_2px_rgba(16,24,40,.04)]">
          <div className="flex items-center justify-between border-b border-border2 px-[18px] py-[15px]">
            <div className="flex items-center gap-[9px]">
              <span className="text-[14.5px] font-bold">SLA at Risk</span>
              <span
                className="rounded-full border px-2 py-0.5 text-[11.5px] font-bold"
                style={{ color: RED, background: 'var(--redsoft)', borderColor: '#f3d0d0' }}
              >
                4 due &lt;3h
              </span>
            </div>
            <a href="#" className="text-[12.5px] font-semibold">View all</a>
          </div>
          <div>
            {sla.map((r) => {
              const hi = r.risk === 'high';
              return (
                <div key={r.inv} className="pcb-row flex cursor-pointer items-center gap-3 border-b border-borderf px-[18px] py-3">
                  <span className="h-[9px] w-[9px] flex-none rounded-full" style={{ background: hi ? RED : 'var(--faint)' }} />
                  <div className="min-w-0 flex-1">
                    <div className="text-[13.5px] font-semibold">{r.vendor}</div>
                    <div className="text-xs tabular-nums text-faint">{r.inv} · {r.stage}</div>
                  </div>
                  <div className="text-right">
                    <div className="text-[13px] font-bold tabular-nums" style={{ color: hi ? RED : 'var(--text3)' }}>{r.due}</div>
                    <div className="text-xs tabular-nums text-muted-foreground">{r.amount}</div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="overflow-hidden rounded-xl border border-border bg-surface shadow-[0_1px_2px_rgba(16,24,40,.04)]">
          <div className="flex items-center justify-between border-b border-border2 px-[18px] py-[15px]">
            <span className="text-[14.5px] font-bold">Exceptions by Severity</span>
            <a href="#" className="text-[12.5px] font-semibold">Triage</a>
          </div>
          <div className="p-1.5 px-2">
            {severity.map((s) => (
              <div key={s.label} className="pcb-row flex items-center gap-3 rounded-lg px-3 py-[11px]">
                <span className="h-2.5 w-2.5 flex-none rounded-full" style={{ background: sevColor(s.sev) }} />
                <span className="flex-1 text-[13.5px] font-semibold text-text2">{s.label}</span>
                <div className="h-[7px] w-[120px] overflow-hidden rounded-md bg-border2">
                  <div className="h-full rounded-md" style={{ width: `${s.pct}%`, background: sevColor(s.sev) }} />
                </div>
                <span className="w-[30px] text-right text-sm font-extrabold tabular-nums">{s.n}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="mb-[18px] flex items-start gap-[15px] rounded-xl border border-border bg-tint p-[17px_19px]">
        <div className="flex h-[38px] w-[38px] flex-none items-center justify-center rounded-[10px] bg-navy text-white shadow-[0_2px_8px_rgba(30,58,138,.3)]">
          <Sparkles size={20} color="#fff" />
        </div>
        <div className="flex-1">
          <div className="mb-1 flex items-center gap-2">
            <span className="text-[13.5px] font-bold text-navy">AI Insight</span>
            <span className="rounded-full border border-border bg-surface px-[7px] py-px text-[10.5px] font-bold uppercase tracking-[.05em] text-muted-foreground">
              Pattern detected
            </span>
          </div>
          <p className="text-[13.5px] leading-[1.55] text-text2">
            Match rate for <strong>Nimbus Logistics</strong> dropped 6 pts this week — 3 of 9 critical exceptions
            trace to their new tax-line format. A GL-mapping rule would auto-resolve an estimated{' '}
            <strong>~28 invoices/week</strong>.
          </p>
        </div>
        <div className="flex flex-none items-center gap-2 self-center">
          <button type="button" className="pcb-btn h-[34px] rounded-lg border border-border bg-surface px-[13px] text-[12.5px] font-semibold text-navy">
            Dismiss
          </button>
          <button type="button" className="pcb-btn h-[34px] rounded-lg border-none bg-navy px-3.5 text-[12.5px] font-semibold text-white">
            Create rule
          </button>
        </div>
      </div>

      <div className="grid grid-cols-4 gap-3.5">
        {kpiStrip.map((k) => (
          <div key={k.label} className="rounded-xl border border-border bg-surface p-[15px_17px] shadow-[0_1px_2px_rgba(16,24,40,.04)]">
            <div className="flex items-center justify-between">
              <span className="text-[12.5px] font-medium text-muted-foreground">{k.label}</span>
              <span className="text-xs font-semibold" style={{ color: k.good ? GREEN : 'var(--muted)' }}>{k.trend}</span>
            </div>
            <div
              className="mt-[9px] text-[26px] font-extrabold leading-none tracking-[-.03em] tabular-nums"
              style={{ color: k.good ? GREEN : 'var(--text)' }}
            >
              {k.value}
            </div>
            <div className="mt-2.5 h-[5px] overflow-hidden rounded bg-border2">
              <div className="h-full rounded" style={{ width: `${k.pct}%`, background: k.good ? GREEN : 'var(--navy)' }} />
            </div>
          </div>
        ))}
      </div>

      {toast && (
        <div className="pcb-view fixed bottom-6 left-1/2 z-[100] flex -translate-x-1/2 items-center gap-[9px] rounded-[10px] bg-[#111a33] px-5 py-3 text-[13.5px] font-semibold text-white shadow-[0_8px_30px_rgba(0,0,0,.28)]">
          <Check size={17} color="#5eead4" />
          {toast}
        </div>
      )}
    </div>
  );
}
