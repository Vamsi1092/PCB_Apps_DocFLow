import type { Severity } from './theme';
import type { WorklistRow } from '@/data';
import { supabase } from './supabase';

/**
 * Shared document-row mapping: turns a raw Supabase `ap_documents` row plus its
 * matching `document_ui_view` row into the UI's `WorklistRow` shape. Used by both
 * WorklistPage (the list) and DocumentReviewPage (single-row fetch) so the two
 * never drift out of sync.
 *
 * Two queries, merged by id, rather than one embedded select:
 * `document_ui_view` is a VIEW, not a table with real FK constraints, so
 * PostgREST can't reliably auto-embed `exception_cases`/`email_messages` through
 * it. Instead: query `ap_documents` (unchanged embeds, still real FKs) for
 * owner/dates/confidence/the AI-extraction header/exceptions, and query
 * `document_ui_view` separately (flat, `.in('document_id', ids)`) for the
 * canonical supplier, real match result, lifecycle chain id, and Storage
 * location. See FRONTEND_HANDOFF_FOR_VAMSI.md.
 */

// ap_documents + exceptions — everything the new contract does NOT cover:
// amount/currency/invoice_number/po_number still only live in the AI-extraction
// header (flagged as a follow-up to Afrid — see the migration plan), and
// owner/ai_confidence/created_at/updated_at have no equivalent in document_ui_view.
export const AP_DOCUMENT_SELECT =
  'id, owner, ai_confidence, created_at, updated_at, email_messages ( ai_understanding ), exception_cases ( severity, status )';

export interface ApDocRow {
  id: string;
  owner: string | null;
  ai_confidence: number | null;
  created_at: string | null;
  updated_at: string | null;
  email_messages: { ai_understanding: Record<string, any> | null } | null;
  exception_cases: { severity: string | null; status: string | null }[] | null;
}

// document_ui_view — the new canonical contract (supplier resolution, real
// match result, lifecycle chain id, Storage location, OCI priority fields).
export const DOCUMENT_UI_VIEW_SELECT =
  'document_id, document_type, document_chain_id, transaction_key, pipeline_stage, priority, ai_priority_reason, recommended_action, recommended_action_code, ai_decision_source, sla_due_at, sla_breached, supplier_id, vendor_code, supplier_name, attachment_id, filename, file_type, storage_bucket, storage_path, storage_object_exists, match_type, match_status, failed_check_count, unavailable_check_count, ai_match_reason, match_exception_summary, match_recommended_action';

export interface DocumentUiRow {
  document_id: string;
  document_type: string | null;
  document_chain_id: string | null;
  transaction_key: string | null;
  pipeline_stage: string | null;
  priority: string | null;
  ai_priority_reason: string | null;
  recommended_action: string | null;
  recommended_action_code: string | null;
  ai_decision_source: string | null;
  sla_due_at: string | null;
  sla_breached: boolean | null;
  supplier_id: string | null;
  vendor_code: string | null;
  supplier_name: string | null;
  attachment_id: string | null;
  filename: string | null;
  file_type: string | null;
  storage_bucket: string | null;
  storage_path: string | null;
  storage_object_exists: boolean | null;
  match_type: string | null;
  match_status: string | null;
  failed_check_count: number | null;
  unavailable_check_count: number | null;
  ai_match_reason: string | null;
  match_exception_summary: string | null;
  match_recommended_action: string | null;
}

/** Fetch the canonical `document_ui_view` rows for a set of document ids and
 * return them keyed by id, so callers can merge with their `ap_documents` rows
 * in JS. Returns an empty map for an empty input without hitting the network. */
export async function fetchDocumentUiRows(documentIds: string[]): Promise<Map<string, DocumentUiRow>> {
  const map = new Map<string, DocumentUiRow>();
  if (!documentIds.length) return map;
  const { data, error } = await supabase
    .from('document_ui_view')
    .select(DOCUMENT_UI_VIEW_SELECT)
    .in('document_id', documentIds);
  if (error) throw error;
  (data ?? []).forEach((r) => map.set((r as unknown as DocumentUiRow).document_id, r as unknown as DocumentUiRow));
  return map;
}

/** Per the backend contract (FRONTEND_HANDOFF_FOR_VAMSI.md §8): a document with
 * no trustworthy canonical supplier match must show this, never the AI-extracted
 * free-text name — 63 of 113 documents are in this state as of the last backend
 * snapshot. */
export const UNRESOLVED_SUPPLIER = 'Unresolved supplier';

const SEV_RANK: Record<Severity, number> = { critical: 4, high: 3, medium: 2, low: 1 };

export function normalizePriority(priority: string | null): WorklistRow['priority'] {
  const key = (priority ?? '').toLowerCase();
  return key === 'critical' || key === 'high' || key === 'medium' || key === 'low' ? key : 'medium';
}

/** Highest severity among a document's exception_cases (null when it has none). */
export function maxSeverity(cases: ApDocRow['exception_cases']): Severity | null {
  const sevs = (cases ?? [])
    .map((c) => (c.severity ?? '').toLowerCase())
    .filter((s): s is Severity => s === 'critical' || s === 'high' || s === 'medium' || s === 'low');
  if (!sevs.length) return null;
  return sevs.reduce((a, b) => (SEV_RANK[a] >= SEV_RANK[b] ? a : b));
}

// document_type -> short code used in the display ID (e.g. "INV", "PO", "GRN").
// Falls back to the first 3 letters of the raw type for anything unmapped.
const DOC_TYPE_CODE: Record<string, string> = {
  invoice: 'INV',
  purchase_order: 'PO',
  acknowledgement: 'ACK',
  grn: 'GRN',
  credit_memo: 'CM',
  supplier_statement: 'SS',
};

function docTypeCode(documentType: string): string {
  const key = documentType.trim().toLowerCase();
  if (DOC_TYPE_CODE[key]) return DOC_TYPE_CODE[key];
  const letters = key.replace(/[^a-z]/g, '').toUpperCase();
  return letters.slice(0, 3) || 'DOC';
}

/** Always-3-letter supplier code from initials, e.g. "Radwell International LLC" ->
 * "RIL". Single-word names (e.g. "BlueStar") have no initials to take, so they pad
 * out to 3 letters from the name itself — every ID keeps the same-length prefix. */
function supplierCode(supplier: string): string {
  const words = supplier.trim().split(/[^A-Za-z0-9]+/).filter(Boolean);
  if (!words.length) return 'UNK';
  let code = words.map((w) => w[0]).join('').toUpperCase();
  if (code.length < 3) {
    const letters = words.join('').toUpperCase();
    code += letters.slice(code.length);
  }
  return code.slice(0, 3) || 'UNK';
}

/** e.g. supplier "Radwell International LLC" + type "invoice" + ref "35404276"
 * -> "RIL-INV-35404276". Falls back to the raw document id when there's no doc
 * reference to build a meaningful ID from, and to "UNK" for the supplier segment
 * when the supplier is unresolved (empty string in). */
export function buildDisplayId(supplier: string, documentType: string, docRef: string, fallback: string): string {
  if (!docRef || docRef === '—') return fallback;
  const supCode = supplier && supplier !== '—' ? supplierCode(supplier) : 'UNK';
  const typeCode = documentType && documentType !== '—' ? docTypeCode(documentType) : 'DOC';
  return `${supCode}-${typeCode}-${docRef}`;
}

// Canonical document_type values are stored as lowercase snake_case
// (document_ui_view.document_type) — this formats them for display only, e.g.
// "purchase_order" -> "Purchase Order". Known acronyms stay fully capitalized
// (GRN, not "Grn") instead of naive per-word title-casing.
const DOC_TYPE_ACRONYMS = new Set(['grn']);

export function titleCaseDocType(documentType: string | null | undefined): string {
  if (!documentType || documentType === '—') return '—';
  return documentType
    .split('_')
    .map((word) => (DOC_TYPE_ACRONYMS.has(word) ? word.toUpperCase() : word.charAt(0).toUpperCase() + word.slice(1)))
    .join(' ');
}

// Map an ap_documents row + its document_ui_view row into the UI's WorklistRow
// shape. Canonical supplier/match/lifecycle/priority come from document_ui_view;
// amount/currency/invoice/PO number still come from the AI-extraction header
// (document_ui_view doesn't cover them yet — see the migration plan's follow-ups
// for Afrid); owner/confidence/dates come from ap_documents itself.
export function toWorklistRow(doc: ApDocRow, ui: DocumentUiRow | undefined): WorklistRow {
  const ai = doc.email_messages?.ai_understanding ?? {};
  const header = (ai.header ?? {}) as Record<string, any>;

  const rawConfidence = doc.ai_confidence ?? ai.confidence_score;
  const amount = Number(header.total_amount);
  const er = ai.exception_review as Record<string, any> | undefined;

  const resolved = !!ui?.supplier_id;
  const supplier = resolved ? (ui!.supplier_name ?? UNRESOLVED_SUPPLIER) : UNRESOLVED_SUPPLIER;
  // Prefer the stable vendor_code for the ID's supplier segment; fall back to the
  // canonical name. Empty string when unresolved — buildDisplayId already turns
  // that into the generic "UNK" prefix.
  const idSupplierInput = resolved ? (ui!.vendor_code || ui!.supplier_name || '') : '';

  const docRef = header.invoice_number ?? ai.document_number ?? '—';
  const documentType = ui?.document_type ?? '—';

  return {
    id: doc.id,
    display_id: buildDisplayId(idSupplierInput, documentType, docRef, doc.id.slice(0, 8)),
    supplier,
    doc_ref: docRef,
    po_number: ui?.transaction_key ?? header.po_number ?? '—',
    document_type: documentType,
    amount: Number.isFinite(amount) ? amount : 0,
    matched_against: {
      match_type: (ui?.match_type as WorklistRow['matched_against']['match_type']) ?? null,
      match_status: (ui?.match_status as WorklistRow['matched_against']['match_status']) ?? null,
      failed_check_count: ui?.failed_check_count ?? null,
      unavailable_check_count: ui?.unavailable_check_count ?? null,
      ai_match_reason: ui?.ai_match_reason ?? null,
      match_exception_summary: ui?.match_exception_summary ?? null,
      match_recommended_action: ui?.match_recommended_action ?? null,
    },
    stage: ui?.pipeline_stage ?? '—',
    // ai_confidence is stored as a 0–1 fraction; the UI displays it as a percentage.
    confidence: rawConfidence != null ? Math.round(rawConfidence * 100) : 0,
    priority: normalizePriority(ui?.priority ?? null),
    priority_reason: ui?.ai_priority_reason ?? '',
    exceptions: doc.exception_cases?.length ?? 0,
    severity: maxSeverity(doc.exception_cases),
    assigned_to: doc.owner ?? '—',
    created_at: doc.created_at ?? '',
    updated_at: doc.updated_at ?? '',
    // Carried through (not shown as columns) for the document-review / compare page.
    attachment_id: ui?.attachment_id ?? null,
    currency: header.currency ?? null,
    recommended_action: ui?.recommended_action ?? null,
    exception_review: er
      ? {
          review_required: er.review_required ?? null,
          exception_status: er.exception_status ?? null,
          review_reason: er.review_reason ?? null,
          exception_summary: er.exception_summary ?? null,
        }
      : null,
    document_chain_id: ui?.document_chain_id ?? null,
    sla_breached: ui?.sla_breached ?? null,
    filename: ui?.filename ?? null,
    file_type: ui?.file_type ?? null,
    storage_bucket: ui?.storage_bucket ?? null,
    storage_path: ui?.storage_path ?? null,
    storage_object_exists: ui?.storage_object_exists ?? null,
  };
}

/** Compare two rows on a given WorklistRow column, honoring type (numeric / date /
 * severity / text) and treating invalid/missing dates as always-last regardless of
 * sort direction, so NaN comparisons never produce inconsistent ordering. */
export function compareWorklistRows(
  a: WorklistRow,
  b: WorklistRow,
  col: keyof WorklistRow,
  dir: 'asc' | 'desc',
): number {
  const mul = dir === 'asc' ? 1 : -1;
  let diff: number;
  if (col === 'severity') {
    diff = (a.severity ? SEV_RANK[a.severity] : 0) - (b.severity ? SEV_RANK[b.severity] : 0);
  } else if (col === 'priority') {
    diff = SEV_RANK[a.priority] - SEV_RANK[b.priority];
  } else if (col === 'amount' || col === 'confidence' || col === 'exceptions') {
    diff = (a[col] as number) - (b[col] as number);
  } else if (col === 'created_at' || col === 'updated_at') {
    const at = new Date(a[col] as string).getTime();
    const bt = new Date(b[col] as string).getTime();
    const aInvalid = isNaN(at);
    const bInvalid = isNaN(bt);
    if (aInvalid && bInvalid) return 0;
    if (aInvalid) return 1; // invalid dates always sort last, regardless of dir
    if (bInvalid) return -1;
    diff = (at - bt) * mul;
    return diff;
  } else {
    diff = String(a[col]).localeCompare(String(b[col]));
  }
  return diff * mul;
}
