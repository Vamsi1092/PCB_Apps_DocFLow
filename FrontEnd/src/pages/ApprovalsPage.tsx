import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { AlertTriangle, Check, CheckCircle2, ChevronLeft, ChevronRight, RotateCcw, X } from 'lucide-react';
import { RED, GREEN } from '@/lib/theme';
import { supabase } from '@/lib/supabase';
import { useToast } from '@/hooks/useToast';
import { Toast } from '@/components/Toast';
import { fetchDocumentUiRows, UNRESOLVED_SUPPLIER, type DocumentUiRow } from '@/lib/documentRow';

type Verdict = 'approved' | 'rejected';
const PAGE_SIZE = 12;

// Real match result from current_match_results (via document_ui_view) — null
// when no matching run has happened yet for this document (most today).
interface ApprovalMatch {
  match_type: '2_WAY' | '3_WAY' | 'UNMATCHED' | null;
  match_status: 'MATCHED' | 'VARIANCE' | 'UNMATCHED' | null;
}

interface ApprovalRow {
  id: string;
  document_id: string | null;
  vendor: string;
  invoice_number: string | null;
  po_number: string | null;
  document_type: string | null;
  matched_against: ApprovalMatch;
  decision: string;
  amount: number | null;
  currency: string | null;
  approver_name: string | null;
  review_comment: string | null;
  created_at: string | null;
  decided_at: string | null;
}

// One approval_requests row with the document/email and its decision action embedded.
interface ApprovalRequestRow {
  id: string;
  document_id: string | null;
  approval_reason: string | null;
  status: string | null;
  created_at: string | null;
  ap_documents: { document_type: string | null; email_messages: { ai_understanding: Record<string, any> | null } | null } | null;
  approval_actions: { decision: string | null; decided_by: string | null; decided_at: string | null; comment: string | null }[] | null;
}

function toApprovalRow(r: ApprovalRequestRow, ui: DocumentUiRow | undefined): ApprovalRow {
  const header = (r.ap_documents?.email_messages?.ai_understanding?.header ?? {}) as Record<string, any>;
  const action = r.approval_actions?.[0];
  const amt = Number(header.total_amount);
  // Canonical supplier per FRONTEND_HANDOFF_FOR_VAMSI.md §8 — never the
  // AI-extracted free-text name.
  const vendor = ui?.supplier_id ? (ui.supplier_name ?? UNRESOLVED_SUPPLIER) : UNRESOLVED_SUPPLIER;
  return {
    id: r.id,
    document_id: r.document_id,
    vendor,
    invoice_number: header.invoice_number ?? null,
    po_number: ui?.transaction_key ?? header.po_number ?? null,
    document_type: ui?.document_type ?? r.ap_documents?.document_type ?? null,
    matched_against: {
      match_type: (ui?.match_type as ApprovalMatch['match_type']) ?? null,
      match_status: (ui?.match_status as ApprovalMatch['match_status']) ?? null,
    },
    decision: r.status ?? 'pending',
    amount: Number.isFinite(amt) ? amt : null,
    currency: header.currency ?? null,
    approver_name: action?.decided_by ?? null,
    review_comment: r.approval_reason ?? action?.comment ?? null,
    created_at: r.created_at,
    decided_at: action?.decided_at ?? null,
  };
}

/** "2h ago" / "3d ago" — relative time since the approval was queued. */
function fmtRelative(iso: string | null): string {
  if (!iso) return '—';
  const created = new Date(iso).getTime();
  if (isNaN(created)) return '—';
  const minutes = Math.max(0, Math.round((Date.now() - created) / 60000));
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  if (days > 0) return `${days}d ago`;
  if (hours > 0) return `${hours}h ago`;
  return `${minutes}m ago`;
}

function fmtMoney(amount: number | null, currency: string | null): string {
  if (amount == null) return '—';
  return `${currency === 'USD' || !currency ? '$' : currency + ' '}${amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/** Real PO<->Invoice<->GRN match result from current_match_results. */
function MatchBadge({ m }: { m: ApprovalMatch }) {
  if (!m.match_type) {
    return (
      <span className="rounded-full border border-line bg-surface px-2.5 py-[3px] text-[11.5px] font-semibold text-faint">
        No match run yet
      </span>
    );
  }
  if (m.match_type === 'UNMATCHED' || m.match_status === 'UNMATCHED') {
    return (
      <span className="rounded-full border border-line bg-surface px-2.5 py-[3px] text-[11.5px] font-semibold text-faint">
        Unmatched
      </span>
    );
  }
  const hasVariance = m.match_status === 'VARIANCE';
  const is3Way = m.match_type === '3_WAY';
  const Icon = hasVariance ? AlertTriangle : CheckCircle2;
  const color = hasVariance ? '#B45309' : GREEN;
  const bg = hasVariance ? '#FEF3C7' : 'var(--greensoft)';
  const border = hasVariance ? '#FDE68A' : '#bbf0c9';
  const label = `${is3Way ? '3-way' : '2-way'} ${hasVariance ? 'variance' : 'matched'}`;
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full border px-2.5 py-[3px] text-[11.5px] font-semibold"
      style={{ color, background: bg, borderColor: border }}
    >
      <Icon size={11} />{label}
    </span>
  );
}

export default function ApprovalsPage() {
  const location = useLocation();

  // Pending approvals only (faithful to the page's "awaiting sign-off" purpose).
  // Pagination is client-side.
  const [data, setData] = useState<ApprovalRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [reloadToken, setReloadToken] = useState(0);
  // Local-only decision state: this phase is read-only (no Supabase writes), so
  // clicking Approve/Return just gives visual feedback on the card — it does not
  // persist anywhere. Kept even after a card would otherwise leave the list so the
  // confirmation banner has a moment to show.
  const [decisions, setDecisions] = useState<Record<string, Verdict>>({});
  const { toast, showToast } = useToast();

  const decide = (id: string, verdict: Verdict) => {
    setDecisions((prev) => ({ ...prev, [id]: verdict }));
    showToast(verdict === 'approved' ? 'Invoice approved — queued for posting (not persisted)' : 'Invoice returned to the worklist (not persisted)');
  };

  // If a reviewer just arrived from Document Review's "Send to Approvals", give
  // them a confirming toast here too — that page navigates immediately, so its
  // own toast wouldn't have time to be seen.
  useEffect(() => {
    const state = location.state as { fromReview?: string } | null;
    if (state?.fromReview) {
      showToast(`${state.fromReview} sent for approval (not persisted)`);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const resetDecisions = () => setDecisions({});

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    supabase
      .from('approval_requests')
      .select(
        'id, document_id, approval_reason, status, created_at, ap_documents ( document_type, email_messages ( ai_understanding ) ), approval_actions ( decision, decided_by, decided_at, comment )',
      )
      .eq('status', 'pending')
      .order('created_at', { ascending: false })
      .then(({ data: rows, error: qErr }) => {
        if (cancelled) return;
        if (qErr) {
          setError(qErr.message);
          setLoading(false);
          return;
        }
        const requests = (rows ?? []) as unknown as ApprovalRequestRow[];
        // document_ui_view is a separate query (a view, not embeddable via the
        // ap_documents FK) — fetched for every referenced document and merged in JS.
        fetchDocumentUiRows(requests.map((r) => r.document_id).filter((x): x is string => !!x))
          .then((uiMap) => {
            if (cancelled) return;
            setData(requests.map((r) => toApprovalRow(r, r.document_id ? uiMap.get(r.document_id) : undefined)));
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

  const totalCount = data.length;
  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const visible = data.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  const hasDecisions = Object.keys(decisions).length > 0;

  return (
    <div className="pcb-view">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="mb-[3px] text-[23px] font-bold uppercase tracking-[.01em]">Approvals</h1>
          <p className="text-[13.5px] text-muted-foreground">Awaiting your sign-off · {totalCount} pending</p>
        </div>
        {hasDecisions && (
          <button
            type="button"
            onClick={resetDecisions}
            className="pcb-btn flex h-[32px] items-center gap-1.5 rounded-lg border border-line bg-surface px-3 text-[12px] font-semibold text-text2"
          >
            <RotateCcw size={13} />
            Reset local decisions
          </button>
        )}
      </div>
      {loading ? (
        <div className="rounded-xl border border-border bg-surface p-10 text-center text-[13.5px] text-muted-foreground">
          Loading approvals…
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
      ) : totalCount === 0 ? (
        <div className="rounded-xl border border-border bg-surface p-10 text-center text-[13.5px] text-muted-foreground">
          No pending approvals
        </div>
      ) : (
        <>
          <div className="grid grid-cols-[repeat(auto-fill,minmax(340px,1fr))] gap-3.5">
            {visible.map((a) => {
              const verdict = decisions[a.id];
              const approvedVerdict = verdict === 'approved';
              return (
              <div
                key={a.id}
                className="rounded-xl bg-surface shadow-[0_1px_2px_rgba(16,24,40,.04)] transition-[border-color]"
                style={{ border: `1px solid ${verdict ? (approvedVerdict ? '#bbf0c9' : '#f3c0c0') : 'var(--border)'}`, padding: '17px 18px' }}
              >
                <div className="mb-3 flex items-start justify-between">
                  <div>
                    <div className="flex items-center gap-1.5">
                      <span className="text-[15px] font-bold">{a.vendor}</span>
                    </div>
                    <div className="mt-0.5 text-xs tabular-nums text-faint">{a.invoice_number ?? '—'} · {fmtRelative(a.created_at)}</div>
                  </div>
                  <div className="text-[19px] font-extrabold tracking-[-.02em] tabular-nums">{fmtMoney(a.amount, a.currency)}</div>
                </div>
                <div className="mb-3.5 flex flex-wrap gap-2">
                  <MatchBadge m={a.matched_against} />
                  <span className="rounded-full border border-line bg-surface px-2.5 py-[3px] text-[11.5px] font-semibold text-text3">
                    {a.po_number ?? '—'}
                  </span>
                </div>
                {/* Reviewer's note captured when the document was sent to approvals. */}
                {a.review_comment && (
                  <div className="mb-3.5 rounded-lg border border-borderf bg-surface2 px-3 py-2">
                    <div className="mb-0.5 text-[10.5px] font-bold uppercase tracking-[.06em] text-muted-foreground">Reviewer note</div>
                    <div className="text-[12.5px] leading-relaxed text-text2">{a.review_comment}</div>
                  </div>
                )}
                {/* Approve/Return are visual-only in this read-only phase — clicking
                    gives local feedback but does not write to Supabase. */}
                {verdict ? (
                  <div role="status">
                    <div
                      className="flex h-[38px] items-center justify-center gap-[7px] rounded-lg border text-[13px] font-bold"
                      style={{
                        color: approvedVerdict ? GREEN : RED,
                        background: approvedVerdict ? 'var(--greensoft)' : 'var(--redsoft)',
                        borderColor: approvedVerdict ? '#bbf0c9' : '#f3c0c0',
                      }}
                    >
                      {approvedVerdict ? '✓ Approved & posting' : '↩ Returned to Worklist'}
                    </div>
                    <div className="mt-1.5 text-center text-[11px] text-faint">Not persisted — local to this session only</div>
                  </div>
                ) : (
                  <div className="flex gap-[9px]">
                    <button
                      type="button"
                      onClick={() => decide(a.id, 'rejected')}
                      className="pcb-btn flex h-[38px] flex-1 items-center justify-center gap-1.5 rounded-lg border text-[13px] font-semibold"
                      style={{ borderColor: '#f3d0d0', background: 'var(--surface)', color: RED }}
                    >
                      <X size={15} />Return to Worklist
                    </button>
                    <button
                      type="button"
                      onClick={() => decide(a.id, 'approved')}
                      className="pcb-btn flex h-[38px] flex-[1.4] items-center justify-center gap-1.5 rounded-lg border-none bg-navy text-[13px] font-semibold text-white shadow-[0_1px_2px_rgba(30,58,138,.3)]"
                    >
                      <Check size={15} color="#fff" />Approve
                    </button>
                  </div>
                )}
              </div>
              );
            })}
          </div>
          <div className="mt-4 flex items-center justify-between text-[12.5px] text-muted-foreground">
            <span>{`Page ${safePage} of ${totalPages}`}</span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={safePage <= 1}
                className="pcb-btn flex h-8 w-8 items-center justify-center rounded-lg border border-line bg-surface disabled:opacity-40"
              >
                <ChevronLeft size={14} />
              </button>
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
      <Toast message={toast} />
    </div>
  );
}
