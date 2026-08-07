import { useEffect, useMemo, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { AlertTriangle, ArrowLeft, CheckCircle2, ExternalLink, FileText } from 'lucide-react';
import { SeverityBadge } from '@/components/SeverityBadge';
import { StatusPill } from '@/components/StatusPill';
import { GREEN, RED } from '@/lib/theme';
import type { WorklistRow } from '@/data';
import { supabase } from '@/lib/supabase';
import { AP_DOCUMENT_SELECT, fetchDocumentUiRows, titleCaseDocType, toWorklistRow, type ApDocRow } from '@/lib/documentRow';
import { fetchLifecycle, stageByName, type LifecycleStageRow } from '@/lib/lifecycle';
import { fetchMatchingDemoRow, type MatchingDemoRow } from '@/lib/matchingDemo';
import { SidebarToggle } from '@/components/SidebarToggle';

// The three document kinds a reviewer can line up in either pane.
type DocKind = 'invoice' | 'po' | 'grn';

const DOC_LABELS: Record<DocKind, string> = {
  invoice: 'Invoice',
  po: 'Purchase Order',
  grn: 'Goods Receipt',
};

const REVIEWER_NOTE_MAX = 500;

function fmtMoney(amount: number | null, currency: string | null): string {
  if (amount == null) return '—';
  const symbol = currency ? `${currency} ` : '$';
  return symbol + amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// A short label + summary describing the KIND of mismatch, derived from the real
// match result (current_match_results, via document_ui_view). Used as a fallback
// when the AI extraction recorded no exception text of its own.
function deriveExceptionSummary(row: WorklistRow): { label: string; text: string } {
  const m = row.matched_against;

  if (!m.match_type) {
    return { label: 'Not Yet Validated', text: 'No matching run has been performed for this document yet.' };
  }
  if (m.match_type === 'UNMATCHED' || m.match_status === 'UNMATCHED') {
    return {
      label: 'Unmatched',
      text: 'No matching purchase order found — the invoice could not be reconciled against a PO or GRN.',
    };
  }
  if (m.match_status === 'VARIANCE') {
    const n = m.failed_check_count ?? 0;
    return {
      label: 'Match Variance',
      text: `${n} validation check${n === 1 ? '' : 's'} failed against the ${m.match_type === '3_WAY' ? 'PO and GRN' : 'PO'}.`,
    };
  }

  return {
    label: 'No Mismatch',
    text: 'The current matching run found no variance — amounts and quantities reconcile.',
  };
}

// The next step a reviewer should actually take, derived from the same match
// result. Used when the backend recommended_action is empty or a generic label.
function deriveRecommendedAction(row: WorklistRow): string {
  const m = row.matched_against;

  if (!m.match_type) {
    return 'Awaiting a matching run before this can be routed for approval.';
  }
  if (m.match_type === 'UNMATCHED' || m.match_status === 'UNMATCHED') {
    return 'Locate and link the correct purchase order, then re-run matching.';
  }
  if (m.match_status === 'VARIANCE') {
    return 'Investigate the variance with the supplier and hold posting until it is resolved.';
  }

  return 'Approve and route the invoice for posting to the ERP.';
}

interface PaneStorage {
  bucket: string | null;
  path: string | null;
  exists: boolean | null;
}

// What a pane needs to render: whether this document kind has anything linked
// at all, its display reference, and its Storage location (if any). The invoice
// pane reads its own row; PO/GRN panes normally read the fetched lifecycle chain
// (a document_ui_view row has no PO/GRN fields of its own — see the migration
// plan), UNLESS this document is one of the 7 controlled matching-demo
// scenarios, in which case PO/GRN come from invoice_match_review_view instead
// (VAMSI_7_SCENARIO_UI_DEMO_GUIDE.md §9) — that view is the confirmed source
// for exactly these 7 documents; the other 115 keep the lifecycle-chain path.
function paneSourceFor(
  row: WorklistRow,
  kind: DocKind,
  stages: LifecycleStageRow[] | null,
  demo: MatchingDemoRow | null,
): { linked: boolean; reference: string; storage: PaneStorage | null } {
  if (kind === 'invoice') {
    return {
      linked: !!row.attachment_id,
      reference: row.doc_ref,
      storage: { bucket: row.storage_bucket, path: row.storage_path, exists: row.storage_object_exists },
    };
  }
  if (demo) {
    const filename = kind === 'po' ? demo.po_filename : demo.grn_filename;
    const bucket = kind === 'po' ? demo.po_storage_bucket : demo.grn_storage_bucket;
    const path = kind === 'po' ? demo.po_storage_path : demo.grn_storage_path;
    const exists = kind === 'po' ? demo.po_document_exists : demo.grn_document_exists;
    return {
      linked: !!filename,
      reference: filename ?? '—',
      storage: { bucket, path, exists },
    };
  }
  const stage = stages ? stageByName(stages, kind === 'po' ? 'purchase_order' : 'grn') : undefined;
  return {
    linked: !!stage?.document_id,
    reference: stage?.filename ?? '—',
    storage: stage ? { bucket: stage.storage_bucket, path: stage.storage_path, exists: stage.storage_object_exists } : null,
  };
}

// One document preview pane: a selector to choose which doc to show, and a real
// Storage-backed preview when the file is fetchable. Signed URLs are short-lived
// (10 min) and requested only when storage_object_exists is true — never a blind
// iframe attempt against a path that might not exist (see
// FRONTEND_HANDOFF_FOR_VAMSI.md §5).
function DocumentPane({
  row,
  kind,
  stages,
  stagesLoading,
  demo,
  onKindChange,
}: {
  row: WorklistRow;
  kind: DocKind;
  stages: LifecycleStageRow[] | null;
  stagesLoading: boolean;
  demo: MatchingDemoRow | null;
  onKindChange: (kind: DocKind) => void;
}) {
  const source = paneSourceFor(row, kind, stages, demo);
  const [signedUrl, setSignedUrl] = useState<string | null>(null);
  const [urlFailed, setUrlFailed] = useState(false);
  const bucket = source.storage?.bucket ?? null;
  const path = source.storage?.path ?? null;
  const exists = source.storage?.exists ?? null;

  useEffect(() => {
    setSignedUrl(null);
    setUrlFailed(false);
    if (!(exists === true && bucket && path)) return;
    let cancelled = false;
    supabase.storage
      .from(bucket)
      .createSignedUrl(path, 600)
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error || !data?.signedUrl) {
          setUrlFailed(true);
          return;
        }
        setSignedUrl(data.signedUrl);
      });
    return () => {
      cancelled = true;
    };
  }, [bucket, path, exists]);

  // PO/GRN panes wait on the lifecycle fetch before they know whether anything
  // is linked at all — show a brief loading state rather than a premature
  // "not linked" while that's still in flight. Not needed when `demo` already
  // answered the question (its PO/GRN fields arrive with the row itself).
  const waitingOnLifecycle = kind !== 'invoice' && !demo && stagesLoading;

  return (
    <div className="flex min-w-0 flex-1 flex-col overflow-hidden rounded-xl border border-border bg-surface">
      {/* Pane header: pick the document kind + show its reference. */}
      <div className="flex items-center justify-between gap-2 border-b border-borderf bg-surface2 px-3.5 py-2.5">
        <select
          value={kind}
          onChange={(e) => onKindChange(e.target.value as DocKind)}
          aria-label="Document to preview"
          className="h-8 rounded-md border border-line bg-surface px-2 text-[12.5px] font-semibold text-navy outline-none focus:border-navy"
        >
          {(Object.keys(DOC_LABELS) as DocKind[]).map((k) => (
            <option key={k} value={k}>{DOC_LABELS[k]}</option>
          ))}
        </select>
        <span className="truncate text-[12.5px] font-semibold tabular-nums text-text2">{source.reference}</span>
      </div>
      {/* Pane body. */}
      {waitingOnLifecycle ? (
        <div className="flex min-h-0 flex-1 items-center justify-center bg-[#eceef1] text-[13px] text-muted-foreground">
          Loading…
        </div>
      ) : signedUrl ? (
        <div className="flex min-h-0 flex-1 flex-col bg-[#eceef1]">
          <iframe title={`${DOC_LABELS[kind]} preview`} src={signedUrl} className="min-h-0 flex-1 border-0" />
          <a
            href={signedUrl}
            target="_blank"
            rel="noreferrer"
            className="flex h-8 flex-none items-center justify-center gap-1.5 border-t border-borderf bg-surface2 text-[11.5px] font-semibold text-navy"
          >
            <ExternalLink size={12} /> Open in new tab
          </a>
        </div>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-2 bg-[#eceef1] p-6 text-center">
          <FileText size={26} className="text-muted-foreground" />
          {!source.linked ? (
            <>
              <div className="text-[13px] font-semibold text-text2">No {DOC_LABELS[kind]} linked</div>
              <div className="max-w-[220px] text-[12px] text-muted-foreground">
                This document has no matched {DOC_LABELS[kind].toLowerCase()} to preview.
              </div>
            </>
          ) : exists === false ? (
            <>
              <div className="text-[13px] font-semibold text-text2">File not found</div>
              <div className="max-w-[240px] text-[12px] text-muted-foreground">
                This {DOC_LABELS[kind].toLowerCase()} is on file, but its source file isn't available in Storage.
              </div>
            </>
          ) : urlFailed ? (
            <>
              <div className="text-[13px] font-semibold text-text2">Preview unavailable</div>
              <div className="max-w-[240px] text-[12px] text-muted-foreground">Couldn't generate a preview link — try again shortly.</div>
            </>
          ) : (
            <div className="text-[13px] font-semibold text-text2">Loading preview…</div>
          )}
        </div>
      )}
    </div>
  );
}

export default function DocumentReviewPage() {
  const { documentId } = useParams();
  const location = useLocation();
  const navigate = useNavigate();

  // Primary source: the row passed from the Worklist via router state. On a hard
  // refresh / deep link that state is gone, so we re-fetch and find it by id.
  const stateRow = (location.state as { row?: WorklistRow } | null)?.row ?? null;
  const [row, setRow] = useState<WorklistRow | null>(stateRow);
  const [loading, setLoading] = useState(!stateRow);
  const [error, setError] = useState<string | null>(null);

  // Which document each pane currently shows (left defaults to Invoice, right to PO).
  const [leftKind, setLeftKind] = useState<DocKind>('invoice');
  const [rightKind, setRightKind] = useState<DocKind>('po');

  // Reviewer's note that travels with the document to the Approvals page. Not
  // persisted anywhere — purely local UI state, cleared on navigation away.
  const [comment, setComment] = useState('');
  const [reloadToken, setReloadToken] = useState(0);

  // Read-only phase: there's no backend endpoint to actually create the pending
  // approval (the old FastAPI-backed submitDocumentForApproval always fails, since
  // that backend isn't running), so this just hands the reviewer off to the
  // Approvals page directly — same visual-only approach as the Approve/Return
  // buttons on that page.
  const handleSendToApprovals = () => {
    if (!row) return;
    navigate('/approvals', { state: { fromReview: row.display_id, comment: comment.trim() || null } });
  };

  useEffect(() => {
    // Already have the row from navigation — nothing to fetch.
    if (stateRow || !documentId) return;

    let cancelled = false;
    setLoading(true);
    setError(null);

    // No single-document endpoint exists in Supabase either, so fetch by id
    // directly (same select + mapping WorklistPage itself uses — see
    // src/lib/documentRow.ts) rather than pulling the whole queue to find one row.
    supabase
      .from('ap_documents')
      .select(AP_DOCUMENT_SELECT)
      .eq('id', documentId)
      .maybeSingle()
      .then(({ data, error: qErr }) => {
        if (cancelled) return;
        if (qErr) {
          setError('load-failed');
          setLoading(false);
          return;
        }
        if (!data) {
          setError('not-found');
          setLoading(false);
          return;
        }
        const doc = data as unknown as ApDocRow;
        fetchDocumentUiRows([doc.id])
          .then((uiMap) => {
            if (cancelled) return;
            setRow(toWorklistRow(doc, uiMap.get(doc.id)));
            setLoading(false);
          })
          .catch(() => {
            if (cancelled) return;
            setError('load-failed');
            setLoading(false);
          });
      });

    return () => {
      cancelled = true;
    };
  }, [documentId, stateRow, reloadToken]);

  // The real PO/Ack/GRN chain for this document, fetched once the row (and its
  // document_chain_id) is known. Backs the PO/GRN preview panes below.
  const [stages, setStages] = useState<LifecycleStageRow[] | null>(null);
  const [stagesLoading, setStagesLoading] = useState(false);

  useEffect(() => {
    const chainId = row?.document_chain_id;
    if (!chainId) {
      setStages([]);
      setStagesLoading(false);
      return;
    }
    let cancelled = false;
    setStagesLoading(true);
    setStages(null);
    fetchLifecycle(chainId)
      .then((s) => {
        if (cancelled) return;
        setStages(s);
        setStagesLoading(false);
      })
      .catch(() => {
        if (cancelled) return;
        setStages([]);
        setStagesLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [row?.document_chain_id]);

  // Whether this is one of the 7 controlled matching-demo scenarios
  // (VAMSI_7_SCENARIO_UI_DEMO_GUIDE.md) — non-null only for those 7 documents.
  // When set, the matching cards below switch to invoice_match_review_view
  // sourcing; every other document keeps the general document_ui_view cards.
  const [demo, setDemo] = useState<MatchingDemoRow | null>(null);

  useEffect(() => {
    const id = row?.id;
    if (!id) {
      setDemo(null);
      return;
    }
    let cancelled = false;
    fetchMatchingDemoRow(id).then((d) => {
      if (!cancelled) setDemo(d);
    });
    return () => {
      cancelled = true;
    };
  }, [row?.id]);

  // A real match variance, per the current matching run — distinct from
  // "no match run yet" (match_type null).
  const hasVariance = useMemo(() => row?.matched_against.match_status === 'VARIANCE', [row]);
  const demoHasVariance = demo?.match_status === 'VARIANCE';

  if (loading) {
    return (
      <div className="pcb-view">
        <div className="rounded-xl border border-border bg-surface p-10 text-center text-[13.5px] text-muted-foreground">
          Loading document…
        </div>
      </div>
    );
  }

  // Deep-link / refresh fallback when the row can't be recovered.
  if (error || !row) {
    return (
      <div className="pcb-view">
        <div className="rounded-xl border border-border bg-surface p-10 text-center">
          <div className="mb-2 text-[14px] font-semibold text-text2">
            {error === 'load-failed' ? 'Could not load this document.' : 'Document not found.'}
          </div>
          <p className="mb-4 text-[13px] text-muted-foreground">
            {error === 'load-failed' ? 'The request failed — try again, or open it' : 'Open it'} from the Worklist to review and compare.
          </p>
          <div className="flex items-center justify-center gap-2">
            {error === 'load-failed' && (
              <button
                type="button"
                onClick={() => setReloadToken((t) => t + 1)}
                className="pcb-btn inline-flex h-[34px] items-center rounded-lg border border-line bg-surface px-3.5 text-[12.5px] font-semibold text-navy"
              >
                Retry
              </button>
            )}
            <Link to="/worklist" className="pcb-btn inline-flex h-[34px] items-center gap-1.5 rounded-lg border border-line bg-surface px-3.5 text-[12.5px] font-semibold text-navy">
              <ArrowLeft size={14} /> Back to Worklist
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const priority = row.priority;
  const review = row.exception_review;
  // Mismatch summary derived from the real match status, used when the AI
  // extraction didn't record its own exception text for this document.
  const derivedException = deriveExceptionSummary(row);

  return (
    <div className="pcb-view">
      {/* Header bar: back to Worklist + document identity/amount. */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <SidebarToggle />
          <Link to="/worklist" className="pcb-btn inline-flex h-9 w-9 items-center justify-center rounded-lg border border-line bg-surface text-text2">
            <ArrowLeft size={16} />
          </Link>
          <div>
            {/* h2, not h1 — TopNav renders the page-level heading ('Document Review'). */}
            <h2 className="text-[20px] font-semibold tracking-tight">{row.display_id}</h2>
            <p className="text-[12.5px] text-muted-foreground">
              {row.supplier} · {titleCaseDocType(row.document_type)} · {fmtMoney(row.amount, row.currency)}
            </p>
          </div>
        </div>
        <SeverityBadge severity={priority} />
      </div>

      {/* Main layout: two document panes (left) + info panel (right). */}
      <div className="flex flex-col gap-4 lg:flex-row">
        {/* Left: the two side-by-side previews. Reviewers pick any 2 of the 3 docs. */}
        <div className="flex h-[calc(100vh-230px)] min-h-[520px] flex-1 gap-4">
          <DocumentPane row={row} kind={leftKind} stages={stages} stagesLoading={stagesLoading} demo={demo} onKindChange={setLeftKind} />
          <DocumentPane row={row} kind={rightKind} stages={stages} stagesLoading={stagesLoading} demo={demo} onKindChange={setRightKind} />
        </div>

        {/* Right: exception, AI priority, recommended action, and the Review hand-off. */}
        <div className="flex w-full flex-col gap-3.5 lg:w-[340px] lg:shrink-0">
          {/* Match summary — how invoice lines up against PO/GRN. */}
          <div className="rounded-xl border border-border bg-surface p-4">
            <div className="mb-2.5 text-[11px] font-medium text-muted-foreground">Match Status</div>
            <div className="mb-3 flex items-center gap-2">
              {demo ? (
                // Demo scenario (VAMSI_7_SCENARIO_UI_DEMO_GUIDE §8 color mapping):
                // always a real status — never "Not evaluated" for these 7 (§11).
                demo.match_status === 'UNMATCHED' ? (
                  <span className="flex items-center gap-1.5 text-[13.5px] font-semibold" style={{ color: RED }}>
                    <AlertTriangle size={15} /> Unmatched
                  </span>
                ) : (
                  <span className="flex items-center gap-1.5 text-[13.5px] font-semibold" style={{ color: demoHasVariance ? '#B45309' : GREEN }}>
                    {demoHasVariance ? <AlertTriangle size={15} /> : <CheckCircle2 size={15} />}
                    {demo.match_type === '3_WAY' ? '3-Way' : '2-Way'} {demoHasVariance ? 'Variance' : 'Matched'}
                  </span>
                )
              ) : !row.matched_against.match_type ? (
                // Per FRONTEND_HANDOFF_FOR_VAMSI §6.2: a null match result means
                // "not evaluated", not an error — must not read as UNMATCHED/etc.
                <span className="text-[13px] text-faint">Not evaluated</span>
              ) : row.matched_against.match_type === 'UNMATCHED' || row.matched_against.match_status === 'UNMATCHED' ? (
                <span className="text-[13px] text-faint">Unmatched</span>
              ) : (
                <span className="flex items-center gap-1.5 text-[13.5px] font-semibold" style={{ color: hasVariance ? '#B45309' : GREEN }}>
                  {hasVariance ? <AlertTriangle size={15} /> : <CheckCircle2 size={15} />}
                  {row.matched_against.match_type === '3_WAY' ? '3-Way' : '2-Way'} {hasVariance ? 'Variance' : 'Matched'}
                </span>
              )}
            </div>
            {row.matched_against.match_type && row.matched_against.match_type !== 'UNMATCHED' && (
              <div className="flex flex-wrap gap-1.5">
                <StatusPill
                  label={`${row.matched_against.failed_check_count ?? 0} failed check${(row.matched_against.failed_check_count ?? 0) === 1 ? '' : 's'}`}
                  color={(row.matched_against.failed_check_count ?? 0) > 0 ? RED : GREEN}
                  border={(row.matched_against.failed_check_count ?? 0) > 0 ? '#f3c0c0' : '#bfe3c9'}
                  background={(row.matched_against.failed_check_count ?? 0) > 0 ? 'var(--redsoft)' : 'var(--greensoft)'}
                  dotColor={(row.matched_against.failed_check_count ?? 0) > 0 ? RED : GREEN}
                />
                {(row.matched_against.unavailable_check_count ?? 0) > 0 && (
                  <StatusPill
                    label={`${row.matched_against.unavailable_check_count} check${row.matched_against.unavailable_check_count === 1 ? '' : 's'} unavailable`}
                    color="var(--text3)"
                    border="var(--border)"
                    background="var(--surface2)"
                    dot={false}
                  />
                )}
              </div>
            )}
            {/* OCI's explanation of the persisted match result — document_ui_view.ai_match_reason,
                FRONTEND_HANDOFF_FOR_VAMSI §4.1. Only rendered when the backend actually has one.
                Suppressed for demo scenarios: their match reasoning has its own dedicated
                "AI Match Explanation" card below (VAMSI_7_SCENARIO_UI_DEMO_GUIDE §5). */}
            {!demo && row.matched_against.ai_match_reason && (
              <p className="mt-2.5 text-[12.5px] leading-relaxed text-muted-foreground">
                {row.matched_against.ai_match_reason}
              </p>
            )}
          </div>

          {/* Exception detail — count + the AI's exception assessment. */}
          <div className="rounded-xl border border-border bg-surface p-4">
            <div className="mb-2.5 flex items-center justify-between">
              <span className="text-[11px] font-medium text-muted-foreground">Exception Summary</span>
              <span className="text-[12.5px] font-bold tabular-nums" style={{ color: row.exceptions > 0 ? RED : 'var(--text3)' }}>
                {row.exceptions} open
              </span>
            </div>
            {demo ? (
              // Demo scenario: exception_summary is the exact backend text; a
              // matched row with none shows the guide's fixed copy (§5/§6).
              <div className="text-[12.5px] leading-relaxed text-muted-foreground">
                {demo.exception_summary || 'No matching exceptions.'}
              </div>
            ) : row.matched_against.match_exception_summary ? (
              // 1st choice: document_ui_view.match_exception_summary — the real,
              // deterministic, backend-owned discrepancy summary (FRONTEND_HANDOFF_FOR_VAMSI
              // §4.1), confirmed live against Supabase. Takes priority over the AI
              // extraction's own exception_review JSON below.
              <div className="text-[12.5px] leading-relaxed text-muted-foreground">
                {row.matched_against.match_exception_summary}
              </div>
            ) : review?.review_reason || review?.exception_summary ? (
              // 2nd choice: the AI extraction's own exception assessment — kept as a
              // fallback since it's real data, just not a confirmed stable contract.
              <div className="space-y-1.5">
                {review?.exception_status && (
                  <div className="text-[12px] font-semibold uppercase tracking-[.04em] text-text3">{review.exception_status}</div>
                )}
                {review?.review_reason && <div className="text-[13px] font-semibold text-text2">{review.review_reason}</div>}
                {review?.exception_summary && <div className="text-[12.5px] leading-relaxed text-muted-foreground">{review.exception_summary}</div>}
              </div>
            ) : (
              // 3rd choice: describe the kind of mismatch from the real match status
              // (covers the null-match_type "Not evaluated" case too).
              <div className="space-y-1.5">
                <div className="text-[12px] font-semibold uppercase tracking-[.04em] text-text3">{derivedException.label}</div>
                <div className="text-[12.5px] leading-relaxed text-muted-foreground">{derivedException.text}</div>
              </div>
            )}
          </div>

          {/* AI Priority for ordinary documents, or — for one of the 7 controlled
              matching-demo scenarios — "AI Match Explanation" instead, per
              VAMSI_7_SCENARIO_UI_DEMO_GUIDE §5's required card correction:
              general Priority/ai_priority_reason must not be shown for these 7;
              ai_match_reason is the match-specific explanation to show instead. */}
          <div className="rounded-xl border border-border bg-surface p-4">
            {demo ? (
              <>
                <div className="mb-2.5 text-[11px] font-medium text-muted-foreground">AI Match Explanation</div>
                <div className="text-[12.5px] leading-relaxed text-text2">{demo.ai_match_reason}</div>
              </>
            ) : (
              <>
                <div className="mb-2.5 flex items-center gap-2">
                  <span className="text-[11px] font-medium text-muted-foreground">AI Priority</span>
                  <SeverityBadge severity={priority} />
                </div>
                <div className="text-[12.5px] leading-relaxed text-text2">
                  {row.priority_reason || 'No priority reasoning provided.'}
                </div>
              </>
            )}
          </div>

          {/* Recommended action — the AI's suggested next step. */}
          <div className="rounded-xl border border-border bg-surface p-4">
            <div className="mb-2 text-[11px] font-medium text-muted-foreground">Recommended Action</div>
            <div className="text-[12.5px] leading-relaxed text-text2">
              {demo ? (
                // VAMSI_7_SCENARIO_UI_DEMO_GUIDE §5: use the match-specific
                // ai_recommended_action only — not the general recommended_action.
                demo.ai_recommended_action
              ) : (
                /* Per FRONTEND_HANDOFF_FOR_VAMSI §9: never replace real backend text with
                   frontend-calculated fallback text. Prefer the match-specific guidance
                   (document_ui_view.match_recommended_action) once a match has run — it's
                   more relevant to what's on screen — else the document's general
                   recommended_action, which is populated for every document. The derived
                   fallback is a last resort only if both are genuinely empty. */
                row.matched_against.match_recommended_action
                  || row.recommended_action
                  || deriveRecommendedAction(row)
              )}
            </div>
          </div>

          {/* Reviewer note — travels with the document to the Approvals page so
              the approver can read why the previous reviewer cleared it. Local
              UI state only: never saved anywhere, cleared on navigation away. */}
          <div className="rounded-xl border border-border bg-surface p-4">
            <div className="mb-2 flex items-center justify-between">
              <label htmlFor="review-comment" className="block text-[11px] font-medium text-muted-foreground">
                Reviewer Note
              </label>
              {comment && (
                <button
                  type="button"
                  onClick={() => setComment('')}
                  className="text-[11px] font-semibold text-navy underline-offset-2 hover:underline"
                >
                  Clear
                </button>
              )}
            </div>
            <textarea
              id="review-comment"
              value={comment}
              onChange={(e) => setComment(e.target.value.slice(0, REVIEWER_NOTE_MAX))}
              placeholder="Add a note for the approver (e.g. why this exception was cleared)…"
              rows={3}
              maxLength={REVIEWER_NOTE_MAX}
              className="w-full resize-y rounded-lg border border-line bg-surface2 px-3 py-2 text-[12.5px] leading-relaxed text-text2 outline-none placeholder:text-faint focus:border-navy"
            />
            <div className="mt-1.5 flex items-center justify-end text-[11px] text-faint">
              <span className="tabular-nums">{comment.length}/{REVIEWER_NOTE_MAX}</span>
            </div>
          </div>

          {/* Hand-off to the Approvals page (visual-only in this read-only phase). */}
          <button
            type="button"
            onClick={handleSendToApprovals}
            className="pcb-btn h-[42px] rounded-xl border-none bg-navy text-[13.5px] font-semibold text-white"
          >
            Review → Send to Approvals
          </button>
        </div>
      </div>
    </div>
  );
}
