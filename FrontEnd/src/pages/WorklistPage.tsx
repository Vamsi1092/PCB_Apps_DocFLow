import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { DataTable, type DataTableColumn } from '@/components/DataTable';
import { StatusPill } from '@/components/StatusPill';
import { SeverityBadge } from '@/components/SeverityBadge';
import { RED } from '@/lib/theme';
import type { WorklistRow, WorklistStatusKind } from '@/data';
import { getDocumentQueue, assignDocument, type DocumentQueueRecord } from '../../api/documentapi';

type SortableKey = keyof WorklistRow;

const PRIORITY_RANK: Record<WorklistRow['priority'], number> = { critical: 3, high: 2, medium: 1, low: 0 };
const NUMERIC_KEYS = new Set<SortableKey>(['amount', 'confidence', 'exceptions']);

// Same team roster used in Settings → Team & Roles, so assignment options stay consistent app-wide.
const ASSIGNEES = ['Maya Reyes', 'J. Okafor', 'A. Bianchi', 'D. Whitfield', 'R. Solis', 'K. Mercer', 'T. Adeyemi', 'S. Novak'];

const STATUS_META: Record<WorklistStatusKind, { color: string; border: string; background: string; dotColor: string }> = {
  exception: { color: RED, border: '#f3c0c0', background: 'var(--redsoft)', dotColor: RED },
  action: { color: 'var(--text2)', border: 'var(--line)', background: 'var(--surface)', dotColor: 'var(--muted)' },
};

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const TOOLTIP_WIDTH = 400;
const TOOLTIP_MARGIN = 12;
const TOOLTIP_HIDE_DELAY = 150;

type HoverState =
  | { key: string; placement: 'right'; top: number; left: number }
  | { key: string; placement: 'above'; bottom: number; left: number };

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

function normalizePriority(priority: string | null): WorklistRow['priority'] {
  const key = (priority ?? '').toLowerCase();
  return key === 'critical' || key === 'high' || key === 'medium' || key === 'low' ? key : 'medium';
}

/** Status comes from the AI's own exception_review/recommended_action (already
 * fetched per document for extraction), not ap_documents.stage — stage is written
 * once as "review" at capture and no workflow ever advances it. */
function deriveStatus(doc: DocumentQueueRecord): { kind: WorklistStatusKind; label: string } {
  const er = doc.exception_review;
  const isException = !!er && (
    er.review_required === true
    || (er.exception_status != null && er.exception_status !== 'No Exception')
  );
  if (isException) {
    return {
      kind: 'exception',
      label: er?.review_reason || er?.exception_summary || er?.exception_status || 'Exception',
    };
  }
  return { kind: 'action', label: doc.recommended_action || 'No action required' };
}

function toWorklistRow(doc: DocumentQueueRecord): WorklistRow {
  const status = deriveStatus(doc);
  return {
    id: doc.document_id,
    display_id: doc.display_id || doc.document_id,
    priority: normalizePriority(doc.priority),
    priority_reason: doc.priority_reason ?? '',
    supplier: doc.supplier ?? '—',
    doc_ref: doc.document_reference ?? '—',
    po_number: doc.po_number ?? '—',
    document_type: doc.document_type ?? '—',
    amount: doc.amount ?? 0,
    stage: doc.stage ?? '—',
    // ai_confidence is stored as a 0–1 fraction; the UI displays it as a percentage.
    confidence: doc.confidence != null ? Math.round(doc.confidence * 100) : 0,
    exceptions: doc.exception_count ?? 0,
    status_kind: status.kind,
    status_label: status.label,
    assigned_to: doc.assigned_to ?? '—',
    created_at: doc.created_at ?? '',
    updated_at: doc.updated_at ?? '',
  };
}

const FILTERS: [string, string][] = [
  ['all', 'All'],
  ['exception', 'Exceptions'],
];

export default function WorklistPage() {
  const [worklistData, setWorklistData] = useState<WorklistRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sortCol, setSortCol] = useState<SortableKey>('created_at');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  // Status filter buttons: null means no button is selected (default state).
  // When null, the table shows every row, same as if "All" were active but with no button highlighted.
  const [filter, setFilter] = useState<string | null>(null);
  const [hover, setHover] = useState<HoverState | null>(null);
  const hideTimer = useRef<ReturnType<typeof setTimeout>>();

  const cancelHide = () => clearTimeout(hideTimer.current);
  const scheduleHide = () => {
    clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => setHover(null), TOOLTIP_HIDE_DELAY);
  };

  useEffect(() => {
    let cancelled = false;

    setLoading(true);
    setError(null);

    getDocumentQueue()
      .then((res) => {
        if (cancelled) return;
        setWorklistData(res.documents.map(toWorklistRow));
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : 'Failed to load document queue');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  // Optimistic: update the row immediately, then persist. On failure, put the
  // previous value back so the dropdown never silently disagrees with the server.
  const handleAssign = (rowId: string, nextValue: string) => {
    const previous = worklistData.find((r) => r.id === rowId)?.assigned_to ?? '—';
    const nextAssignedTo = nextValue || '—';
    setWorklistData((prev) => prev.map((r) => (r.id === rowId ? { ...r, assigned_to: nextAssignedTo } : r)));

    assignDocument(rowId, nextValue || null).catch(() => {
      setWorklistData((prev) => prev.map((r) => (r.id === rowId ? { ...r, assigned_to: previous } : r)));
    });
  };

  const onSort = (col: string) => {
    const key = col as SortableKey;
    if (key === sortCol) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortCol(key);
      setSortDir(key === 'created_at' || key === 'updated_at' || NUMERIC_KEYS.has(key) ? 'desc' : 'asc');
    }
  };

  // Apply the status filter: no active filter (null) or the explicit "All" option both show every row;
  // otherwise match the status kind (exception vs. action-needed) exactly.
  let rows = worklistData.slice();
  if (filter && filter !== 'all') {
    rows = rows.filter((r) => r.status_kind === filter);
  }
  const dir = sortDir === 'asc' ? 1 : -1;
  rows = rows.sort((a, b) => {
    if (sortCol === 'priority') return (PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority]) * dir;
    if (NUMERIC_KEYS.has(sortCol)) return ((a[sortCol] as number) - (b[sortCol] as number)) * dir;
    const x = String(a[sortCol]).toLowerCase();
    const y = String(b[sortCol]).toLowerCase();
    return (x < y ? -1 : x > y ? 1 : 0) * dir;
  });
  const displayRows = rows.map((r) => ({ ...r, _key: r.id }));
  const hoveredRow = hover ? worklistData.find((r) => r.id === hover.key) : null;

  const columns: DataTableColumn<WorklistRow>[] = [
    { key: 'display_id', label: 'ID', sortable: true, cell: (r) => <span className="text-[13px] font-semibold tabular-nums text-navy">{r.display_id}</span> },
    {
      key: 'priority',
      label: 'Priority',
      sortable: true,
      cell: (r) => (
        // Shrink-wrapped to its own content (not the full table cell) so the hover
        // target — and the rect used to position the tooltip — matches what's
        // actually visible on screen. Mirrors the AP Inbox attachments hover.
        <span
          className="inline-block cursor-help"
          onMouseEnter={(e) => {
            cancelHide();
            const rect = e.currentTarget.getBoundingClientRect();
            const spaceRight = window.innerWidth - rect.right;
            if (spaceRight >= TOOLTIP_WIDTH + TOOLTIP_MARGIN) {
              setHover({ key: r.id, placement: 'right', top: rect.top, left: rect.right + 10 });
            } else {
              const left = Math.max(TOOLTIP_MARGIN, Math.min(rect.left, window.innerWidth - TOOLTIP_WIDTH - TOOLTIP_MARGIN));
              setHover({ key: r.id, placement: 'above', bottom: window.innerHeight - rect.top + 10, left });
            }
          }}
          onMouseLeave={scheduleHide}
        >
          <SeverityBadge severity={r.priority} />
        </span>
      ),
    },
    { key: 'supplier', label: 'Supplier', sortable: true, cell: (r) => <span className="text-[13.5px]">{r.supplier}</span> },
    { key: 'doc_ref', label: 'Doc Ref', sortable: true, cell: (r) => <span className="text-[13px] tabular-nums">{r.doc_ref}</span> },
    { key: 'po_number', label: 'PO Number', sortable: true, cell: (r) => <span className="text-[13px] tabular-nums text-muted-foreground">{r.po_number}</span> },
    { key: 'document_type', label: 'Document Type', sortable: true, cell: (r) => <span className="whitespace-nowrap text-[13px] text-text2">{r.document_type}</span> },
    { key: 'amount', label: 'Amount', align: 'right', sortable: true, cell: (r) => <span className="text-[13.5px] font-semibold tabular-nums">{fmtMoney(r.amount)}</span> },
    { key: 'stage', label: 'Stage', sortable: true, cell: (r) => <span className="text-[13px] text-text2">{r.stage ? r.stage[0].toUpperCase() + r.stage.slice(1) : r.stage}</span> },
    { key: 'confidence', label: 'Confidence', align: 'right', sortable: true, cell: (r) => <span className="text-[13px] tabular-nums text-muted-foreground">{r.confidence}%</span> },
    { key: 'exceptions', label: 'Exceptions', align: 'right', sortable: true, cell: (r) => <span className="text-[13px] tabular-nums" style={{ color: r.exceptions > 0 ? RED : 'var(--muted)' }}>{r.exceptions}</span> },
    {
      key: 'age',
      label: 'Age',
      cell: (r) => <span className="text-[13px] tabular-nums" style={{ color: ageColor(r.created_at) }}>{fmtAge(r.created_at)}</span>,
    },
    {
      key: 'status_label',
      label: 'Status',
      sortable: true,
      cell: (r) => {
        const m = STATUS_META[r.status_kind];
        return <StatusPill label={r.status_label} color={m.color} border={m.border} background={m.background} dotColor={m.dotColor} />;
      },
    },
    {
      key: 'assigned_to',
      label: 'Assigned To',
      sortable: true,
      cell: (r) => (
        <select
          value={r.assigned_to === '—' ? '' : r.assigned_to}
          onChange={(e) => handleAssign(r.id, e.target.value)}
          onClick={(e) => e.stopPropagation()}
          className="h-8 w-full max-w-[150px] rounded-md border border-line bg-surface px-2 text-[12.5px] text-text2"
        >
          <option value="">Unassigned</option>
          {ASSIGNEES.map((name) => (
            <option key={name} value={name}>{name}</option>
          ))}
        </select>
      ),
    },
    { key: 'created_at', label: 'Created', sortable: true, cell: (r) => <span className="whitespace-nowrap text-[13px] tabular-nums text-muted-foreground">{fmtDate(r.created_at)}</span> },
    { key: 'updated_at', label: 'Updated', sortable: true, cell: (r) => <span className="whitespace-nowrap text-[13px] tabular-nums text-muted-foreground">{fmtDate(r.updated_at)}</span> },
  ];

  return (
    <div className="pcb-view">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="mb-[3px] text-[23px] font-bold tracking-[-.02em]">Worklist</h1>
          <p className="text-[13.5px] text-muted-foreground">
            Assigned to you · <span className="tabular-nums">{displayRows.length}</span> invoices
          </p>
        </div>
        <div className="flex flex-wrap gap-[7px]">
          {FILTERS.map(([id, label]) => {
            const on = filter === id;
            return (
              <button
                key={id}
                type="button"
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
      {loading ? (
        <div className="rounded-xl border border-border bg-surface p-10 text-center text-[13.5px] text-muted-foreground">
          Loading document queue…
        </div>
      ) : error ? (
        <div className="rounded-xl border border-border bg-surface p-10 text-center text-[13.5px]" style={{ color: RED }}>
          {error}
        </div>
      ) : (
        <DataTable
          columns={columns}
          rows={displayRows}
          sort={{ col: sortCol, dir: sortDir }}
          onSort={onSort}
          minWidth={1760}
        />
      )}
      {hoveredRow && createPortal(
        // Portaled to document.body: this page's root .pcb-view div has a transform-based
        // fade-in animation, and a transform-animating ancestor becomes the containing block
        // for `position: fixed` descendants — which would otherwise pin this tooltip far below
        // the viewport instead of next to the hovered badge. Same fix as the AP Inbox tooltip.
        <div
          className="pcb-view fixed z-[200] min-w-[300px] max-w-[400px] rounded-xl bg-[#111a33] p-[14px_16px] text-white shadow-[0_12px_36px_rgba(0,0,0,.32)]"
          style={
            hover!.placement === 'right'
              ? { top: hover!.top, left: hover!.left }
              : { bottom: hover!.bottom, left: hover!.left }
          }
          onMouseEnter={cancelHide}
          onMouseLeave={scheduleHide}
        >
          <div className="mb-1.5 text-[10.5px] font-bold uppercase tracking-[.06em] text-[#8ca0d6]">Priority Reason</div>
          <div className="mb-1.5 text-[13.5px] font-bold leading-snug">
            {hoveredRow.priority[0].toUpperCase() + hoveredRow.priority.slice(1)} Priority
          </div>
          <p className="whitespace-normal break-words text-[12.5px] leading-[1.5] text-[#c3cce3]">{hoveredRow.priority_reason}</p>
        </div>,
        document.body,
      )}
    </div>
  );
}
