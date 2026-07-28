import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link, useLocation } from 'react-router-dom';
import { ChevronLeft, ChevronRight, Search, X } from 'lucide-react';
import { DataTable, type DataTableColumn } from '@/components/DataTable';
import { SeverityBadge } from '@/components/SeverityBadge';
import { DocumentLifecyclePopup } from '@/components/DocumentLifecyclePopup';
import { AssigneePicker } from '@/components/AssigneePicker';
import { RED, type Severity } from '@/lib/theme';
import type { WorklistRow } from '@/data';
import { supabase } from '@/lib/supabase';
import { AP_DOCUMENT_SELECT, compareWorklistRows, fetchDocumentUiRows, titleCaseDocType, toWorklistRow, type ApDocRow } from '@/lib/documentRow';
import { fetchLifecycle, type LifecycleStageName, type LifecycleStageRow } from '@/lib/lifecycle';

// The hovered row's own document_type maps 1:1 onto a lifecycle stage name now
// that document_type is a canonical enum (see FRONTEND_HANDOFF_FOR_VAMSI.md §4.2)
// — no fuzzy mapping needed. 'other'/credit_memo/supplier_statement aren't part
// of the 4-stage chain, so they highlight nothing.
function ownLifecycleStage(documentType: string): LifecycleStageName | null {
  if (documentType === 'purchase_order') return 'purchase_order';
  if (documentType === 'acknowledgement') return 'acknowledgement';
  if (documentType === 'grn') return 'grn';
  if (documentType === 'invoice') return 'invoice';
  return null;
}

type SortableKey = keyof WorklistRow;

// Client-side sortable columns. 'matched_against' and 'age' are derived/computed,
// not simple fields, so those columns stay unsortable — same as before, but sorting
// now runs in the browser over the full row set (see the query note below).
const CLIENT_SORTABLE = new Set<SortableKey>([
  'display_id', 'supplier', 'doc_ref', 'po_number', 'document_type', 'amount',
  'confidence', 'priority', 'exceptions', 'severity', 'stage', 'assigned_to',
  'created_at', 'updated_at',
]);
// These columns default to descending (highest/most-recent first) on the first sort click.
const NUMERIC_KEYS = new Set<SortableKey>(['amount', 'confidence', 'exceptions', 'severity']);

const PAGE_SIZE = 25;
const SEARCH_DEBOUNCE_MS = 300;

const TOOLTIP_WIDTH = 400;
const TOOLTIP_MARGIN = 12;
const TOOLTIP_HIDE_DELAY = 150;

type HoverState =
  | { key: string; placement: 'right'; top: number; left: number }
  | { key: string; placement: 'above'; bottom: number; left: number };

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function fmtMoney(n: number) {
  return '$' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtDate(iso: string) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '—';
  const time = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
  return `${MONTHS[d.getMonth()]} ${d.getDate()}, ${time}`;
}

/** Age since capture ("3h 20m", "4d 2h") — used in place of the old SLA column,
 * which depended on ap_documents.sla_due_at/sla_breached that nothing ever sets. */
function fmtAge(iso: string) {
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

function ageColor(iso: string) {
  const created = new Date(iso).getTime();
  if (isNaN(created)) return 'var(--muted)';
  const hours = (Date.now() - created) / 3600000;
  return hours >= 24 ? RED : 'var(--muted)';
}

const FILTERS: [string, string][] = [
  ['all', 'All'],
  ['exception', 'Exceptions'],
];

const SEVERITY_LABEL: Record<Severity, string> = { critical: 'Critical', high: 'High', medium: 'Medium', low: 'Low' };

export default function WorklistPage() {
  // Dashboard's Open Exceptions KPI and severity-chart rows land here with
  // navigation state (since the Exceptions page they used to point at is gone) —
  // read once on mount to seed the filter/severity below.
  const location = useLocation();
  const navState = location.state as { presetFilter?: string; presetSeverity?: Severity } | null;

  // Holds the full document set; sorting, search and pagination are all applied
  // client-side below (only ~113 rows, so a single fetch is plenty).
  const [worklistData, setWorklistData] = useState<WorklistRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [sortCol, setSortCol] = useState<SortableKey>('created_at');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  // Status filter buttons: null means no button is selected (default state).
  // When null, the table shows every row, same as if "All" were active but with no button highlighted.
  const [filter, setFilter] = useState<string | null>(() => navState?.presetFilter ?? null);
  // No permanent UI control for this (Worklist has no severity filter button) —
  // it only ever arrives via Dashboard's severity chart, shown as a removable chip.
  const [severityFilter, setSeverityFilter] = useState<Severity | null>(() => navState?.presetSeverity ?? null);
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  // Client-side assignment overrides, keyed by row id. Assignment is a write —
  // out of scope for this read-only Supabase phase — so the picker's choices
  // live here (optimistic) rather than persisting to the backend yet. Absent key
  // = fall back to the backend owner on the row.
  const [assignments, setAssignments] = useState<Record<string, string | null>>({});
  const assigneeOf = (r: WorklistRow): string | null =>
    r.id in assignments ? assignments[r.id] : r.assigned_to && r.assigned_to !== '—' ? r.assigned_to : null;
  // True while an assignee dropdown is open. A ref (not state) so the row-hover
  // handler reads it without a re-render/stale-closure. When a picker opens we
  // also close any Lifecycle popup already showing for that row.
  const assigningRef = useRef(false);
  const onAssignOpenChange = (isOpen: boolean) => {
    assigningRef.current = isOpen;
    if (isOpen) {
      clearTimeout(lifecycleHideTimer.current);
      setLifecycleAnchor(null);
    }
  };
  const [hover, setHover] = useState<HoverState | null>(null);
  const hideTimer = useRef<ReturnType<typeof setTimeout>>();

  const cancelHide = () => clearTimeout(hideTimer.current);
  const scheduleHide = () => {
    clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => setHover(null), TOOLTIP_HIDE_DELAY);
  };
  // Shared by mouse hover and keyboard focus on the Priority badge trigger.
  // Also closes the Document Lifecycle popup — the Priority badge sits inside
  // a row that also has its own row-level hover handler (openLifecycle), so
  // moving onto the badge fires both; without this they'd stack and overlap.
  const openPriorityHover = (id: string, el: HTMLElement) => {
    cancelHide();
    clearTimeout(lifecycleHideTimer.current);
    setLifecycleAnchor(null);
    const rect = el.getBoundingClientRect();
    const spaceRight = window.innerWidth - rect.right;
    if (spaceRight >= TOOLTIP_WIDTH + TOOLTIP_MARGIN) {
      setHover({ key: id, placement: 'right', top: rect.top, left: rect.right + 10 });
    } else {
      const left = Math.max(TOOLTIP_MARGIN, Math.min(rect.left, window.innerWidth - TOOLTIP_WIDTH - TOOLTIP_MARGIN));
      setHover({ key: id, placement: 'above', bottom: window.innerHeight - rect.top + 10, left });
    }
  };

  // Document Lifecycle popup: opened on row hover, anchored to the row's top-left.
  const [lifecycleAnchor, setLifecycleAnchor] = useState<{ documentId: string; top: number; left: number } | null>(null);
  const lifecycleHideTimer = useRef<ReturnType<typeof setTimeout>>();
  // Real document_lifecycle_view rows, fetched on first hover and cached per
  // chain so re-hovering the same (or a sibling) document in that chain doesn't
  // re-fetch. Keyed by document_chain_id, not document_id.
  const [lifecycleCache, setLifecycleCache] = useState<Record<string, LifecycleStageRow[]>>({});
  const [lifecycleLoadFailed, setLifecycleLoadFailed] = useState<Record<string, boolean>>({});

  const cancelLifecycleHide = () => clearTimeout(lifecycleHideTimer.current);
  const scheduleLifecycleHide = () => {
    clearTimeout(lifecycleHideTimer.current);
    lifecycleHideTimer.current = setTimeout(() => setLifecycleAnchor(null), 160);
  };
  // The card's own width is fixed (264px content + padding); height varies
  // with which row is expanded, so this is a generous clamping estimate, not
  // an exact value.
  const LIFECYCLE_POPUP_W = 296;
  const LIFECYCLE_POPUP_H = 300;

  // Triggered only from the Doc Ref cell (mouse hover or keyboard focus) —
  // anchors the popup to that cell's position.
  const openLifecycle = (row: WorklistRow, source: HTMLElement) => {
    // A picker menu is open somewhere — don't surface the row-hover popup over it.
    if (assigningRef.current) return;
    clearTimeout(lifecycleHideTimer.current);
    // Also closes the Priority Reason tooltip — see the note on openPriorityHover.
    clearTimeout(hideTimer.current);
    setHover(null);
    if (lifecycleAnchor?.documentId !== row.id) {
      const rect = source.getBoundingClientRect();
      const left = Math.max(16, Math.min(rect.left + 48, window.innerWidth - LIFECYCLE_POPUP_W - 16));
      const top = Math.max(16, Math.min(rect.top, window.innerHeight - LIFECYCLE_POPUP_H - 16));
      setLifecycleAnchor({ documentId: row.id, top, left });
    }
    const chainId = row.document_chain_id;
    if (chainId && !(chainId in lifecycleCache) && !lifecycleLoadFailed[chainId]) {
      fetchLifecycle(chainId)
        .then((stages) => setLifecycleCache((prev) => ({ ...prev, [chainId]: stages })))
        .catch(() => setLifecycleLoadFailed((prev) => ({ ...prev, [chainId]: true })));
    }
  };

  // Debounce the search box so filtering doesn't recompute on every keystroke.
  useEffect(() => {
    const t = setTimeout(() => setSearch(searchInput), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [searchInput]);

  // Any filter/sort/search change starts back at page 1 — a stale page number
  // from a previous, larger result set could otherwise land past the new end.
  useEffect(() => {
    setPage(1);
  }, [filter, severityFilter, search, sortCol, sortDir]);

  // Read the document queue directly from Supabase. Supplier/amount/PO live in the
  // linked email's ai_understanding; exception count/severity come from the
  // embedded exception_cases rows. Extracted from the effect so the error state's
  // Retry button can re-run it without duplicating the query.
  const [reloadToken, setReloadToken] = useState(0);
  const retry = () => setReloadToken((t) => t + 1);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    supabase
      .from('ap_documents')
      .select(AP_DOCUMENT_SELECT)
      .eq('is_active', true)
      .order('created_at', { ascending: false })
      .then(({ data, error: qErr }) => {
        if (cancelled) return;
        if (qErr) {
          setError(qErr.message);
          setLoading(false);
          return;
        }
        const rows = (data ?? []) as unknown as ApDocRow[];
        // document_ui_view is a separate query (it's a view, not embeddable via
        // the ap_documents FK the way email_messages/exception_cases are) —
        // fetched for exactly these ids and merged in JS. See documentRow.ts.
        fetchDocumentUiRows(rows.map((d) => d.id))
          .then((uiMap) => {
            if (cancelled) return;
            setWorklistData(rows.map((d) => toWorklistRow(d, uiMap.get(d.id))));
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
  }, [reloadToken]);

  const onSort = (col: string) => {
    const key = col as SortableKey;
    if (!CLIENT_SORTABLE.has(key)) return; // 'matched_against' / 'age' — not sortable
    if (key === sortCol) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortCol(key);
      setSortDir(key === 'created_at' || key === 'updated_at' || NUMERIC_KEYS.has(key) ? 'desc' : 'asc');
    }
  };

  // Client-side pipeline: filter → search → sort → paginate.
  const q = search.trim().toLowerCase();
  const filtered = worklistData.filter((r) => {
    if (filter === 'exception' && !(r.exceptions > 0)) return false;
    if (severityFilter && r.severity !== severityFilter) return false;
    if (q) {
      return [r.supplier, r.doc_ref, r.po_number, r.display_id].some((v) => v.toLowerCase().includes(q));
    }
    return true;
  });
  const sorted = [...filtered].sort((a, b) => compareWorklistRows(a, b, sortCol, sortDir));
  const totalCount = sorted.length;
  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const rangeStart = totalCount === 0 ? 0 : (safePage - 1) * PAGE_SIZE + 1;
  const rangeEnd = Math.min(safePage * PAGE_SIZE, totalCount);
  const displayRows = sorted
    .slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE)
    .map((r) => ({ ...r, _key: r.id }));

  const hoveredRow = hover ? worklistData.find((r) => r.id === hover.key) : null;

  const columns: DataTableColumn<WorklistRow>[] = [
    {
      key: 'display_id',
      label: 'Preview',
      sortable: true,
      // Click the ID to open the document-review / compare page. The full row is
      // passed via router state so the detail page renders without an extra fetch
      // (there's no single-document GET endpoint); it falls back to a re-fetch on refresh.
      cell: (r) => (
        <Link
          to={`/worklist/${r.id}`}
          state={{ row: r }}
          className="text-[13px] font-semibold tabular-nums text-navy underline-offset-2 hover:underline"
        >
          {r.display_id}
        </Link>
      ),
    },
    { key: 'supplier', label: 'Supplier', sortable: true, cell: (r) => <span className="text-[13.5px]">{r.supplier}</span> },
    {
      key: 'doc_ref',
      label: 'Doc Ref',
      sortable: true,
      // The Document Lifecycle popup opens only from this column — hovering or
      // focusing anywhere else in the row must not trigger it.
      cell: (r) => (
        <span
          tabIndex={0}
          className="inline-block cursor-help text-[13px] tabular-nums"
          onMouseEnter={(e) => openLifecycle(r, e.currentTarget)}
          onFocus={(e) => openLifecycle(r, e.currentTarget)}
          onMouseLeave={scheduleLifecycleHide}
          onBlur={scheduleLifecycleHide}
          onKeyDown={(e) => { if (e.key === 'Escape') setLifecycleAnchor(null); }}
        >
          {r.doc_ref}
        </span>
      ),
    },
    { key: 'po_number', label: 'PO Number', sortable: true, cell: (r) => <span className="text-[13px] tabular-nums text-muted-foreground">{r.po_number}</span> },
    { key: 'document_type', label: 'Document Type', sortable: true, cell: (r) => <span className="whitespace-nowrap text-[13px] text-text2">{titleCaseDocType(r.document_type)}</span> },
    { key: 'amount', label: 'Amount', align: 'right', sortable: true, cell: (r) => <span className="text-[13.5px] font-semibold tabular-nums">{fmtMoney(r.amount)}</span> },
    { key: 'confidence', label: 'Confidence Score', align: 'right', sortable: true, hideBelow: 'lg', cell: (r) => <span className="text-[13px] tabular-nums text-muted-foreground">{r.confidence}%</span> },
    {
      key: 'priority',
      label: 'Review Priority',
      sortable: true,
      cell: (r) => (
        // Shrink-wrapped to its own content so the tooltip's anchor rect
        // matches what's actually visible on screen.
        // Keyboard-operable: a real button, so it's tabbable, and onFocus/onBlur
        // mirror the mouse handlers so keyboard users get the same tooltip.
        <button
          type="button"
          className="inline-block cursor-help border-none bg-transparent p-0"
          onMouseEnter={(e) => openPriorityHover(r.id, e.currentTarget)}
          onFocus={(e) => openPriorityHover(r.id, e.currentTarget)}
          onMouseLeave={scheduleHide}
          onBlur={scheduleHide}
          onKeyDown={(e) => { if (e.key === 'Escape') setHover(null); }}
          aria-label={`${r.priority} review priority — reason: ${r.priority_reason || 'not provided'}`}
        >
          <SeverityBadge severity={r.priority} />
        </button>
      ),
    },
    { key: 'exceptions', label: 'Exceptions', align: 'right', sortable: true, cell: (r) => <span className="text-[13px] tabular-nums" style={{ color: r.exceptions > 0 ? RED : 'var(--muted)' }}>{r.exceptions}</span> },
    // Highest exception severity from the exception_cases table. SeverityBadge
    // requires a valid Severity, so null (no exceptions) falls back to a muted dash.
    {
      key: 'severity',
      label: 'Severity',
      sortable: true,
      cell: (r) => (r.severity ? <SeverityBadge severity={r.severity} /> : <span className="text-[13px] text-faint">—</span>),
    },
    {
      key: 'age',
      label: 'Age',
      hideBelow: 'md',
      cell: (r) => <span className="text-[13px] tabular-nums" style={{ color: ageColor(r.created_at) }}>{fmtAge(r.created_at)}</span>,
    },
    {
      key: 'assigned_to',
      label: 'Assigned To',
      sortable: true,
      // Interactive assignee picker (avatar chip + searchable team roster). The
      // choice is held in local `assignments` state — assignment isn't persisted
      // to Supabase yet (read-only phase). The wrapper stops click propagation so
      // opening the picker never triggers the row's hover/nav behavior.
      cell: (r) => (
        <div data-assignee-trigger="true" onClick={(e) => e.stopPropagation()}>
          <AssigneePicker
            value={assigneeOf(r)}
            onChange={(name) => setAssignments((prev) => ({ ...prev, [r.id]: name }))}
            onOpenChange={onAssignOpenChange}
          />
        </div>
      ),
    },
    { key: 'created_at', label: 'Created', sortable: true, cell: (r) => <span className="whitespace-nowrap text-[13px] tabular-nums text-muted-foreground">{fmtDate(r.created_at)}</span> },
    { key: 'updated_at', label: 'Updated', sortable: true, hideBelow: 'lg', cell: (r) => <span className="whitespace-nowrap text-[13px] tabular-nums text-muted-foreground">{fmtDate(r.updated_at)}</span> },
  ];

  return (
    <div className="pcb-view">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="mb-[3px] text-[23px] font-bold uppercase tracking-[.01em]">Worklist</h1>
          <p className="text-[13.5px] text-muted-foreground">
            All open documents · <span className="tabular-nums">{totalCount}</span> in queue
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-[7px]">
          <div className="relative">
            <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input
              type="text"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Search supplier, doc ref, PO, ID…"
              aria-label="Search supplier, doc ref, PO, or ID"
              className="h-[34px] w-[230px] rounded-lg border border-line bg-surface pl-8 pr-3 text-[12.5px] font-medium text-text2 outline-none placeholder:text-muted-foreground focus:border-navy"
            />
          </div>
          {FILTERS.map(([id, label]) => {
            const on = filter === id;
            return (
              <button
                key={id}
                type="button"
                aria-pressed={on}
                // Toggle behavior: clicking the already-active button deselects it (back to null/no filter);
                // clicking any other button selects it and deselects whichever was previously active.
                onClick={() => setFilter((prev) => (prev === id ? null : id))}
                className="pcb-btn h-[34px] rounded-lg px-3.5 text-[12.5px] font-semibold"
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
      {/* Active-filter summary — each chip individually removable, plus a single
          "Clear filters" action once more than one filter is active. */}
      {(filter || severityFilter || search) && (
        <div className="mb-3 flex flex-wrap items-center gap-2 text-[12.5px]">
          <span className="text-muted-foreground">Filtered by:</span>
          {filter && (
            <button
              type="button"
              onClick={() => setFilter(null)}
              className="pcb-btn inline-flex items-center gap-1 rounded-full border border-line bg-surface px-2.5 py-1 font-semibold text-text2"
            >
              {FILTERS.find(([id]) => id === filter)?.[1] ?? filter}
              <X size={12} />
            </button>
          )}
          {severityFilter && (
            <button
              type="button"
              onClick={() => setSeverityFilter(null)}
              className="pcb-btn inline-flex items-center gap-1 rounded-full border border-line bg-surface px-2.5 py-1 font-semibold text-text2"
            >
              Severity: {SEVERITY_LABEL[severityFilter]}
              <X size={12} />
            </button>
          )}
          {search && (
            <button
              type="button"
              onClick={() => setSearchInput('')}
              className="pcb-btn inline-flex items-center gap-1 rounded-full border border-line bg-surface px-2.5 py-1 font-semibold text-text2"
            >
              Search: "{search}"
              <X size={12} />
            </button>
          )}
          {(filter ? 1 : 0) + (severityFilter ? 1 : 0) + (search ? 1 : 0) > 1 && (
            <button
              type="button"
              onClick={() => { setFilter(null); setSeverityFilter(null); setSearchInput(''); }}
              className="text-[12px] font-semibold text-navy underline-offset-2 hover:underline"
            >
              Clear all
            </button>
          )}
        </div>
      )}
      {loading ? (
        <div className="rounded-xl border border-border bg-surface p-10 text-center text-[13.5px] text-muted-foreground">
          Loading document queue…
        </div>
      ) : error ? (
        <div className="flex flex-col items-center gap-3 rounded-xl border border-border bg-surface p-10 text-center text-[13.5px]">
          <span style={{ color: RED }}>{error}</span>
          <button
            type="button"
            onClick={retry}
            className="pcb-btn h-[34px] rounded-lg border border-line bg-surface px-3.5 text-[12.5px] font-semibold text-navy"
          >
            Retry
          </button>
        </div>
      ) : (
        <>
          <DataTable
            columns={columns}
            rows={displayRows}
            sort={{ col: sortCol, dir: sortDir }}
            onSort={onSort}
            minWidth={1650}
          />
          <div className="mt-3 flex items-center justify-between text-[12.5px] text-muted-foreground">
            <span>
              {totalCount === 0 ? 'No results' : `${rangeStart}–${rangeEnd} of ${totalCount}`}
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={safePage <= 1}
                className="pcb-btn flex h-8 w-8 items-center justify-center rounded-lg border border-line bg-surface disabled:opacity-40"
              >
                <ChevronLeft size={14} />
              </button>
              <span className="tabular-nums">Page {safePage} of {totalPages}</span>
              <button
                type="button"
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={safePage >= totalPages}
                className="pcb-btn flex h-8 w-8 items-center justify-center rounded-lg border border-line bg-surface disabled:opacity-40"
              >
                <ChevronRight size={14} />
              </button>
            </div>
          </div>
        </>
      )}
      {hoveredRow && createPortal(
        // Portaled to document.body: this page's root .pcb-view div has a transform-based
        // fade-in animation, and a transform-animating ancestor becomes the containing block
        // for `position: fixed` descendants — which would otherwise pin this tooltip far below
        // the viewport instead of next to the hovered badge. Same fix as the AP Inbox tooltip.
        <div
          className="pcb-view fixed z-[200] min-w-[220px] max-w-[300px] rounded-xl bg-[#111a33] p-[10px_12px] text-white shadow-[0_12px_36px_rgba(0,0,0,.32)]"
          style={
            hover!.placement === 'right'
              ? { top: hover!.top, left: hover!.left }
              : { bottom: hover!.bottom, left: hover!.left }
          }
          onMouseEnter={cancelHide}
          onMouseLeave={scheduleHide}
        >
          <div className="mb-1.5 text-[10.5px] font-bold uppercase tracking-[.06em] text-[#8ca0d6]">Priority Reason</div>
          <p className="whitespace-normal break-words text-[12px] leading-[1.45] text-[#c3cce3]">{hoveredRow.priority_reason}</p>
        </div>,
        document.body,
      )}
      {lifecycleAnchor && (() => {
        const lcRow = worklistData.find((r) => r.id === lifecycleAnchor.documentId);
        if (!lcRow) return null;
        const chainId = lcRow.document_chain_id;
        const stages = chainId ? (lifecycleCache[chainId] ?? null) : [];
        const failed = chainId ? !!lifecycleLoadFailed[chainId] : false;
        return createPortal(
          <div className="fixed z-[210]" style={{ top: lifecycleAnchor.top, left: lifecycleAnchor.left }}>
            <DocumentLifecyclePopup
              transactionKey={lcRow.po_number !== '—' ? lcRow.po_number : null}
              supplier={lcRow.supplier}
              stages={stages}
              loadFailed={failed}
              matchType={lcRow.matched_against.match_type}
              matchStatus={lcRow.matched_against.match_status}
              failedCheckCount={lcRow.matched_against.failed_check_count}
              hoveredStage={ownLifecycleStage(lcRow.document_type)}
              invoiceAmount={lcRow.amount}
              invoiceCurrency={lcRow.currency}
              invoiceDocRef={lcRow.doc_ref !== '—' ? lcRow.doc_ref : null}
              invoiceCreatedAt={lcRow.created_at}
              onMouseEnter={cancelLifecycleHide}
              onMouseLeave={scheduleLifecycleHide}
            />
          </div>,
          document.body,
        );
      })()}
    </div>
  );
}
