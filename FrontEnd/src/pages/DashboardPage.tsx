import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  AlarmClock, AlertTriangle, ArrowDown, ArrowUp, Check, CheckCircle2, ChevronDown, Clock, Eye,
  FileSearch, Filter, Inbox, Link2, Loader2, Send, Sparkles, Tag, ThumbsUp, Truck, type LucideIcon,
} from 'lucide-react';
import { KpiCard, type KpiAccent } from '@/components/KpiCard';
import { GREEN, RED, sevColor, type Severity } from '@/lib/theme';
import { exceptions, kpiStrip, type AgingRow } from '@/data';
import {
  getDashboardKpis, getDashboardPipeline, type DashboardKpi, type DashboardDateFilter, type DashboardPipelineStage,
} from '../../api/dashboardApi';
import { getDocumentQueue } from '../../api/documentapi';

interface KpiDef {
  icon: LucideIcon;
  value: string;
  label: string;
  trend: string;
  accent: KpiAccent;
  to: string;
}

const SEVERITIES: Severity[] = ['critical', 'high', 'medium', 'low'];
const SEVERITY_LABELS: Record<Severity, string> = { critical: 'Critical', high: 'High', medium: 'Medium', low: 'Low' };

// Derived from the same `exceptions` list the Exceptions page filters against,
// so this panel's counts can never drift out of sync with what "Triage" leads to.
const severityCounts = SEVERITIES.map((sev) => ({
  sev,
  label: SEVERITY_LABELS[sev],
  n: exceptions.filter((e) => e.sev === sev).length,
}));
const criticalExceptions = exceptions.filter((e) => e.sev === 'critical');
// Highlights one real critical exception instead of a fabricated "N of M" trend
// claim — there's no historical match-rate data to support a real trend line yet.
const topCriticalException = criticalExceptions[0];
const maxSeverityCount = Math.max(1, ...severityCounts.map((s) => s.n));

const DEFAULT_INSIGHT = topCriticalException
  ? `${topCriticalException.vendor} has a ${topCriticalException.type.toLowerCase()} flagged on ${topCriticalException.inv} — 1 of ${criticalExceptions.length} critical exception${criticalExceptions.length === 1 ? '' : 's'} open right now.`
  : 'No critical exceptions open right now.';

const SUGGESTED_PROMPTS = ["Summarize today's ingestion", 'What needs my attention?', 'Any documents aging past 24h?'];

// Icon + click target per KPI are presentation-only and stay client-side;
// value/label/trend/accent come from the API, keyed by `key`.
const KPI_META: Record<string, { icon: LucideIcon; to: string }> = {
  active_invoices: { icon: Truck, to: '/worklist' },
  pending_review: { icon: Eye, to: '/worklist' },
  open_exceptions: { icon: AlertTriangle, to: '/exceptions' },
  pending_approvals: { icon: Clock, to: '/approvals' },
  posting_ready: { icon: CheckCircle2, to: '/worklist' },
  sla_breached: { icon: AlarmClock, to: '/worklist' },
};

const DEFAULT_KPIS: KpiDef[] = [
  { icon: Truck, value: '1,284', label: 'Active Invoices', trend: '+8.2%', accent: 'default', to: '/worklist' },
  { icon: Eye, value: '218', label: 'Pending Review', trend: '+2.4%', accent: 'default', to: '/worklist' },
  { icon: AlertTriangle, value: '87', label: 'Open Exceptions', trend: '+12', accent: 'red', to: '/exceptions' },
  { icon: Clock, value: '342', label: 'Pending Approvals', trend: '−3.1%', accent: 'default', to: '/approvals' },
  { icon: CheckCircle2, value: '156', label: 'Posting Ready', trend: '+9.7%', accent: 'green', to: '/worklist' },
  { icon: AlarmClock, value: '6', label: 'SLA Breached', trend: '+3', accent: 'red', to: '/worklist' },
];

function toKpiDefs(kpis: DashboardKpi[]): KpiDef[] {
  return kpis
    .filter((k) => KPI_META[k.key])
    .map((k) => ({ ...KPI_META[k.key], value: k.value, label: k.label, trend: k.trend, accent: k.accent }));
}

const STAGE_ICONS: Record<string, LucideIcon> = {
  Ingested: Inbox,
  Extracted: FileSearch,
  Matched: Link2,
  Coded: Tag,
  Approved: ThumbsUp,
  Posted: Send,
};

const TIME_OPTIONS = ['Today', 'This Week', 'This Month', 'Last 100'];
const MONTH_ABBR = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const TIME_OPTION_FILTERS: Record<string, DashboardDateFilter> = {
  Today: 'today',
  'This Week': 'week',
  'This Month': 'month',
  'Last 100': 'last100',
};

// Same age computation as the Worklist's Age column — reused here so "old" means
// the same thing (and uses the same 24h threshold) on both pages.
function fmtAge(iso: string): string {
  if (!iso) return '—';
  const created = new Date(iso).getTime();
  if (isNaN(created)) return '—';
  const minutes = Math.max(0, Math.round((Date.now() - created) / 60000));
  const days = Math.floor(minutes / 1440);
  const hours = Math.floor((minutes % 1440) / 60);
  const mins = minutes % 60;
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${mins}m`;
  return `${mins}m`;
}

function ageHours(iso: string): number {
  const created = new Date(iso).getTime();
  if (isNaN(created)) return 0;
  return (Date.now() - created) / 3600000;
}

export default function DashboardPage() {
  const navigate = useNavigate();
  const [pipe, setPipe] = useState(false);
  const [count, setCount] = useState(0);
  const [tf, setTf] = useState('This Week');
  const [dateFilter, setDateFilter] = useState<DashboardDateFilter>('week');
  const [tfOpen, setTfOpen] = useState(false);
  const [customOpen, setCustomOpen] = useState(false);
  const [cfrom, setCfrom] = useState('');
  const [cto, setCto] = useState('');
  const [kpis, setKpis] = useState<KpiDef[]>(DEFAULT_KPIS);
  const [agingRows, setAgingRows] = useState<AgingRow[]>([]);
  const [agingFlaggedCount, setAgingFlaggedCount] = useState(0);
  const [pipelineData, setPipelineData] = useState<DashboardPipelineStage[]>([]);
  const [pipelineLabel, setPipelineLabel] = useState('Latest Records');
  const [insightPrompt, setInsightPrompt] = useState('');
  const [insightResponse, setInsightResponse] = useState(DEFAULT_INSIGHT);
  const [insightLoading, setInsightLoading] = useState(false);
  const it = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    if (dateFilter === 'custom' && (!cfrom || !cto)) return;

    getDashboardKpis({
      dateFilter,
      startDate: dateFilter === 'custom' ? cfrom : undefined,
      endDate: dateFilter === 'custom' ? cto : undefined,
    })
      .then((res) => {
        const mapped = toKpiDefs(res.kpis);
        if (mapped.length) setKpis(mapped);
      })
      .catch(() => {});

    getDashboardPipeline({
      dateFilter,
      startDate: dateFilter === 'custom' ? cfrom : undefined,
      endDate: dateFilter === 'custom' ? cto : undefined,
    })
      .then((res) => { setPipelineData(res.stages); setPipelineLabel(res.label); })
      .catch(() => {});
  }, [dateFilter, cfrom, cto]);

  useEffect(() => {
    // There's no real SLA due-date anywhere in the backend (sla_due_at/sla_breached
    // are never set), so "at risk" is redefined here as "open the longest" — the
    // same Age signal and 24h threshold the Worklist page already uses.
    getDocumentQueue()
      .then((res) => {
        const oldest = res.documents
          .filter((d) => !!d.created_at)
          .sort((a, b) => new Date(a.created_at!).getTime() - new Date(b.created_at!).getTime());
        setAgingFlaggedCount(oldest.filter((d) => ageHours(d.created_at!) >= 24).length);
        setAgingRows(oldest.slice(0, 4).map((d) => ({
          inv: d.document_reference ?? d.document_id,
          vendor: d.supplier ?? '—',
          stage: d.stage ?? '—',
          age: fmtAge(d.created_at!),
          amount: '$' + Math.round(d.amount ?? 0).toLocaleString('en-US'),
          risk: ageHours(d.created_at!) >= 24 ? 'high' : 'med',
        })));
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    const t0 = setTimeout(() => setPipe(true), 140);
    const start = Date.now();
    const dur = 1150;
    const ci = setInterval(() => {
      const t = Math.min(1, (Date.now() - start) / dur);
      setCount(1 - Math.pow(1 - t, 3));
      if (t >= 1) clearInterval(ci);
    }, 33);
    return () => { clearTimeout(t0); clearInterval(ci); clearTimeout(it.current); };
  }, []);

  // Stand-in for a real backend/Claude call — answers a handful of common
  // questions from data already on this page. Swap the body of this function
  // for a fetch() to a real AI endpoint once one exists; the prompt UI below
  // doesn't need to change.
  const resolveInsight = (prompt: string): string => {
    const q = prompt.toLowerCase();

    if (q.includes('ingest') || q.includes('today')) {
      const ingested = pipelineData.find((s) => s.name === 'Ingested')?.count ?? 0;
      const extracted = pipelineData.find((s) => s.name === 'Extracted')?.count ?? 0;
      return `${pipelineLabel}: ${ingested} document${ingested === 1 ? '' : 's'} ingested, ${extracted} successfully extracted so far.`;
    }
    if (q.includes('exception') || q.includes('critical') || q.includes('attention')) {
      const critical = severityCounts.find((s) => s.sev === 'critical')?.n ?? 0;
      return topCriticalException
        ? `${critical} critical exception${critical === 1 ? '' : 's'} open — most recently ${topCriticalException.vendor}'s ${topCriticalException.type.toLowerCase()} on ${topCriticalException.inv}.`
        : `${critical} critical exceptions open right now.`;
    }
    if (q.includes('sla') || q.includes('risk') || q.includes('due') || q.includes('aging') || q.includes('old')) {
      return `${agingFlaggedCount} document${agingFlaggedCount === 1 ? '' : 's'} have been open more than 24 hours.`;
    }
    return "I'm not connected to a live AI backend yet — once wired up to Claude or another API, I'll be able to answer anything here.";
  };

  const askInsight = (prompt: string) => {
    const q = prompt.trim();
    if (!q || insightLoading) return;
    setInsightPrompt('');
    setInsightLoading(true);
    clearTimeout(it.current);
    it.current = setTimeout(() => {
      setInsightResponse(resolveInsight(q));
      setInsightLoading(false);
    }, 500);
  };

  const applyCustom = () => {
    if (!cfrom || !cto) return;
    const f = (v: string) => { const p = v.split('-'); return MONTH_ABBR[+p[1] - 1] + ' ' + (+p[2]); };
    setTf(f(cfrom) + ' – ' + f(cto));
    setDateFilter('custom');
    setTfOpen(false);
    setCustomOpen(false);
  };

  const cprog = count;
  const pipelineSteps = pipelineData.map((s, i) => ({
    name: s.name,
    n: Math.round(s.count * cprog).toLocaleString('en-US'),
    hasConn: i > 0,
    delay: i * 0.11,
    isLast: i === pipelineData.length - 1,
    icon: STAGE_ICONS[s.name] ?? Check,
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
                      onClick={() => { setTf(o); setDateFilter(TIME_OPTION_FILTERS[o]); setTfOpen(false); setCustomOpen(false); }}
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
        </div>
      </div>

      <div className="mb-[18px] grid grid-cols-6 gap-3">
        {kpis.map((k) => (
          <KpiCard key={k.label} icon={k.icon} value={k.value} label={k.label} trend={k.trend} accent={k.accent} onClick={() => navigate(k.to)} />
        ))}
      </div>

      <div className="mb-[18px] rounded-xl border border-border bg-surface p-[20px_22px] shadow-[0_1px_2px_rgba(16,24,40,.04)]">
        <div className="mb-5 flex items-center justify-between">
          <div className="text-xs font-bold uppercase tracking-[.06em] text-muted-foreground">Document Pipeline</div>
          <div className="text-[12.5px] text-faint">{pipelineLabel} · {(pipelineData[0]?.count ?? 0).toLocaleString('en-US')} ingested</div>
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
                <s.icon size={17} color="#fff" />
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
              <span className="text-[14.5px] font-bold">Aging Documents</span>
              <span
                className="rounded-full border px-2 py-0.5 text-[11.5px] font-bold"
                style={{ color: RED, background: 'var(--redsoft)', borderColor: '#f3d0d0' }}
              >
                {agingFlaggedCount} over 24h
              </span>
            </div>
            <a href="/worklist" className="text-[12.5px] font-semibold">View all</a>
          </div>
          <div>
            {agingRows.map((r, i) => {
              const hi = r.risk === 'high';
              return (
                <div key={r.inv ?? i} className="pcb-row flex cursor-pointer items-center gap-3 border-b border-borderf px-[18px] py-3">
                  <span className="h-[9px] w-[9px] flex-none rounded-full" style={{ background: hi ? RED : 'var(--faint)' }} />
                  <div className="min-w-0 flex-1">
                    <div className="text-[13.5px] font-semibold">{r.vendor}</div>
                    <div className="text-xs tabular-nums text-faint">{r.inv} · {r.stage}</div>
                  </div>
                  <div className="text-right">
                    <div className="text-[13px] font-bold tabular-nums" style={{ color: hi ? RED : 'var(--text3)' }}>{r.age}</div>
                    <div className="text-xs tabular-nums text-muted-foreground">{r.amount}</div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div
          onClick={() => navigate('/exceptions')}
          className="cursor-pointer overflow-hidden rounded-xl border border-border bg-surface shadow-[0_1px_2px_rgba(16,24,40,.04)]"
        >
          <div className="flex items-center justify-between border-b border-border2 px-[18px] py-[15px]">
            <span className="text-[14.5px] font-bold">Exceptions by Severity</span>
            <span className="text-[12.5px] font-semibold text-navy">Triage</span>
          </div>
          <div className="p-1.5 px-2">
            {severityCounts.map((s) => (
              <div key={s.sev} className="pcb-row flex cursor-pointer items-center gap-3 rounded-lg px-3 py-[11px]">
                <span className="h-2.5 w-2.5 flex-none rounded-full" style={{ background: sevColor(s.sev) }} />
                <span className="flex-1 text-[13.5px] font-semibold text-text2">{s.label}</span>
                <div className="h-[7px] w-[120px] overflow-hidden rounded-md bg-border2">
                  <div className="h-full rounded-md" style={{ width: `${(s.n / maxSeverityCount) * 100}%`, background: sevColor(s.sev) }} />
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
              {insightLoading ? 'Thinking…' : topCriticalException ? 'Needs attention' : 'All clear'}
            </span>
          </div>
          <p className="text-[13.5px] leading-[1.55] text-text2">
            {insightLoading ? 'Thinking…' : insightResponse}
          </p>
          <form
            className="mt-3 flex items-center gap-2"
            onSubmit={(e) => { e.preventDefault(); askInsight(insightPrompt); }}
          >
            <input
              type="text"
              value={insightPrompt}
              onChange={(e) => setInsightPrompt(e.target.value)}
              placeholder="Ask AI Insight… e.g. “Summarize today's ingestion”"
              className="h-9 flex-1 rounded-lg border border-line bg-surface px-3 text-[13px] text-foreground"
            />
            <button
              type="submit"
              disabled={!insightPrompt.trim() || insightLoading}
              title="Ask"
              className="pcb-btn flex h-9 w-9 flex-none items-center justify-center rounded-lg border-none bg-navy text-white disabled:opacity-40"
            >
              {insightLoading ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />}
            </button>
          </form>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {SUGGESTED_PROMPTS.map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => askInsight(p)}
                disabled={insightLoading}
                className="pcb-btn rounded-full border border-border bg-surface px-2.5 py-1 text-[11px] font-medium text-text2 disabled:opacity-40"
              >
                {p}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-4 gap-3.5">
        {kpiStrip.map((k) => {
          const isDown = k.trend.startsWith('-') || k.trend.startsWith('−');
          const TrendIcon = isDown ? ArrowDown : ArrowUp;
          const trendText = k.trend.replace(/^[+\-−]/, '');
          return (
          <div key={k.label} className="rounded-xl border border-border bg-surface p-[15px_17px] shadow-[0_1px_2px_rgba(16,24,40,.04)]">
            <div className="flex items-center justify-between">
              <span className="text-[12.5px] font-medium text-muted-foreground">{k.label}</span>
              <span className="flex items-center gap-[2px] text-xs font-semibold" style={{ color: k.good ? GREEN : 'var(--muted)' }}>
                <TrendIcon size={11} strokeWidth={2.75} />
                {trendText}
              </span>
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
          );
        })}
      </div>
    </div>
  );
}
