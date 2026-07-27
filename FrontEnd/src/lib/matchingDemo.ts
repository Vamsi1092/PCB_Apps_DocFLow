import { supabase } from './supabase';

/**
 * The 7-scenario controlled matching demo — VAMSI_7_SCENARIO_UI_DEMO_GUIDE.md.
 * `invoice_match_review_view` holds exactly these 7 rows (verified live); every
 * other AP document has no row here at all. Document Review uses
 * `fetchMatchingDemoRow` to detect whether the document it's showing is one of
 * the 7 — if so, its matching cards switch to this view's fields per the guide;
 * every other document keeps the general `document_ui_view`-based cards.
 */

export const DEMO_SCENARIO_CODES = [
  'S01_NO_PO_UNMATCHED',
  'S02_TWO_WAY_MATCHED',
  'S03_TWO_WAY_AMOUNT_VARIANCE',
  'S04_TWO_WAY_QUANTITY_VARIANCE',
  'S05_THREE_WAY_MATCHED',
  'S06_THREE_WAY_AMOUNT_VARIANCE',
  'S07_THREE_WAY_GRN_QUANTITY_VARIANCE',
] as const;

export const MATCHING_DEMO_SELECT = `
  document_id,
  invoice_header_id,
  invoice_number,
  po_number,
  grn_number,
  scenario_code,
  scenario_name,
  match_type,
  match_status,
  two_way_status,
  three_way_status,
  exception_count,
  exception_summary,
  match_status_invoice_po,
  match_status_invoice_grn,
  match_status_po_grn,
  ai_match_reason,
  ai_recommended_action,
  match_reason_source,
  invoice_filename,
  invoice_storage_bucket,
  invoice_storage_path,
  invoice_document_exists,
  po_filename,
  po_storage_bucket,
  po_storage_path,
  po_document_exists,
  grn_filename,
  grn_storage_bucket,
  grn_storage_path,
  grn_document_exists
`;

export interface MatchingDemoRow {
  document_id: string;
  invoice_header_id: string | null;
  invoice_number: string | null;
  po_number: string | null;
  grn_number: string | null;
  scenario_code: string | null;
  scenario_name: string | null;
  match_type: '2_WAY' | '3_WAY' | 'UNMATCHED' | null;
  match_status: 'MATCHED' | 'VARIANCE' | 'UNMATCHED' | null;
  two_way_status: string | null;
  three_way_status: string | null;
  exception_count: number | null;
  exception_summary: string | null;
  match_status_invoice_po: string | null;
  match_status_invoice_grn: string | null;
  match_status_po_grn: string | null;
  ai_match_reason: string | null;
  ai_recommended_action: string | null;
  match_reason_source: string | null;
  invoice_filename: string | null;
  invoice_storage_bucket: string | null;
  invoice_storage_path: string | null;
  invoice_document_exists: boolean | null;
  po_filename: string | null;
  po_storage_bucket: string | null;
  po_storage_path: string | null;
  po_document_exists: boolean | null;
  grn_filename: string | null;
  grn_storage_bucket: string | null;
  grn_storage_path: string | null;
  grn_document_exists: boolean | null;
}

/**
 * Mirrors the guide's §10 validation (scenario code present, match result
 * complete, OCI explanation/action present, `match_reason_source === 'oci'`).
 * The guide's own sample throws on failure; here it's a soft check — Document
 * Review treats a failing row as "not a demo document" and falls back to the
 * general document_ui_view-based cards, rather than crashing the page over a
 * data anomaly on an unrelated document.
 */
function isValidDemoRow(row: MatchingDemoRow): boolean {
  if (!row.scenario_code) return false;
  if (!row.match_status || !row.match_type) return false;
  if (!row.ai_match_reason || !row.ai_recommended_action) return false;
  if (row.match_reason_source !== 'oci') return false;
  if (row.match_status !== 'MATCHED' && !row.exception_summary) return false;
  return true;
}

/**
 * Returns the document's `invoice_match_review_view` row when it's one of the
 * 7 controlled scenarios and passes validation, else `null`. A `null` result
 * is the signal to use the general per-document cards instead — it covers
 * both "no row" (115 of 122 documents) and "row exists but failed validation".
 */
export async function fetchMatchingDemoRow(documentId: string): Promise<MatchingDemoRow | null> {
  const { data, error } = await supabase
    .from('invoice_match_review_view')
    .select(MATCHING_DEMO_SELECT)
    .eq('document_id', documentId)
    .in('scenario_code', DEMO_SCENARIO_CODES)
    .maybeSingle();

  if (error) {
    console.warn('fetchMatchingDemoRow: query failed, falling back to general cards', error);
    return null;
  }
  if (!data) return null;

  const row = data as unknown as MatchingDemoRow;
  if (!isValidDemoRow(row)) {
    console.warn('fetchMatchingDemoRow: row failed validation, falling back to general cards', row);
    return null;
  }
  return row;
}
