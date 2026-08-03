import type { Severity } from '@/lib/theme';

/** Sample AP data. In production this comes from the API — kept here as a
 * single source of truth so pages stay presentational. */

/** Real PO <-> Invoice <-> GRN matching result — sourced from Supabase's
 * `current_match_results` (via `document_ui_view`). `match_type`/`match_status`
 * are `null` when no validation run has happened yet for this document (most
 * documents today) — distinct from a real `UNMATCHED` verdict. PO/GRN reference
 * numbers and per-field pass/fail are NOT part of this contract; the PO/GRN
 * panes on Document Review get their own reference + preview from the document's
 * lifecycle chain (`document_lifecycle_view`) instead. See
 * FRONTEND_HANDOFF_FOR_VAMSI.md §6. */
export interface WorklistMatch {
  match_type: '2_WAY' | '3_WAY' | 'UNMATCHED' | null;
  match_status: 'MATCHED' | 'VARIANCE' | 'UNMATCHED' | null;
  failed_check_count: number | null;
  unavailable_check_count: number | null;
  // OCI's explanation of the persisted match result (document_ui_view.ai_match_reason,
  // FRONTEND_HANDOFF_FOR_VAMSI §4.1). Null when no match has run.
  ai_match_reason: string | null;
  // Deterministic, backend-computed discrepancy summary (document_ui_view.match_exception_summary,
  // §4.1) — preferred over the AI-extraction's own exception_review JSON when present.
  match_exception_summary: string | null;
  // Match-specific guidance (document_ui_view.match_recommended_action, §4.1) — preferred
  // over the document's general `recommended_action` on Document Review when present.
  match_recommended_action: string | null;
}

/** The AI extraction's per-document exception assessment — mirrors the backend's
 * DocumentQueueExceptionReview. Surfaced on the document-review page. */
export interface WorklistExceptionReview {
  review_required: boolean | null;
  exception_status: string | null;
  review_reason: string | null;
  exception_summary: string | null;
}

export interface WorklistRow {
  id: string;
  display_id: string;
  supplier: string;
  doc_ref: string;
  po_number: string;
  document_type: string;
  amount: number;
  matched_against: WorklistMatch;
  confidence: number;
  priority: Severity;
  priority_reason: string;
  exceptions: number;
  // Highest exception severity from the exceptions table (null when the document
  // has no exceptions) — shown in the Worklist Severity column next to exceptions.
  severity: Severity | null;
  stage: string;
  assigned_to: string;
  created_at: string;
  updated_at: string;
  // Extra fields carried through for the document-review / compare page (not
  // shown as Worklist columns). attachment_id + storage_* back the real invoice
  // preview; document_chain_id looks up the PO/Ack/GRN chain in
  // document_lifecycle_view.
  attachment_id: string | null;
  currency: string | null;
  recommended_action: string | null;
  exception_review: WorklistExceptionReview | null;
  document_chain_id: string | null;
  sla_breached: boolean | null;
  filename: string | null;
  file_type: string | null;
  storage_bucket: string | null;
  storage_path: string | null;
  storage_object_exists: boolean | null;
}

/** A document ranked by how long it's been open — used by the Dashboard's
 * "Aging Documents" panel in place of a real SLA due-date, since nothing
 * in the backend currently sets one. */
export interface AgingRow {
  inv: string;
  vendor: string;
  stage: string;
  age: string;
  amount: string;
  risk: 'high' | 'med';
}


export type AutonomyLevel = 'auto' | 'assist' | 'human' | 'na';

/** Why a Human-Required gate is human: 'maturity' can be promoted to a lower
 * level once the AI model proves out; 'locked' is a governance/compliance
 * checkpoint that should never be automated. Only meaningful when level === 'human'. */
export type AutonomyGate = 'maturity' | 'locked';

export interface KpiStripItem {
  label: string;
  value: string;
  pct: number;
  good: boolean;
  trend: string;
}

export type InboxTone = 'attn' | 'ok' | 'brand';

export interface InboxAttachment {
  id: string;
  filename: string;
  file_type: string | null;
  storage_bucket: string | null;
  storage_path: string | null;
}

/** Party name + address extracted from the document header — used for both
 * the Supplier (who issued the document) and Vendor (the Ship To party) columns. */
export interface InboxParty {
  name: string;
  address: string;
}

export interface InboxMessage {
  id: string;
  name: string;
  from: string;
  subject: string;
  when: string;
  tag: string;
  tone: InboxTone;
  unread: boolean;
  attachments: InboxAttachment[];
  // The AI's plain-language narrative for this document (ai_understanding.ai_intent),
  // e.g. "Acme Co submitted Invoice 123 against PO 456 for payment processing."
  summary: string;
  supplier: InboxParty;
  vendor: InboxParty;
  // The AI's classified document category for this email (e.g. "Invoice",
  // "Purchase Order", "Acknowledgement", "GRN") — from
  // email_messages.ai_understanding.document_type. Null before extraction runs.
  category: string | null;
}

export type ActivityKind = 'bolt' | 'gear' | 'check' | 'alert' | 'user';
export type ActivityCategory = 'ai' | 'system' | 'human';

export interface ActivityEvent {
  who: string;
  action: string;
  target: string;
  when: string;
  kind: ActivityKind;
  cat: ActivityCategory;
}

export const stages: string[] = ['Capture', 'Extraction', 'Matching', 'Coding', 'Approval', 'Posting'];
export const docTypes: string[] = [
  'Invoice', 'Credit Memo', 'Debit Memo', 'Supplier Statement',
  'PO Acknowledgement', 'Utility Bill', 'Freight Invoice', 'Non-PO Invoice',
];

/** The AP document lifecycle as configured on the Autonomy page — distinct from
 * (and more granular than) the `stages` SLA policy list Settings uses. */
export const autonomyStages: string[] = ['Extraction', 'Exception', 'Review', 'On Hold', 'Approval', 'Posting Ready', 'Posted'];

export interface AutonomyCell {
  level: AutonomyLevel;
  gate?: AutonomyGate;
}

/** One row per document type, one cell per `autonomyStages` entry (same order). */
export const autonomyGrid: Record<string, AutonomyCell[]> = {
  'Invoice': [
    { level: 'auto' }, { level: 'auto' }, { level: 'assist' }, { level: 'auto' },
    { level: 'human', gate: 'maturity' }, { level: 'assist' }, { level: 'auto' },
  ],
  'Credit Memo': [
    { level: 'auto' }, { level: 'auto' }, { level: 'assist' }, { level: 'auto' },
    { level: 'human', gate: 'maturity' }, { level: 'assist' }, { level: 'auto' },
  ],
  'Debit Memo': [
    { level: 'auto' }, { level: 'auto' }, { level: 'assist' }, { level: 'auto' },
    { level: 'human', gate: 'maturity' }, { level: 'assist' }, { level: 'auto' },
  ],
  'Supplier Statement': [
    { level: 'auto' }, { level: 'auto' }, { level: 'assist' }, { level: 'na' },
    { level: 'assist' }, { level: 'assist' }, { level: 'auto' },
  ],
  'PO Acknowledgement': [
    { level: 'auto' }, { level: 'auto' }, { level: 'assist' }, { level: 'auto' },
    { level: 'human', gate: 'maturity' }, { level: 'na' }, { level: 'auto' },
  ],
  'Utility Bill': [
    { level: 'auto' }, { level: 'auto' }, { level: 'auto' }, { level: 'auto' },
    { level: 'auto' }, { level: 'assist' }, { level: 'human', gate: 'locked' },
  ],
  'Freight Invoice': [
    { level: 'auto' }, { level: 'na' }, { level: 'na' }, { level: 'na' },
    { level: 'auto' }, { level: 'auto' }, { level: 'auto' },
  ],
  'Non-PO Invoice': [
    { level: 'auto' }, { level: 'auto' }, { level: 'auto' }, { level: 'na' },
    { level: 'human', gate: 'locked' }, { level: 'na' }, { level: 'auto' },
  ],
};

export type ReportingDocumentType = 'invoice' | 'purchase_order' | 'grn' | 'acknowledgement';

export const REPORTING_DOCUMENT_TYPE_LABELS: Record<ReportingDocumentType, string> = {
  invoice: 'Invoice',
  purchase_order: 'Purchase Order',
  grn: 'Goods Receipt',
  acknowledgement: 'Acknowledgement',
};

export interface AiApInsight {
  title: string;
  body: string;
}

export const aiApInsights: AiApInsight[] = [
  {
    title: 'GRN Exception Trend',
    body: 'Missing GRN exceptions increased 40% this week. Recommend confirming GRN process with warehouse team for CNG Supplies Ltd and Baker Industries.',
  },
  {
    title: 'Duplicate Risk Alert',
    body: '3 duplicate risk invoices detected this period. Supplier statement reconciliation may reduce duplicate submissions.',
  },
  {
    title: 'SLA Performance',
    body: 'SLA compliance at 87%. 2 invoices breached SLA. High-value invoices above $10K should be prioritized within 4 hours of receipt.',
  },
];

export const kpiStrip: KpiStripItem[] = [
  { label: 'Match Rate', value: '94.2%', pct: 94.2, good: true, trend: '+1.4' },
  { label: 'SLA Compliance', value: '91.8%', pct: 91.8, good: true, trend: '+0.6' },
  { label: 'Avg Processing', value: '2.4h', pct: 70, good: false, trend: '−0.7h' },
  { label: 'Exception Rate', value: '6.8%', pct: 32, good: false, trend: '−0.9' },
];

export const activity: ActivityEvent[] = [
  { who: 'Autonomy Engine', action: 'auto-matched & posted', target: 'INV-48102', when: 'Just now', kind: 'bolt', cat: 'ai' },
  { who: 'System', action: 'completed ERP sync with', target: 'NetSuite', when: '6 min ago', kind: 'gear', cat: 'system' },
  { who: 'You', action: 'approved', target: 'INV-48170', when: '12 min ago', kind: 'check', cat: 'human' },
  { who: 'Autonomy Engine', action: 'flagged a critical exception on', target: 'INV-48213', when: '38 min ago', kind: 'alert', cat: 'ai' },
  { who: 'J. Okafor', action: 'reassigned', target: 'INV-48155', when: '1h ago', kind: 'user', cat: 'human' },
  { who: 'System', action: 'captured 6 emails from', target: 'AP Inbox', when: '1h ago', kind: 'bolt', cat: 'system' },
  { who: 'Autonomy Engine', action: 'extracted 42 documents in', target: 'Batch 8841', when: '2h ago', kind: 'bolt', cat: 'ai' },
  { who: 'You', action: 'created a GL-mapping rule for', target: 'Meridian Utilities', when: '3h ago', kind: 'gear', cat: 'human' },
  { who: 'A. Bianchi', action: 'resolved a duplicate on', target: 'INV-47988', when: '4h ago', kind: 'check', cat: 'human' },
  { who: 'Autonomy Engine', action: 'auto-coded', target: 'INV-48091', when: '5h ago', kind: 'bolt', cat: 'ai' },
  { who: 'System', action: 'ran nightly reconciliation on', target: 'Ledger', when: 'Yesterday', kind: 'gear', cat: 'system' },
];

/** The AP team a document can be assigned to. Roster is illustrative for now —
 * assignment is a client-side action in this read-only Supabase phase (see the
 * Worklist "Assigned To" column); it's not yet persisted. `avatar` holds the
 * Tailwind gradient utility classes used by the initials avatar. */
export interface TeamMember {
  id: string;
  name: string;
  role: string;
  initials: string;
  avatar: string;
}

export const teamMembers: TeamMember[] = [
  { id: 'reyes', name: 'Maya Reyes', role: 'AP Analyst', initials: 'MR', avatar: 'from-navy2 to-[#6B84C4]' },
  { id: 'okafor', name: 'J. Okafor', role: 'AP Specialist', initials: 'JO', avatar: 'from-[#0E7490] to-[#22D3EE]' },
  { id: 'bianchi', name: 'A. Bianchi', role: 'AP Specialist', initials: 'AB', avatar: 'from-[#7C3AED] to-[#C4B5FD]' },
  { id: 'chen', name: 'L. Chen', role: 'AP Manager', initials: 'LC', avatar: 'from-[#B45309] to-[#FBBF24]' },
  { id: 'novak', name: 'P. Novak', role: 'AP Clerk', initials: 'PN', avatar: 'from-[#047857] to-[#34D399]' },
  { id: 'santos', name: 'R. Santos', role: 'AP Clerk', initials: 'RS', avatar: 'from-[#BE123C] to-[#FB7185]' },
];
