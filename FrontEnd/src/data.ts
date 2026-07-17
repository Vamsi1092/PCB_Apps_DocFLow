import type { Severity } from '@/lib/theme';

/** Sample AP data. In production this comes from the API — kept here as a
 * single source of truth so pages stay presentational. */

/** Status is derived from the AI's own exception assessment, not ap_documents.stage
 * (which is frozen at "review" from creation and never advanced by a workflow):
 * 'exception' when the AI flagged something needing review, 'action' otherwise —
 * paired with a free-text label (the exception reason, or the AI's recommended
 * next action) rather than a fixed enum of stages that don't actually occur yet. */
export type WorklistStatusKind = 'exception' | 'action';

export interface WorklistRow {
  id: string;
  display_id: string;
  priority: Severity;
  priority_reason: string;
  supplier: string;
  doc_ref: string;
  po_number: string;
  document_type: string;
  amount: number;
  stage: string;
  confidence: number;
  exceptions: number;
  status_kind: WorklistStatusKind;
  status_label: string;
  assigned_to: string;
  created_at: string;
  updated_at: string;
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


export interface ExceptionRow {
  inv: string;
  vendor: string;
  type: string;
  sev: Severity;
  age: string;
  owner: string;
}

export interface ApprovalCard {
  id: string;
  inv: string;
  vendor: string;
  amount: string;
  submitted: string;
  po: string;
}

export interface MonthTrend {
  m: string;
  inv: number;
  exc: number;
}

export interface ExceptionTypeCount {
  label: string;
  n: number;
  attn?: boolean;
}

export type AutonomyLevel = 'auto' | 'assist' | 'human';

export interface KpiStripItem {
  label: string;
  value: string;
  pct: number;
  good: boolean;
  trend: string;
}

export type InboxTone = 'attn' | 'ok' | 'brand';

export interface InboxSummary {
  headline: string;
  body: string;
}

export interface InboxAttachment {
  id: string;
  filename: string;
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
  summary: InboxSummary;
  supplier: InboxParty;
  vendor: InboxParty;
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

export const exceptions: ExceptionRow[] = [
  { inv: 'INV-48213', vendor: 'Nimbus Logistics', type: 'Tax-line mismatch', sev: 'critical', age: '3h 20m', owner: 'You' },
  { inv: 'INV-48091', vendor: 'Ashfield Legal LLP', type: 'Missing PO reference', sev: 'critical', age: '1d 2h', owner: 'You' },
  { inv: 'INV-48155', vendor: 'Orion Freight Co', type: 'Price variance > 5%', sev: 'high', age: '5h 10m', owner: 'J. Okafor' },
  { inv: 'INV-48044', vendor: 'Summit Facilities', type: 'Quantity variance', sev: 'high', age: '8h 44m', owner: 'You' },
  { inv: 'INV-47988', vendor: 'Delta Office Supplies', type: 'Duplicate suspected', sev: 'medium', age: '1d 5h', owner: 'A. Bianchi' },
  { inv: 'INV-47960', vendor: 'Meridian Utilities', type: 'GL code unmapped', sev: 'medium', age: '1d 9h', owner: 'You' },
  { inv: 'INV-47912', vendor: 'Larkspur Print', type: 'Currency mismatch', sev: 'low', age: '2d 1h', owner: 'A. Bianchi' },
  { inv: 'INV-47880', vendor: 'Pinewood Catering', type: 'Rounding difference', sev: 'low', age: '2d 6h', owner: 'J. Okafor' },
];

export const approvals: ApprovalCard[] = [
  { id: 'a1', inv: 'INV-48188', vendor: 'Vertex Media Group', amount: '$14,300', submitted: '2h ago', po: 'PO-9921' },
  { id: 'a2', inv: 'INV-48119', vendor: 'Meridian Utilities', amount: '$7,305', submitted: '3h ago', po: 'PO-9905' },
  { id: 'a3', inv: 'INV-48070', vendor: 'Cobalt Tools Inc', amount: '$2,180', submitted: '5h ago', po: 'PO-9888' },
  { id: 'a4', inv: 'INV-48033', vendor: 'Summit Facilities', amount: '$5,620', submitted: '6h ago', po: 'PO-9871' },
  { id: 'a5', inv: 'INV-47990', vendor: 'Larkspur Print', amount: '$1,490', submitted: '8h ago', po: 'PO-9854' },
  { id: 'a6', inv: 'INV-47955', vendor: 'Pinewood Catering', amount: '$960', submitted: '9h ago', po: 'PO-9840' },
];

export const months: MonthTrend[] = [
  { m: 'Feb', inv: 3820, exc: 410 }, { m: 'Mar', inv: 4120, exc: 388 }, { m: 'Apr', inv: 4460, exc: 362 },
  { m: 'May', inv: 4780, exc: 341 }, { m: 'Jun', inv: 5120, exc: 355 }, { m: 'Jul', inv: 5460, exc: 318 },
];

export const exceptionTypes: ExceptionTypeCount[] = [
  { label: 'Price / tax mismatch', n: 312, attn: true }, { label: 'Missing PO reference', n: 208 },
  { label: 'Duplicate suspected', n: 141 }, { label: 'Quantity variance', n: 96 },
  { label: 'GL code unmapped', n: 74 }, { label: 'Rounding difference', n: 52 },
];

export const stages: string[] = ['Capture', 'Extraction', 'Matching', 'Coding', 'Approval', 'Posting'];
export const docTypes: string[] = ['Standard Invoice', 'PO-Backed', 'Non-PO', 'Credit Memo', 'Utility', 'Freight'];

export const autonomyGrid: Record<string, AutonomyLevel[]> = {
  'Standard Invoice': ['auto', 'auto', 'auto', 'assist', 'assist', 'human'],
  'PO-Backed': ['auto', 'auto', 'auto', 'auto', 'assist', 'human'],
  'Non-PO': ['auto', 'assist', 'human', 'human', 'human', 'human'],
  'Credit Memo': ['auto', 'auto', 'assist', 'assist', 'human', 'human'],
  'Utility': ['auto', 'auto', 'auto', 'assist', 'assist', 'human'],
  'Freight': ['auto', 'assist', 'assist', 'human', 'human', 'human'],
};

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
