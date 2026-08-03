import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  AlertTriangle, ArrowDown, ArrowUp, Check, CheckCircle2, ChevronDown, Clock, Eye,
  FileSearch, Filter, Inbox, Link2, Loader2, Send, Sparkles, ThumbsUp, Truck, type LucideIcon,
} from 'lucide-react';
import { KpiCard, type KpiAccent } from '@/components/KpiCard';
import { GREEN, RED, sevColor, type Severity } from '@/lib/theme';
import { kpiStrip } from '@/data';
import { supabase } from '@/lib/supabase';
import { fetchDocumentUiRows, maxSeverity, UNRESOLVED_SUPPLIER } from '@/lib/documentRow';

interface KpiDef {
  icon: LucideIcon;
  value: string;
  label: string;
  trend: string;
  accent: KpiAccent;
  to: string;
  /** Optional navigation state — e.g. Open Exceptions presets Worklist's Exceptions filter. */
  navState?: unknown;
}

interface PipelineStage {
  name: string;
  count: number;
}

interface AgingItem {
  supplier: string;
  docRef: string;
  age: string;
}

interface CriticalException {
  vendor: string | null;
  type: string;
  invoice: string | null;
}

// The top date filter drives the KPI trend %, computed as this window vs the
// immediately preceding equal window (created-in-window). Assumption flagged for
// Afrid; see docs/backend-handoff.md.
type DashboardDateFilter = 'today' | 'week' | 'month' | 'last100' | 'custom';

const SEVERITIES: Severity[] = ['critical', 'high', 'medium', 'low'];
const SEVERITY_LABELS: Record<Severity, string> = { critical: 'Critical', high: 'High', medium: 'Medium', low: 'Low' };

const SUGGESTED_PROMPTS = ["Summarize today's ingestion", 'What needs my attention?', 'Which document is oldest?'];

// Icon + click target per KPI are presentation-only; value/label/trend come from Supabase.
const KPI_META: Record<string, { icon: LucideIcon; to: string; navState?: unknown }> = {
  active_invoices: { icon: Truck, to: '/worklist' },
  pending_review: { icon: Eye, to: '/worklist' },
  open_exceptions: { icon: AlertTriangle, to: '/worklist', navState: { presetFilter: 'exception' } },
  pending_approvals: { icon: Clock, to: '/approvals' },
  posting_ready: { icon: CheckCircle2, to: '/worklist' },
};

// Posting Ready has no signal in the data (posted_at null, stage frozen) — kept
// static per plan until the backend provides a posting state.
const POSTING_READY_STATIC = { value: '—', trend: 'Not available' };

// document_ui_view.pipeline_stage is a single current-state value per document
// (mutually exclusive), not a cumulative funnel — each node below shows how many
// documents are CURRENTLY sitting in that stage, not how many have passed
// through it. See FRONTEND_HANDOFF_FOR_VAMSI.md §12.
const PIPELINE_STAGE_ORDER = ['ingested', 'extracted', 'matched', 'exception', 'approved', 'posted'] as const;
const PIPELINE_STAGE_LABELS: Record<(typeof PIPELINE_STAGE_ORDER)[number], string> = {
  ingested: 'Ingested', extracted: 'Extracted', matched: 'Matched', exception: 'Exception', approved: 'Approved', posted: 'Posted',
};

const DEFAULT_KPIS: KpiDef[] = [
  { icon: Truck, value: '—', label: 'Active Invoices', trend: '0%', accent: 'default', to: '/worklist' },
  { icon: Eye, value: '—', label: 'Pending Review', trend: '0%', accent: 'default', to: '/worklist' },
  { icon: AlertTriangle, value: '—', label: 'Open Exceptions', trend: '0%', accent: 'red', to: '/worklist', navState: { presetFilter: 'exception' } },
  { icon: Clock, value: '—', label: 'Pending Approvals', trend: '0%', accent: 'default', to: '/approvals' },
  { icon: CheckCircle2, value: POSTING_READY_STATIC.value, label: 'Posting Ready', trend: POSTING_READY_STATIC.trend, accent: 'green', to: '/worklist' },
];

const STAGE_ICONS: Record<string, LucideIcon> = {
  Ingested: Inbox,
  Extracted: FileSearch,
  Matched: Link2,
  Exception: AlertTriangle,
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

function normSeverity(s: string | null): Severity | null {
  const k = (s ?? '').toLowerCase();
  return k === 'critical' || k === 'high' || k === 'medium' || k === 'low' ? k : null;
}

/** Age since capture ("3h 20m", "4d 2h") — same computation as the Worklist Age column. */
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

const DAY = 86400000;

/** Current window + the immediately preceding equal window, for the trend %. */
function windowsFor(filter: DashboardDateFilter, cfrom: string, cto: string): { cur: [number, number]; prev: [number, number] } {
  const now = Date.now();
  if (filter === 'today') {
    const s = new Date(); s.setHours(0, 0, 0, 0);
    const start = s.getTime();
    return { cur: [start, now], prev: [start - DAY, start] };
  }
  if (filter === 'week') return { cur: [now - 7 * DAY, now], prev: [now - 14 * DAY, now - 7 * DAY] };
  if (filter === 'month') return { cur: [now - 30 * DAY, now], prev: [now - 60 * DAY, now - 30 * DAY] };
  if (filter === 'last100') return { cur: [now - 100 * DAY, now], prev: [now - 200 * DAY, now - 100 * DAY] };
  // custom
  const start = new Date(cfrom).getTime();
  const end = new Date(cto).getTime() + DAY;
  const len = Math.max(DAY, end - start);
  return { cur: [start, end], prev: [start - len, start] };
}

function trendPct(isoDates: (string | null)[], wins: { cur: [number, number]; prev: [number, number] }): number {
  const times = isoDates.map((d) => (d ? new Date(d).getTime() : NaN)).filter((t) => !isNaN(t));
  const count = (w: [number, number]) => times.filter((t) => t >= w[0] && t < w[1]).length;
  const cur = count(wins.cur);
  const prev = count(wins.prev);
  if (prev === 0) return cur > 0 ? 100 : 0;
  return ((cur - prev) / prev) * 100;
}

function formatTrend(change: number): string {
  if (change > 0) return `+${change.toFixed(1)}%`;
  if (change < 0) return `−${Math.abs(change).toFixed(1)}%`;
  return '0%';
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
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);
  const [kpis, setKpis] = useState<KpiDef[]>(DEFAULT_KPIS);
  const [agingRows, setAgingRows] = useState<AgingItem[]>([]);
  const [severityCounts, setSeverityCounts] = useState(
    SEVERITIES.map((sev) => ({ sev, label: SEVERITY_LABELS[sev], n: 0 }))
  );
  const [topCriticalException, setTopCriticalException] = useState<CriticalException | null>(null);
  const [insightPrompt, setInsightPrompt] = useState('');
  const [insightResponse, setInsightResponse] = useState('');
  const [insightLoading, setInsightLoading] = useState(false);
  const it = useRef<ReturnType<typeof setTimeout>>();
  const [pipelineData, setPipelineData] = useState<PipelineStage[]>(
    PIPELINE_STAGE_ORDER.map((st) => ({ name: PIPELINE_STAGE_LABELS[st], count: 0 })),
  );

  const criticalCount = severityCounts.find((s) => s.sev === 'critical')?.n ?? 0;
  const maxSeverityCount = Math.max(1, ...severityCounts.map((s) => s.n));
  const defaultInsight = topCriticalException
    ? `${topCriticalException.vendor ?? 'A vendor'} has a ${(topCriticalException.type || 'exception').toLowerCase()} flagged on ${topCriticalException.invoice ?? 'an invoice'} — 1 of ${criticalCount} critical exception${criticalCount === 1 ? '' : 's'} open right now.`
    : 'No critical exceptions open right now.';

  const pipelineLabel = 'Current Stage';

  // Read everything the Dashboard needs from Supabase, keyed off the date filter
  // (which only affects the trend %, not the current-count values).
  useEffect(() => {
    if (dateFilter === 'custom' && (!cfrom || !cto)) return;
    const wins = windowsFor(dateFilter, cfrom, cto);
    let cancelled = false;
    setLoading(true);
    setError(null);

    Promise.all([
      supabase
        .from('ap_documents')
        .select('id, created_at, email_messages ( ai_understanding )')
        .eq('is_active', true),
      supabase
        .from('exception_cases')
        .select('document_id, severity, status, created_at, exception_type, ap_documents ( email_messages ( ai_understanding ) )'),
      supabase.from('approval_requests').select('status, created_at'),
    ]).then(([docRes, excRes, appRes]) => {
      if (cancelled) return;
      const firstError = docRes.error || excRes.error || appRes.error;
      if (firstError) {
        setError(firstError.message);
        setLoading(false);
        return;
      }
      const docs = (docRes.data ?? []) as any[];
      const excs = (excRes.data ?? []) as any[];
      const apps = (appRes.data ?? []) as any[];

      // document_ui_view is a separate query (a view, not embeddable via the
      // ap_documents FK) — fetched for every document referenced here (both the
      // full doc set and any exception's linked document) and merged in JS.
      const allIds = [...docs.map((d) => d.id), ...excs.map((e) => e.document_id).filter((x): x is string => !!x)];
      fetchDocumentUiRows(allIds)
        .then((uiMap) => {
          if (cancelled) return;

          // ---- KPI values (current counts) + trends (created-in-window) ----
          const invoices = docs.filter((d) => uiMap.get(d.id)?.document_type === 'invoice');
          const pendingApp = apps.filter((a) => a.status === 'pending');

          // Group exception_cases per document — the same shape Worklist's own
          // Exceptions/Severity columns use (toWorklistRow / maxSeverity in
          // documentRow.ts), with no status filter, so these numbers always
          // agree with what Worklist shows for the same documents.
          const excsByDoc = new Map<string, typeof excs>();
          excs.forEach((e) => {
            if (!e.document_id) return;
            const list = excsByDoc.get(e.document_id) ?? [];
            list.push(e);
            excsByDoc.set(e.document_id, list);
          });

          setKpis([
            { ...KPI_META.active_invoices, label: 'Active Invoices', accent: 'default', value: invoices.length.toLocaleString('en-US'), trend: formatTrend(trendPct(invoices.map((d) => d.created_at), wins)) },
            { ...KPI_META.pending_review, label: 'Pending Review', accent: 'default', value: docs.length.toLocaleString('en-US'), trend: formatTrend(trendPct(docs.map((d) => d.created_at), wins)) },
            { ...KPI_META.open_exceptions, label: 'Open Exceptions', accent: 'red', value: excsByDoc.size.toLocaleString('en-US'), trend: formatTrend(trendPct(excs.map((e) => e.created_at), wins)) },
            { ...KPI_META.pending_approvals, label: 'Pending Approvals', accent: 'default', value: pendingApp.length.toLocaleString('en-US'), trend: formatTrend(trendPct(apps.map((a) => a.created_at), wins)) },
            { ...KPI_META.posting_ready, label: 'Posting Ready', accent: 'green', value: POSTING_READY_STATIC.value, trend: POSTING_READY_STATIC.trend },
          ]);

          // ---- Document Pipeline: real current-stage distribution ----
          const stageCounts: Record<string, number> = {};
          PIPELINE_STAGE_ORDER.forEach((st) => { stageCounts[st] = 0; });
          docs.forEach((d) => {
            const stage = uiMap.get(d.id)?.pipeline_stage;
            if (stage && stage in stageCounts) stageCounts[stage]++;
          });
          setPipelineData(PIPELINE_STAGE_ORDER.map((st) => ({ name: PIPELINE_STAGE_LABELS[st], count: stageCounts[st] })));

          // ---- Exceptions by Severity: per-document max severity, exactly
          // like Worklist's Severity column (maxSeverity in documentRow.ts) —
          // not a raw count of exception_case rows by their own severity.
          const severityTally: Record<Severity, number> = { critical: 0, high: 0, medium: 0, low: 0 };
          excsByDoc.forEach((group) => {
            const sev = maxSeverity(group);
            if (sev) severityTally[sev]++;
          });
          setSeverityCounts(SEVERITIES.map((sev) => ({
            sev,
            label: SEVERITY_LABELS[sev],
            n: severityTally[sev],
          })));

          // ---- Top critical exception (for the AI insight) ----
          const topCrit = excs
            .filter((e) => normSeverity(e.severity) === 'critical')
            .sort((a, b) => new Date(b.created_at ?? 0).getTime() - new Date(a.created_at ?? 0).getTime())[0];
          if (topCrit) {
            const h = topCrit.ap_documents?.email_messages?.ai_understanding?.header ?? {};
            const ui = topCrit.document_id ? uiMap.get(topCrit.document_id) : undefined;
            const vendor = ui?.supplier_id ? (ui.supplier_name ?? UNRESOLVED_SUPPLIER) : UNRESOLVED_SUPPLIER;
            setTopCriticalException({ vendor, type: topCrit.exception_type ?? 'exception', invoice: h.invoice_number ?? null });
          } else {
            setTopCriticalException(null);
          }

          // ---- Top 5 Aging Documents (oldest active docs) ----
          const aging = docs
            .filter((d) => d.created_at)
            .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
            .slice(0, 5)
            .map((d) => {
              const h = d.email_messages?.ai_understanding?.header ?? {};
              const ui = uiMap.get(d.id);
              const supplier = ui?.supplier_id ? (ui.supplier_name ?? UNRESOLVED_SUPPLIER) : UNRESOLVED_SUPPLIER;
              return {
                supplier,
                docRef: h.invoice_number ?? h.po_number ?? '—',
                age: fmtAge(d.created_at),
              };
            });
          setAgingRows(aging);
          setLoading(false);
        })
        .catch((uiErr) => {
          if (cancelled) return;
          setError(uiErr instanceof Error ? uiErr.message : 'Failed to load document details.');
          setLoading(false);
        });
    });

    return () => {
      cancelled = true;
    };
  }, [dateFilter, cfrom, cto, reloadToken]);

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

  // Client-side stub — answers a few common questions from data already on this page.
  const resolveInsight = (prompt: string): string => {
    const q = prompt.toLowerCase();
    if (q.includes('ingest') || q.includes('today')) {
      const ingested = pipelineData.find((s) => s.name === 'Ingested')?.count ?? 0;
      const extracted = pipelineData.find((s) => s.name === 'Extracted')?.count ?? 0;
      return `${pipelineLabel}: ${ingested} document${ingested === 1 ? '' : 's'} ingested, ${extracted} successfully extracted so far.`;
    }
    if (q.includes('exception') || q.includes('critical') || q.includes('attention')) {
      return topCriticalException
        ? `${criticalCount} critical exception${criticalCount === 1 ? '' : 's'} open — most recently ${topCriticalException.vendor}'s ${(topCriticalException.type || 'exception').toLowerCase()} on ${topCriticalException.invoice ?? 'an invoice'}.`
        : `${criticalCount} critical exceptions open right now.`;
    }
    if (q.includes('old') || q.includes('aging') || q.includes('age')) {
      const oldest = agingRows[0];
      return oldest ? `The oldest open document is ${oldest.supplier} (${oldest.docRef}), aged ${oldest.age}.` : 'No open documents right now.';
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

  // Both dates present, and from <= to — the only two ways a custom range can be invalid.
  const customRangeError = !cfrom || !cto ? null : cfrom > cto ? '"From" must be on or before "To".' : null;
  const customRangeValid = !!cfrom && !!cto && !customRangeError;

  const applyCustom = () => {
    if (!customRangeValid) return;
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
          <h1 className="mb-[3px] text-[23px] font-semibold tracking-tight">Payables Overview</h1>
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
                    <label className="text-[11px] font-medium text-faint">
                      From
                      <input
                        type="date"
                        value={cfrom}
                        onChange={(e) => setCfrom(e.target.value)}
                        aria-invalid={!!customRangeError}
                        className="mt-1 h-[34px] w-full rounded-lg border border-line bg-surface px-2.5 font-sans text-[13px] text-foreground"
                      />
                    </label>
                    <label className="text-[11px] font-medium text-faint">
                      To
                      <input
                        type="date"
                        value={cto}
                        onChange={(e) => setCto(e.target.value)}
                        aria-invalid={!!customRangeError}
                        className="mt-1 h-[34px] w-full rounded-lg border border-line bg-surface px-2.5 font-sans text-[13px] text-foreground"
                      />
                    </label>
                    {customRangeError && (
                      <p role="alert" className="text-[11.5px] font-medium" style={{ color: RED }}>{customRangeError}</p>
                    )}
                    <button
                      type="button"
                      onClick={applyCustom}
                      disabled={!customRangeValid}
                      className="mt-0.5 h-[34px] rounded-lg border-none bg-navy text-[12.5px] font-semibold text-white disabled:opacity-40"
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

      {loading ? (
        <div className="rounded-xl border border-border bg-surface p-10 text-center text-[13.5px] text-muted-foreground">
          Loading dashboard…
        </div>
      ) : error ? (
        <div className="flex flex-col items-center gap-3 rounded-xl border border-border bg-surface p-10 text-center text-[13.5px]">
          <span style={{ color: RED }}>{error}</span>
          <button
            type="button"
            onClick={() => setReloadToken((t) => t + 1)}
            className="pcb-btn h-[34px] rounded-lg border border-line bg-surface px-3.5 text-[12.5px] font-semibold text-navy"
          >
            Retry
          </button>
        </div>
      ) : (
      <>
      <div className="mb-[18px] grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {kpis.map((k) => (
          <KpiCard key={k.label} icon={k.icon} value={k.value} label={k.label} trend={k.trend} accent={k.accent} onClick={() => navigate(k.to, k.navState ? { state: k.navState } : undefined)} />
        ))}
      </div>

      <div className="mb-[18px] rounded-xl border border-border bg-surface p-[20px_22px] shadow-[0_1px_2px_rgba(16,24,40,.04)]">
        <div className="mb-5 flex items-center justify-between">
          <div className="text-xs font-semibold text-muted-foreground">Document Pipeline</div>
          <span className="text-[12.5px] text-faint">{pipelineLabel}</span>
        </div>
        <div className="flex items-start gap-2 overflow-x-auto" style={{ minWidth: 0 }}>
          {pipelineSteps.map((s) => (
            <div key={s.name} className="relative flex min-w-[92px] flex-1 flex-col items-center text-center">
              {s.hasConn && (
                <div
                  className="absolute top-[19px] h-1 overflow-hidden rounded"
                  // `left` and `right` both inset 20px from center to stop flush at each
                  // circle's edge (20px = half the h-10/w-10 circle's diameter) — but the
                  // row above has `gap-2` (8px) between steps, which only the *left* side
                  // needs to additionally account for: `right` is measured relative to
                  // this step's own container, so it already lands exactly on this
                  // circle's edge, but `left` reaches back into the *previous* step's
                  // container, which starts 8px further away than a gap-less row would.
                  // Without subtracting that 8px, the line stops 8px short of the
                  // previous circle — visible as a gap between every icon and its line.
                  style={{ left: 'calc(-50% + 12px)', right: 'calc(50% + 20px)', background: 'var(--border2)' }}
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

      <div className="mb-[18px] grid grid-cols-1 gap-4 lg:grid-cols-[1.35fr_1fr]">
        <div className="overflow-hidden rounded-xl border border-border bg-surface shadow-[0_1px_2px_rgba(16,24,40,.04)]">
          <div className="flex items-center justify-between border-b border-border2 px-[18px] py-[15px]">
            <span className="text-[14.5px] font-semibold tracking-tight">Oldest in Queue</span>
            <Link to="/worklist" className="text-[12.5px] font-semibold">View all</Link>
          </div>
          <div>
            {agingRows.length === 0 ? (
              <div className="px-[18px] py-6 text-[13px] text-muted-foreground">No documents.</div>
            ) : agingRows.map((r, i) => (
              <div key={`${r.docRef}-${i}`} className="pcb-row flex cursor-pointer items-center gap-3 border-b border-borderf px-[18px] py-3">
                <span className="w-4 flex-none text-[12.5px] font-bold text-faint">{i + 1}</span>
                <div className="min-w-0 flex-1">
                  <div className="text-[13.5px] font-semibold">{r.supplier}</div>
                  <div className="text-xs tabular-nums text-faint">{r.docRef}</div>
                </div>
                <div className="text-right text-[13px] font-bold tabular-nums text-text3">{r.age}</div>
              </div>
            ))}
          </div>
        </div>

        <div className="self-start overflow-hidden rounded-xl border border-border bg-surface shadow-[0_1px_2px_rgba(16,24,40,.04)]">
          <div className="flex items-center justify-between border-b border-border2 px-[18px] py-[15px]">
            <span className="text-[14.5px] font-semibold tracking-tight">Exceptions by Severity</span>
          </div>
          <div className="p-2">
            {severityCounts.map((s) => (
              // Each row jumps to Worklist pre-filtered to that severity (a
              // removable chip there, since Worklist has no permanent severity
              // filter control) rather than always linking to the same unfiltered page.
              <button
                key={s.sev}
                type="button"
                onClick={() => navigate('/worklist', { state: { presetSeverity: s.sev } })}
                className="pcb-row flex w-full cursor-pointer items-center gap-3 rounded-lg border-none bg-transparent px-3 py-[11px] text-left"
                aria-label={`${s.label}: ${s.n} — view in Worklist`}
              >
                <span className="h-2.5 w-2.5 flex-none rounded-full" style={{ background: sevColor(s.sev) }} />
                <span className="w-[64px] flex-none text-[13.5px] font-semibold text-text2">{s.label}</span>
                <div className="h-[8px] flex-1 overflow-hidden rounded-full bg-border2">
                  <div
                    className="h-full rounded-full transition-[width] duration-500 ease-out"
                    style={{ width: `${(s.n / maxSeverityCount) * 100}%`, background: sevColor(s.sev) }}
                  />
                </div>
                <span className="w-[28px] flex-none text-right text-sm font-extrabold tabular-nums">{s.n}</span>
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="mb-[18px] flex items-start gap-[15px] rounded-xl border border-border bg-tint p-[17px_19px]">
        <div className="flex h-[38px] w-[38px] flex-none items-center justify-center rounded-[10px] bg-navy text-white shadow-[0_2px_8px_rgba(30,58,138,.3)]">
          <Sparkles size={20} color="#fff" />
        </div>
        <div className="flex-1">
          <div className="mb-1 flex flex-wrap items-center gap-2">
            <span className="text-[13.5px] font-semibold tracking-tight text-navy">AI Insight</span>
          </div>
          <p className="text-[13.5px] leading-[1.55] text-text2">
            {insightLoading ? 'Thinking…' : insightResponse || defaultInsight}
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

      <div className="grid grid-cols-2 gap-3.5 sm:grid-cols-4">
        {kpiStrip.map((k) => {
          const isDown = k.trend.startsWith('-') || k.trend.startsWith('−');
          const TrendIcon = isDown ? ArrowDown : ArrowUp;
          const trendText = k.trend.replace(/^[+\-−]/, '');
          return (
          <div key={k.label} className="rounded-xl border border-border bg-surface p-[15px_17px] shadow-[0_1px_2px_rgba(16,24,40,.04)]">
            <div className="flex items-center justify-between">
              <span className="text-[12.5px] font-medium uppercase tracking-[.04em] text-muted-foreground">{k.label}</span>
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
      </>
      )}
    </div>
  );
}
