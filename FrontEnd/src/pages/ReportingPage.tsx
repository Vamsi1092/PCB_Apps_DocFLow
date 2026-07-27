import { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle, CheckCircle2, ChevronDown, Download, Filter, Loader2, Mail, Send, Sparkles, TrendingUp, type LucideIcon,
} from 'lucide-react';
import { Bar, BarChart, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { GREEN, RED, type Severity } from '@/lib/theme';
import { REPORTING_DOCUMENT_TYPE_LABELS, type ReportingDocumentType } from '@/data';
import { supabase } from '@/lib/supabase';
import { fetchDocumentUiRows, UNRESOLVED_SUPPLIER, type DocumentUiRow } from '@/lib/documentRow';

const tooltipBox = 'rounded-lg bg-[#111a33] px-3.5 py-2.5 text-white shadow-[0_10px_30px_rgba(0,0,0,.3)]';
const DAY = 86400000;
const MONTH_ABBR = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const KPI_ICONS: Record<string, LucideIcon> = {
  emails_processed: Mail,
  invoices_created: CheckCircle2,
  invoices_posted: TrendingUp,
  open_exceptions: AlertTriangle,
};

interface KpiTile {
  key: string;
  label: string;
  value: string;
  sub: string;
  accent: 'default' | 'red';
}

interface MonthTrend { m: string; inv: number; exc: number; }
interface ExcTypeCount { label: string; n: number; attn: boolean; }
interface SupplierCount { name: string; n: number; }

// Raw Supabase rows (fetched once, filtered client-side by the period/severity).
interface EmailRow { received_at: string | null; }
interface DocRow { document_type: string | null; created_at: string | null; is_active: boolean | null; }
interface ExcRow {
  document_id: string | null;
  severity: string | null;
  status: string | null;
  created_at: string | null;
  exception_type: string | null;
  ap_documents: { email_messages: { ai_understanding: Record<string, any> | null } | null } | null;
}

type Period = 'yesterday' | 'last_week' | 'last_month' | 'custom';
const PERIOD_LABELS: Record<Period, string> = {
  yesterday: 'Yesterday', last_week: 'Last Week', last_month: 'Last Month', custom: 'Custom',
};
const PERIODS: Period[] = ['yesterday', 'last_week', 'last_month', 'custom'];

// Document Mix rows, in PO -> Ack -> GRN -> Invoice lifecycle order. Any
// document_type outside these canonical four rolls up into an "Other" bucket.
const DOC_MIX_ORDER: ReportingDocumentType[] = ['purchase_order', 'acknowledgement', 'grn', 'invoice'];

// Quick prompts for the AI Insight box (mirrors the Dashboard's pattern, scoped
// to what this report knows).
const SUGGESTED_PROMPTS = ['Summarize this period', 'What are the top exceptions?', 'Any document coverage gaps?'];

const SEVERITIES: Severity[] = ['critical', 'high', 'medium', 'low'];
const SEVERITY_LABELS: Record<Severity, string> = { critical: 'Critical', high: 'High', medium: 'Medium', low: 'Low' };

function isInvoiceType(t: string | null): boolean {
  return (t ?? '').toLowerCase().includes('invoice');
}
function normSeverity(s: string | null): Severity | null {
  const k = (s ?? '').toLowerCase();
  return k === 'critical' || k === 'high' || k === 'medium' || k === 'low' ? k : null;
}
function prettify(t: string | null): string {
  return (t ?? '—').replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}
function periodWindow(period: Period, cfrom: string, cto: string): [number, number] {
  const now = Date.now();
  if (period === 'yesterday') { const d = new Date(); d.setHours(0, 0, 0, 0); const s = d.getTime(); return [s - DAY, s]; }
  if (period === 'last_week') return [now - 7 * DAY, now];
  if (period === 'last_month') return [now - 30 * DAY, now];
  const s = cfrom ? new Date(cfrom).getTime() : 0;
  const e = cto ? new Date(cto).getTime() + DAY : now;
  return [s, e];
}

// Quotes a CSV field only when it needs it (contains a comma/quote/newline),
// escaping embedded quotes by doubling them per RFC 4180.
function csvField(v: string | number): string {
  const s = String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** Builds one CSV file from several labeled sections, all sourced from data
 * already loaded in the browser — no extra fetch. Triggers a browser download. */
function downloadReportCsv(sections: { title: string; headers: string[]; rows: (string | number)[][] }[]) {
  const lines: string[] = [];
  for (const s of sections) {
    lines.push(s.title);
    lines.push(s.headers.map(csvField).join(','));
    for (const row of s.rows) lines.push(row.map(csvField).join(','));
    lines.push('');
  }
  const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `docflow-reporting-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

interface RechartsTooltipProps<T> {
  active?: boolean;
  payload?: { payload: T; dataKey?: string; value?: number }[];
  label?: string;
}

function MonthTooltip({ active, payload, label }: RechartsTooltipProps<MonthTrend>) {
  if (!active || !payload?.length) return null;
  const inv = payload.find((p) => p.dataKey === 'inv')?.value ?? 0;
  const exc = payload.find((p) => p.dataKey === 'exc')?.value ?? 0;
  const rate = inv ? ((exc / inv) * 100).toFixed(1) : '0.0';
  return (
    <div className={tooltipBox}>
      <div className="mb-1.5 text-[12px] font-bold">{label}</div>
      <div className="flex items-center gap-2 text-[12px] text-[#c3cce3]">
        <span className="h-2 w-2 flex-none rounded-[2px] bg-navy2" />
        Invoices
        <strong className="ml-auto tabular-nums text-white">{inv.toLocaleString('en-US')}</strong>
      </div>
      <div className="mt-1 flex items-center gap-2 text-[12px] text-[#c3cce3]">
        <span className="h-2 w-2 flex-none rounded-[2px]" style={{ background: RED }} />
        Exceptions
        <strong className="ml-auto tabular-nums text-white">{exc.toLocaleString('en-US')}</strong>
      </div>
      <div className="mt-1.5 border-t border-white/15 pt-1.5 text-[11px] text-[#9fb0d6]">{rate}% exception rate</div>
    </div>
  );
}

function ExceptionTypeTooltip({ active, payload }: RechartsTooltipProps<ExcTypeCount>) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div className={tooltipBox}>
      <div className="mb-1 text-[12px] font-bold">{d.label}</div>
      <div className="text-[12px] text-[#c3cce3]">
        <strong className="tabular-nums text-white">{d.n}</strong> exception{d.n === 1 ? '' : 's'} logged
      </div>
      {d.attn && (
        <div className="mt-1.5 border-t border-white/15 pt-1.5 text-[11px] font-semibold" style={{ color: '#ff9a9a' }}>
          Highest-impact (most critical/high) — prioritize for rule tuning
        </div>
      )}
    </div>
  );
}

export default function ReportingPage() {
  const [periodOpen, setPeriodOpen] = useState(false);
  const [period, setPeriod] = useState<Period>('last_month');
  const [cfrom, setCfrom] = useState('');
  const [cto, setCto] = useState('');
  const [severity, setSeverity] = useState<Severity | null>(null);

  const [rawEmails, setRawEmails] = useState<EmailRow[]>([]);
  const [rawDocs, setRawDocs] = useState<DocRow[]>([]);
  const [rawExcs, setRawExcs] = useState<ExcRow[]>([]);
  // Canonical supplier per document, for the Top Suppliers chart — a separate
  // query since document_ui_view is a view, not embeddable via the ap_documents
  // FK the way email_messages is. See documentRow.ts.
  const [uiRowMap, setUiRowMap] = useState<Map<string, DocumentUiRow>>(new Map());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);

  // Local AI Insight box — same interactive stub as the Dashboard: answers a few
  // common questions from data already computed on this page. No live backend yet.
  const [insightPrompt, setInsightPrompt] = useState('');
  const [insightResponse, setInsightResponse] = useState('');
  const [insightLoading, setInsightLoading] = useState(false);
  const insightTimer = useRef<ReturnType<typeof setTimeout>>();
  useEffect(() => () => clearTimeout(insightTimer.current), []);

  // Fetch everything once; period/severity filtering is applied client-side below.
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    Promise.all([
      supabase.from('email_messages').select('received_at'),
      supabase.from('ap_documents').select('document_type, created_at, is_active'),
      supabase.from('exception_cases').select('document_id, severity, status, created_at, exception_type, ap_documents ( email_messages ( ai_understanding ) )'),
    ]).then(([em, dr, ex]) => {
      if (cancelled) return;
      const err = em.error || dr.error || ex.error;
      if (err) { setError(err.message); setLoading(false); return; }
      const excs = (ex.data ?? []) as unknown as ExcRow[];
      setRawEmails((em.data ?? []) as unknown as EmailRow[]);
      setRawDocs((dr.data ?? []) as unknown as DocRow[]);
      setRawExcs(excs);
      fetchDocumentUiRows(excs.map((e) => e.document_id).filter((x): x is string => !!x))
        .then((uiMap) => {
          if (cancelled) return;
          setUiRowMap(uiMap);
          setLoading(false);
        })
        .catch((uiErr) => {
          if (cancelled) return;
          setError(uiErr instanceof Error ? uiErr.message : 'Failed to load document details.');
          setLoading(false);
        });
    });

    return () => { cancelled = true; };
  }, [reloadToken]);

  const [winStart, winEnd] = periodWindow(period, cfrom, cto);
  const inPeriod = (iso: string | null) => {
    if (!iso) return false;
    const t = new Date(iso).getTime();
    return !isNaN(t) && t >= winStart && t < winEnd;
  };

  // ---- KPI tiles ----
  const kpiTiles: KpiTile[] = useMemo(() => {
    const emailsProcessed = rawEmails.filter((e) => inPeriod(e.received_at)).length;
    const invoicesCreated = rawDocs.filter((d) => isInvoiceType(d.document_type) && inPeriod(d.created_at)).length;
    const invoicesPosted = rawDocs.filter((d) => isInvoiceType(d.document_type) && d.is_active).length;
    const openExceptions = rawExcs.filter((e) => e.status === 'open').length;
    return [
      { key: 'emails_processed', label: 'Emails Processed', value: emailsProcessed.toLocaleString('en-US'), sub: 'AP mailbox', accent: 'default' },
      { key: 'invoices_created', label: 'Invoices Created', value: invoicesCreated.toLocaleString('en-US'), sub: 'From emails', accent: 'default' },
      { key: 'invoices_posted', label: 'Invoices Posted', value: invoicesPosted.toLocaleString('en-US'), sub: 'In worklist', accent: 'default' },
      { key: 'open_exceptions', label: 'Open Exceptions', value: openExceptions.toLocaleString('en-US'), sub: 'Require action', accent: 'red' },
    ];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rawEmails, rawDocs, rawExcs, winStart, winEnd]);

  // ---- Invoices vs Exceptions monthly trend ----
  const trend: MonthTrend[] = useMemo(() => {
    const months = new Map<number, MonthTrend>();
    const bump = (iso: string | null, key: 'inv' | 'exc') => {
      if (!inPeriod(iso)) return;
      const d = new Date(iso as string);
      const mk = d.getFullYear() * 12 + d.getMonth();
      const e = months.get(mk) ?? { m: MONTH_ABBR[d.getMonth()], inv: 0, exc: 0 };
      e[key] += 1;
      months.set(mk, e);
    };
    rawDocs.forEach((d) => { if (isInvoiceType(d.document_type)) bump(d.created_at, 'inv'); });
    rawExcs.forEach((e) => bump(e.created_at, 'exc'));
    return [...months.entries()].sort((a, b) => a[0] - b[0]).map(([, v]) => v);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rawDocs, rawExcs, winStart, winEnd]);

  // ---- Exception Types (severity-filtered; severity-weighted attn flag) ----
  const exceptionTypeCounts: ExcTypeCount[] = useMemo(() => {
    const filtered = rawExcs.filter((e) => !severity || normSeverity(e.severity) === severity);
    const tmap = new Map<string, { n: number; severe: number }>();
    filtered.forEach((e) => {
      const label = prettify(e.exception_type);
      const cur = tmap.get(label) ?? { n: 0, severe: 0 };
      cur.n += 1;
      const sv = normSeverity(e.severity);
      if (sv === 'critical' || sv === 'high') cur.severe += 1;
      tmap.set(label, cur);
    });
    let maxSevere = 0;
    let attnLabel: string | null = null;
    tmap.forEach((v, k) => { if (v.severe > maxSevere) { maxSevere = v.severe; attnLabel = k; } });
    return [...tmap.entries()]
      .map(([label, v]) => ({ label, n: v.n, attn: label === attnLabel && maxSevere > 0 }))
      .sort((a, b) => b.n - a.n);
  }, [rawExcs, severity]);

  // ---- Top Exception Suppliers (unfiltered) ----
  // Canonical supplier per FRONTEND_HANDOFF_FOR_VAMSI.md §8 — never the
  // AI-extracted free-text name. Unresolved documents group under
  // UNRESOLVED_SUPPLIER rather than being silently dropped from the count.
  const suppliers: SupplierCount[] = useMemo(() => {
    const smap = new Map<string, number>();
    rawExcs.forEach((e) => {
      const ui = e.document_id ? uiRowMap.get(e.document_id) : undefined;
      const name = ui?.supplier_id ? (ui.supplier_name ?? UNRESOLVED_SUPPLIER) : UNRESOLVED_SUPPLIER;
      smap.set(name, (smap.get(name) ?? 0) + 1);
    });
    return [...smap.entries()].map(([name, n]) => ({ name, n })).sort((a, b) => b.n - a.n).slice(0, 5);
  }, [rawExcs, uiRowMap]);

  const maxSupplierCount = Math.max(1, ...suppliers.map((s) => s.n));

  // ---- Document Mix (documents captured in the period, by type) ----
  // Real per the canonical ap_documents.document_type enum — replaces the old
  // "Invoices by Stage" card, which depended on ap_documents.stage (frozen at
  // "review", so it could never render a real breakdown). The canonical four
  // lifecycle types always show — even at 0 — so coverage gaps (e.g. no GRNs
  // against many invoices) are visible rather than hidden.
  const documentMix = useMemo(() => {
    const counts = new Map<string, number>();
    let total = 0;
    rawDocs.forEach((d) => {
      if (!inPeriod(d.created_at)) return;
      const t = (d.document_type ?? 'other').toLowerCase();
      counts.set(t, (counts.get(t) ?? 0) + 1);
      total += 1;
    });
    const known = new Set<string>(DOC_MIX_ORDER);
    const rows = DOC_MIX_ORDER.map((t) => ({ label: REPORTING_DOCUMENT_TYPE_LABELS[t], n: counts.get(t) ?? 0 }));
    let other = 0;
    counts.forEach((n, k) => { if (!known.has(k)) other += n; });
    if (other > 0) rows.push({ label: 'Other', n: other });
    return { rows, total };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rawDocs, winStart, winEnd]);
  const maxMixCount = Math.max(1, ...documentMix.rows.map((r) => r.n));

  // ---- AI Insight (local stub, answers from the data above) ----
  const kpiVal = (key: string) => kpiTiles.find((k) => k.key === key)?.value ?? '0';
  const totalInv = trend.reduce((s, t) => s + t.inv, 0);
  const totalExc = trend.reduce((s, t) => s + t.exc, 0);
  const excRate = totalInv ? ((totalExc / totalInv) * 100).toFixed(1) : '0.0';
  const topExcType = exceptionTypeCounts[0];
  const topExcSupplier = suppliers[0];
  const periodWord = PERIOD_LABELS[period].toLowerCase();
  const defaultInsight = topExcType
    ? `${topExcType.label} is the most common exception this ${periodWord} (${topExcType.n}${topExcSupplier ? `, led by ${topExcSupplier.name}` : ''}). Exception rate ${excRate}%.`
    : `No exceptions logged this ${periodWord}. ${kpiVal('invoices_created')} invoices created.`;

  const resolveInsight = (prompt: string): string => {
    const q = prompt.toLowerCase();
    if (q.includes('supplier') || q.includes('vendor')) {
      return topExcSupplier
        ? `${topExcSupplier.name} has the most exceptions this ${periodWord} (${topExcSupplier.n}).`
        : 'No exceptions are attributed to any supplier in this period.';
    }
    if (q.includes('exception') || q.includes('attention') || q.includes('risk') || q.includes('top')) {
      return topExcType
        ? `${kpiVal('open_exceptions')} exceptions open. Most common type: ${topExcType.label} (${topExcType.n})${topExcSupplier ? `, led by ${topExcSupplier.name}` : ''}.`
        : `${kpiVal('open_exceptions')} exceptions open in this period.`;
    }
    if (q.includes('gap') || q.includes('coverage') || q.includes('grn') || q.includes('mix') || q.includes('document') || q.includes('type')) {
      if (documentMix.total === 0) return 'No documents were captured in this period.';
      const inv = documentMix.rows.find((r) => r.label === REPORTING_DOCUMENT_TYPE_LABELS.invoice)?.n ?? 0;
      const grn = documentMix.rows.find((r) => r.label === REPORTING_DOCUMENT_TYPE_LABELS.grn)?.n ?? 0;
      const gap = inv > 0 && grn < inv ? ` GRNs (${grn}) trail invoices (${inv}) — a possible 3-way match coverage gap.` : '';
      return `${documentMix.total} documents captured: ${documentMix.rows.map((r) => `${r.n} ${r.label.toLowerCase()}`).join(', ')}.${gap}`;
    }
    if (q.includes('rate') || q.includes('trend') || q.includes('month')) {
      return `Across this ${periodWord}: ${totalInv} invoices and ${totalExc} exceptions — a ${excRate}% exception rate.`;
    }
    if (q.includes('summar') || q.includes('period') || q.includes('overview')) {
      return `This ${periodWord}: ${kpiVal('emails_processed')} emails processed, ${kpiVal('invoices_created')} invoices created, ${kpiVal('open_exceptions')} exceptions open. Exception rate ${excRate}%.`;
    }
    return "I'm not connected to a live AI backend yet — once wired up to Claude or another API, I'll be able to answer anything about this report here.";
  };

  const askInsight = (prompt: string) => {
    const query = prompt.trim();
    if (!query || insightLoading) return;
    setInsightPrompt('');
    setInsightLoading(true);
    clearTimeout(insightTimer.current);
    insightTimer.current = setTimeout(() => {
      setInsightResponse(resolveInsight(query));
      setInsightLoading(false);
    }, 500);
  };

  if (loading) {
    return (
      <div className="pcb-view">
        <div className="rounded-xl border border-border bg-surface p-10 text-center text-[13.5px] text-muted-foreground">
          Loading reporting data…
        </div>
      </div>
    );
  }
  if (error) {
    return (
      <div className="pcb-view">
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
      </div>
    );
  }

  const exportCsv = () => {
    downloadReportCsv([
      { title: 'KPI Tiles', headers: ['Label', 'Value', 'Note'], rows: kpiTiles.map((k) => [k.label, k.value, k.sub]) },
      { title: 'Invoices vs Exceptions (by month)', headers: ['Month', 'Invoices', 'Exceptions'], rows: trend.map((t) => [t.m, t.inv, t.exc]) },
      { title: `Exception Types${severity ? ` (${SEVERITY_LABELS[severity]})` : ''}`, headers: ['Type', 'Count', 'Highest Impact'], rows: exceptionTypeCounts.map((t) => [t.label, t.n, t.attn ? 'Yes' : '']) },
      { title: 'Document Mix', headers: ['Type', 'Count'], rows: documentMix.rows.map((r) => [r.label, r.n]) },
      { title: 'Top Exception Suppliers', headers: ['Supplier', 'Count'], rows: suppliers.map((s) => [s.name, s.n]) },
    ]);
  };

  return (
    <div className="pcb-view">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="mb-[3px] text-[23px] font-bold uppercase tracking-[.01em]">Reporting</h1>
          <p className="text-[13.5px] text-muted-foreground">
            {PERIOD_LABELS[period]} · processing &amp; exception trends
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={exportCsv}
            className="pcb-btn flex h-[34px] items-center gap-1.5 rounded-lg border border-line bg-surface px-3.5 text-[12.5px] font-semibold text-text2"
          >
            <Download size={14} />
            Export CSV
          </button>
          <div className="relative">
            <button
              type="button"
              onClick={() => setPeriodOpen((o) => !o)}
              className="pcb-btn flex h-[34px] items-center gap-2 rounded-lg border border-line bg-surface px-3.5 text-[12.5px] font-semibold text-text2"
            >
              <Filter size={14} />{PERIOD_LABELS[period]}
              <span className="ml-0.5 flex opacity-60 transition-transform" style={{ transform: periodOpen ? 'rotate(180deg)' : 'none' }}>
                <ChevronDown size={13} />
              </span>
            </button>
            {periodOpen && (
              <div className="pcb-view absolute right-0 top-11 z-30 min-w-[190px] rounded-[10px] border border-border bg-surface p-[5px] shadow-[0_10px_30px_rgba(16,24,40,.14)]">
                {PERIODS.filter((p) => p !== 'custom').map((p) => {
                  const on = period === p;
                  return (
                    <button
                      key={p}
                      type="button"
                      onClick={() => { setPeriod(p); setPeriodOpen(false); }}
                      className="flex h-9 w-full items-center justify-between gap-2.5 rounded-[7px] border-none px-[11px] text-[13px]"
                      style={{ background: on ? 'var(--tint)' : 'transparent', color: on ? 'var(--navy)' : 'var(--text2)', fontWeight: on ? 700 : 500 }}
                    >
                      <span>{PERIOD_LABELS[p]}</span>
                      <span className="flex text-navy" style={{ opacity: on ? 1 : 0 }}><CheckCircle2 size={14} /></span>
                    </button>
                  );
                })}
                <div className="mt-1 flex flex-col gap-2 border-t border-border2 px-1.5 pb-1 pt-2">
                  <span className="text-[11px] font-bold uppercase tracking-[.04em] text-faint">Custom Range</span>
                  <input type="date" value={cfrom} onChange={(e) => setCfrom(e.target.value)} className="h-[32px] w-full rounded-lg border border-line bg-surface px-2.5 font-sans text-[12.5px] text-foreground" />
                  <input type="date" value={cto} onChange={(e) => setCto(e.target.value)} className="h-[32px] w-full rounded-lg border border-line bg-surface px-2.5 font-sans text-[12.5px] text-foreground" />
                  <button
                    type="button"
                    onClick={() => { if (cfrom && cto) { setPeriod('custom'); setPeriodOpen(false); } }}
                    className="h-[32px] rounded-lg border-none bg-navy text-[12.5px] font-semibold text-white"
                  >
                    Apply range
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="mb-[18px] grid grid-cols-2 gap-3.5 sm:grid-cols-4">
        {kpiTiles.map((k) => {
          const Icon = KPI_ICONS[k.key];
          const color = k.accent === 'red' ? RED : 'var(--text)';
          return (
            <div key={k.key} className="rounded-xl border border-border bg-surface p-4 shadow-[0_1px_2px_rgba(16,24,40,.04)]">
              <div className="mb-2.5 flex items-center justify-between">
                <span className="text-[11px] font-bold uppercase tracking-[.05em] text-muted-foreground">{k.label}</span>
                <Icon size={15} color={color} />
              </div>
              <div className="text-[26px] font-extrabold leading-none tracking-[-.03em] tabular-nums" style={{ color }}>
                {k.value}
              </div>
              <div className="mt-1.5 text-xs text-faint">{k.sub}</div>
            </div>
          );
        })}
      </div>

      <div className="mb-4 grid grid-cols-1 gap-4 lg:grid-cols-[1.5fr_1fr]">
        <div className="rounded-xl border border-border bg-surface p-[18px_20px] shadow-[0_1px_2px_rgba(16,24,40,.04)]">
          <div className="mb-1.5 flex items-center justify-between">
            <span className="text-[14.5px] font-bold uppercase tracking-wide">Invoices vs. Exceptions</span>
            <div className="flex gap-4">
              <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                <span className="h-[11px] w-[11px] rounded-[3px] bg-navy" />Invoices
              </span>
              <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                <span className="h-[11px] w-[11px] rounded-[3px]" style={{ background: RED }} />Exceptions
              </span>
            </div>
          </div>
          {/* Text alternative for screen readers — the bar chart itself has no
              accessible data representation of its own. */}
          <p className="sr-only">
            Invoices versus exceptions by month:{' '}
            {trend.length === 0 ? 'no activity in this period.' : trend.map((t) => `${t.m}: ${t.inv} invoices, ${t.exc} exceptions`).join('; ')}
          </p>
          <div style={{ height: 254 }} aria-hidden="true">
            {trend.length === 0 ? (
              <div className="flex h-full items-center justify-center text-[12.5px] text-muted-foreground">No activity in this period.</div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={trend} barGap={5} margin={{ top: 24, right: 0, bottom: 0, left: 0 }}>
                  <XAxis dataKey="m" axisLine={false} tickLine={false} tick={{ fontSize: 12, fontWeight: 600, fill: 'var(--muted)' }} />
                  <YAxis hide domain={[0, 'dataMax']} />
                  <Tooltip content={<MonthTooltip />} cursor={{ fill: 'rgba(30,58,138,.06)' }} />
                  <Bar dataKey="inv" fill="var(--navy)" radius={[5, 5, 0, 0]} maxBarSize={30} />
                  <Bar dataKey="exc" fill={RED} radius={[5, 5, 0, 0]} maxBarSize={30} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        <div className="flex flex-col rounded-xl border border-border bg-surface p-[18px_20px] shadow-[0_1px_2px_rgba(16,24,40,.04)]">
          <div className="mb-4 flex items-center justify-between">
            <span className="text-[14.5px] font-bold uppercase tracking-wide">Processing Health</span>
          </div>
          <div className="mb-1.5 flex items-baseline gap-2">
            <span className="text-[38px] font-extrabold leading-none tracking-[-.03em] tabular-nums" style={{ color: GREEN }}>
              93.2%
            </span>
            <span className="text-[13px] font-semibold text-muted-foreground">on track</span>
          </div>
          <div className="relative" style={{ margin: '10px 0 14px' }}>
            <div className="flex h-3.5 overflow-hidden rounded-lg">
              <div style={{ width: '93.2%', background: 'var(--navy)' }} />
              <div style={{ width: '6.8%', background: RED }} />
            </div>
          </div>
          <div className="mb-1.5 flex justify-between text-[12.5px]">
            <span className="inline-flex items-center gap-[7px] text-text2">
              <span className="h-2.5 w-2.5 rounded-[3px] bg-navy" />On track
            </span>
            <span className="font-bold tabular-nums">5,088</span>
          </div>
          <div className="flex justify-between text-[12.5px]">
            <span className="inline-flex items-center gap-[7px] text-text2">
              <span className="h-2.5 w-2.5 rounded-[3px]" style={{ background: RED }} />Needs attention
            </span>
            <span className="font-bold tabular-nums">372</span>
          </div>
          <div className="mt-auto border-t border-border2 pt-4 text-[12.5px] text-muted-foreground" style={{ marginTop: 'auto' }}>
            Avg processing time <strong className="text-foreground">2.4h</strong>
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-border bg-surface p-[18px_20px] shadow-[0_1px_2px_rgba(16,24,40,.04)]">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-[14.5px] font-bold uppercase tracking-wide">Exception Types</span>
          {/* Severity filter lives here — it only ever scoped this chart, so it
              belongs on the chart rather than masquerading as a global filter. */}
          <div className="flex flex-wrap items-center gap-1.5">
            <button
              type="button"
              onClick={() => setSeverity(null)}
              className="pcb-btn h-7 rounded-md px-2.5 text-[11.5px] font-semibold"
              style={{
                border: `1px solid ${!severity ? 'var(--navy)' : 'var(--line)'}`,
                background: !severity ? 'var(--navy)' : 'var(--surface)',
                color: !severity ? '#fff' : 'var(--text3)',
              }}
            >
              All
            </button>
            {SEVERITIES.map((sev) => {
              const on = severity === sev;
              return (
                <button
                  key={sev}
                  type="button"
                  onClick={() => setSeverity((prev) => (prev === sev ? null : sev))}
                  className="pcb-btn h-7 rounded-md px-2.5 text-[11.5px] font-semibold"
                  style={{
                    border: `1px solid ${on ? 'var(--navy)' : 'var(--line)'}`,
                    background: on ? 'var(--navy)' : 'var(--surface)',
                    color: on ? '#fff' : 'var(--text3)',
                  }}
                >
                  {SEVERITY_LABELS[sev]}
                </button>
              );
            })}
          </div>
        </div>
        <p className="sr-only">
          Exception counts by type:{' '}
          {exceptionTypeCounts.length === 0 ? 'none logged.' : exceptionTypeCounts.map((t) => `${t.label}: ${t.n}${t.attn ? ' (highest impact)' : ''}`).join('; ')}
        </p>
        <div style={{ height: Math.max(1, exceptionTypeCounts.length) * 35 + 10 }} className="mt-4" aria-hidden="true">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={exceptionTypeCounts}
              layout="vertical"
              barCategoryGap={13}
              margin={{ top: 0, right: 40, bottom: 0, left: 0 }}
            >
              <XAxis type="number" hide />
              <YAxis
                type="category"
                dataKey="label"
                width={150}
                axisLine={false}
                tickLine={false}
                tick={{ fontSize: 13, fontWeight: 500, fill: 'var(--text2)' }}
              />
              <Tooltip content={<ExceptionTypeTooltip />} cursor={{ fill: 'rgba(30,58,138,.06)' }} />
              <Bar dataKey="n" radius={6} barSize={22} label={{ position: 'right', fontSize: 13, fontWeight: 700, fill: 'var(--text)' }}>
                {exceptionTypeCounts.map((t) => (
                  <Cell key={t.label} fill={t.attn ? RED : 'var(--navy)'} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
        {exceptionTypeCounts.length === 0 && (
          <p className="mt-3 text-[12.5px] text-muted-foreground">No exceptions logged{severity ? ` at ${SEVERITY_LABELS[severity].toLowerCase()} severity` : ''} yet.</p>
        )}
      </div>

      <div className="mb-[18px] mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="rounded-xl border border-border bg-surface p-[18px_20px] shadow-[0_1px_2px_rgba(16,24,40,.04)]">
          <div className="mb-4 flex items-center justify-between gap-2">
            <span className="text-[14.5px] font-bold uppercase tracking-wide">Document Mix</span>
            <span className="text-[12px] text-muted-foreground">
              <strong className="tabular-nums text-foreground">{documentMix.total.toLocaleString('en-US')}</strong> in {PERIOD_LABELS[period].toLowerCase()}
            </span>
          </div>
          <p className="sr-only">
            Documents captured by type:{' '}
            {documentMix.total === 0 ? 'none in this period.' : documentMix.rows.map((r) => `${r.label}: ${r.n}`).join('; ')}
          </p>
          {documentMix.total === 0 ? (
            <div className="flex h-[140px] items-center justify-center rounded-lg border border-dashed border-border2 px-6 text-center text-[12.5px] text-muted-foreground">
              No documents captured in this period.
            </div>
          ) : (
            <div className="flex flex-col gap-3.5" aria-hidden="true">
              {documentMix.rows.map((r) => {
                const pct = documentMix.total ? Math.round((r.n / documentMix.total) * 100) : 0;
                return (
                  <div key={r.label} className="min-w-0">
                    <div className="mb-1 flex items-center justify-between gap-2 text-[13.5px]">
                      <span className="truncate font-semibold">{r.label}</span>
                      <span className="flex-none tabular-nums">
                        <span className="font-semibold">{r.n.toLocaleString('en-US')}</span>
                        <span className="ml-1.5 text-[12px] text-faint">{pct}%</span>
                      </span>
                    </div>
                    <div className="h-[6px] overflow-hidden rounded-md bg-border2">
                      <div className="h-full rounded-md bg-navy" style={{ width: `${(r.n / maxMixCount) * 100}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="rounded-xl border border-border bg-surface p-[18px_20px] shadow-[0_1px_2px_rgba(16,24,40,.04)]">
          <span className="mb-4 block text-[14.5px] font-bold uppercase tracking-wide">Top Exception Suppliers</span>
          <div className="flex flex-col gap-3.5">
            {suppliers.length === 0 && (
              <p className="text-[12.5px] text-muted-foreground">No exceptions logged yet.</p>
            )}
            {suppliers.map((s, i) => (
              <div key={s.name} className="flex items-center gap-3">
                <span className="w-4 flex-none text-[12.5px] font-bold text-faint">{i + 1}</span>
                <div className="min-w-0 flex-1">
                  <div className="mb-1 flex items-center justify-between gap-2 text-[13.5px] font-semibold">
                    <span className="truncate">{s.name}</span>
                    <span className="tabular-nums">{s.n}</span>
                  </div>
                  <div className="h-[6px] overflow-hidden rounded-md bg-border2">
                    <div className="h-full rounded-md bg-navy" style={{ width: `${(s.n / maxSupplierCount) * 100}%` }} />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="flex items-start gap-[15px] rounded-xl border border-border bg-tint p-[17px_19px]">
        <div className="flex h-[38px] w-[38px] flex-none items-center justify-center rounded-[10px] bg-navy text-white shadow-[0_2px_8px_rgba(30,58,138,.3)]">
          <Sparkles size={20} color="#fff" />
        </div>
        <div className="flex-1">
          <div className="mb-1 flex flex-wrap items-center gap-2">
            <span className="text-[13.5px] font-bold uppercase tracking-wide text-navy">AI Insight</span>
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
              placeholder="Ask AI Insight… e.g. “What are the top exceptions?”"
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
    </div>
  );
}
