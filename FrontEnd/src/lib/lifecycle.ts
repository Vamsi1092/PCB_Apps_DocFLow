import { supabase } from './supabase';

/**
 * Real PO -> Acknowledgement -> GRN -> Invoice lifecycle, from Supabase's
 * `document_lifecycle_view`. Replaces the old `data/lifecycleMock.ts` — every
 * field here is real backend data, not illustrative sample data. Missing stages
 * come back explicitly as `document_id: null, extraction_status: 'not_received'`
 * rather than being omitted. See FRONTEND_HANDOFF_FOR_VAMSI.md §7.
 */

export type ExtractionState = 'not_received' | 'received_pending' | 'extracted' | 'extraction_failed';
export type LifecycleStageName = 'purchase_order' | 'acknowledgement' | 'grn' | 'invoice';

export const STAGE_ORDER: LifecycleStageName[] = ['purchase_order', 'acknowledgement', 'grn', 'invoice'];

export interface LifecycleStageRow {
  document_chain_id: string;
  transaction_key: string | null;
  stage_name: LifecycleStageName;
  stage_order: number;
  document_id: string | null;
  extraction_status: ExtractionState;
  received_at: string | null;
  filename: string | null;
  storage_bucket: string | null;
  storage_path: string | null;
  storage_object_exists: boolean | null;
  match_type: string | null;
  match_status: string | null;
}

const LIFECYCLE_SELECT =
  'document_chain_id, transaction_key, stage_name, stage_order, document_id, extraction_status, received_at, filename, storage_bucket, storage_path, storage_object_exists, match_type, match_status';

/** All 4 stage rows for a chain, ordered `stage_order` 1–4. Throws on a real
 * Supabase error; callers decide how to surface it (the Worklist hover popup
 * treats a fetch failure as "couldn't load," not as "no chain"). */
export async function fetchLifecycle(chainId: string): Promise<LifecycleStageRow[]> {
  const { data, error } = await supabase
    .from('document_lifecycle_view')
    .select(LIFECYCLE_SELECT)
    .eq('document_chain_id', chainId)
    .order('stage_order');
  if (error) throw error;
  return (data ?? []) as unknown as LifecycleStageRow[];
}

export function stageByName(stages: LifecycleStageRow[], name: LifecycleStageName): LifecycleStageRow | undefined {
  return stages.find((s) => s.stage_name === name);
}
