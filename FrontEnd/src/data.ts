import type { Severity } from '@/lib/theme';

/** Sample AP data. In production this comes from the API — kept here as a
 * single source of truth so pages stay presentational. */

export type WorklistStatus = 'matched' | 'review' | 'exception' | 'approved' | 'posted';
export type WorklistSla = 'on_track' | 'at_risk' | 'breached';

export interface WorklistRow {
  id: string;
  priority: Severity;
  supplier: string;
  doc_ref: string;
  po_number: string;
  document_type: string;
  amount: number;
  stage: string;
  confidence: number;
  exceptions: number;
  sla: WorklistSla;
  status: WorklistStatus;
  assigned_to: string;
  created_at: string;
  updated_at: string;
}

export interface SlaRow {
  inv: string;
  vendor: string;
  stage: string;
  due: string;
  amount: string;
  risk: 'high' | 'med';
}

export interface SeverityCount {
  label: string;
  n: number;
  sev: Severity;
  pct: number;
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

export interface InboxMessage {
  from: string;
  subject: string;
  when: string;
  tag: string;
  tone: InboxTone;
  unread: boolean;
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

export interface SettingsCard {
  title: string;
  desc: string;
  action: string;
}

export interface PipelineStage {
  name: string;
  v: number;
}

export const worklist: WorklistRow[] = [
  { id: 'WL-1001', priority: 'critical', supplier: 'Nimbus Logistics', doc_ref: 'INV-48213', po_number: '—', document_type: 'Standard Invoice', amount: 12480.00, stage: 'Matching', confidence: 62, exceptions: 1, sla: 'breached', status: 'exception', assigned_to: 'You', created_at: '2026-07-13 09:12', updated_at: '2026-07-13 09:40' },
  { id: 'WL-1002', priority: 'medium', supplier: 'Delta Office Supplies', doc_ref: 'INV-48201', po_number: 'PO-9942', document_type: 'PO-Backed', amount: 3210.50, stage: 'Coding', confidence: 88, exceptions: 0, sla: 'at_risk', status: 'review', assigned_to: 'You', created_at: '2026-07-13 08:47', updated_at: '2026-07-13 09:02' },
  { id: 'WL-1003', priority: 'high', supplier: 'Vertex Media Group', doc_ref: 'INV-48188', po_number: 'PO-9921', document_type: 'PO-Backed', amount: 14300.00, stage: 'Approval', confidence: 97, exceptions: 0, sla: 'on_track', status: 'matched', assigned_to: 'J. Okafor', created_at: '2026-07-13 08:05', updated_at: '2026-07-13 08:30' },
  { id: 'WL-1004', priority: 'low', supplier: 'Cobalt Tools Inc', doc_ref: 'INV-48170', po_number: 'PO-9871', document_type: 'PO-Backed', amount: 2180.75, stage: 'Posting', confidence: 99, exceptions: 0, sla: 'on_track', status: 'approved', assigned_to: 'You', created_at: '2026-07-12 17:22', updated_at: '2026-07-12 18:05' },
  { id: 'WL-1005', priority: 'high', supplier: 'Orion Freight Co', doc_ref: 'INV-48155', po_number: 'PO-9899', document_type: 'Freight', amount: 8940.00, stage: 'Matching', confidence: 71, exceptions: 1, sla: 'at_risk', status: 'exception', assigned_to: 'J. Okafor', created_at: '2026-07-12 16:40', updated_at: '2026-07-12 21:50' },
  { id: 'WL-1006', priority: 'medium', supplier: 'Summit Facilities', doc_ref: 'INV-48142', po_number: '—', document_type: 'Non-PO', amount: 5620.20, stage: 'Posting', confidence: 95, exceptions: 0, sla: 'on_track', status: 'posted', assigned_to: 'You', created_at: '2026-07-12 15:03', updated_at: '2026-07-12 15:40' },
  { id: 'WL-1007', priority: 'low', supplier: 'Larkspur Print', doc_ref: 'INV-48130', po_number: 'PO-9860', document_type: 'PO-Backed', amount: 1490.00, stage: 'Coding', confidence: 90, exceptions: 0, sla: 'on_track', status: 'review', assigned_to: 'A. Bianchi', created_at: '2026-07-12 13:58', updated_at: '2026-07-12 14:20' },
  { id: 'WL-1008', priority: 'medium', supplier: 'Meridian Utilities', doc_ref: 'INV-48119', po_number: '—', document_type: 'Utility', amount: 7305.44, stage: 'Approval', confidence: 93, exceptions: 0, sla: 'on_track', status: 'matched', assigned_to: 'You', created_at: '2026-07-12 11:31', updated_at: '2026-07-12 12:10' },
  { id: 'WL-1009', priority: 'low', supplier: 'Pinewood Catering', doc_ref: 'INV-48102', po_number: 'PO-9840', document_type: 'Non-PO', amount: 960.00, stage: 'Posting', confidence: 98, exceptions: 0, sla: 'on_track', status: 'posted', assigned_to: 'You', created_at: '2026-07-12 10:12', updated_at: '2026-07-12 10:45' },
  { id: 'WL-1010', priority: 'critical', supplier: 'Ashfield Legal LLP', doc_ref: 'INV-48091', po_number: '—', document_type: 'Non-PO', amount: 22150.00, stage: 'Matching', confidence: 54, exceptions: 1, sla: 'breached', status: 'exception', assigned_to: 'You', created_at: '2026-07-11 16:44', updated_at: '2026-07-12 09:15' },
];

export const sla: SlaRow[] = [
  { inv: 'INV-48120', vendor: 'Orion Freight Co', stage: 'Approval', due: 'in 42m', amount: '$8,940', risk: 'high' },
  { inv: 'INV-48088', vendor: 'Delta Office Supplies', stage: 'Coding', due: 'in 1h 10m', amount: '$3,210', risk: 'high' },
  { inv: 'INV-47996', vendor: 'Vertex Media Group', stage: 'Approval', due: 'in 1h 55m', amount: '$14,300', risk: 'med' },
  { inv: 'INV-47950', vendor: 'Cobalt Tools Inc', stage: 'Matching', due: 'in 2h 30m', amount: '$2,180', risk: 'med' },
];

export const severity: SeverityCount[] = [
  { label: 'Critical', n: 9, sev: 'critical', pct: 100 },
  { label: 'High', n: 21, sev: 'high', pct: 58 },
  { label: 'Medium', n: 34, sev: 'medium', pct: 82 },
  { label: 'Low', n: 23, sev: 'low', pct: 45 },
];

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

export const pipeline: PipelineStage[] = [
  { name: 'Ingested', v: 1284 }, { name: 'Extracted', v: 1102 }, { name: 'Matched', v: 948 },
  { name: 'Coded', v: 764 }, { name: 'Approved', v: 612 }, { name: 'Posted', v: 533 },
];

export const kpiStrip: KpiStripItem[] = [
  { label: 'Match Rate', value: '94.2%', pct: 94.2, good: true, trend: '+1.4' },
  { label: 'SLA Compliance', value: '91.8%', pct: 91.8, good: true, trend: '+0.6' },
  { label: 'Avg Processing', value: '2.4h', pct: 70, good: false, trend: '−0.7h' },
  { label: 'Exception Rate', value: '6.8%', pct: 32, good: false, trend: '−0.9' },
];

export const inbox: InboxMessage[] = [
  { from: 'billing@nimbuslogistics.com', subject: 'Invoice INV-48213 — July shipment charges', when: '9:12 AM', tag: 'Exception', tone: 'attn', unread: true },
  { from: 'ap@deltaoffice.com', subject: 'Statement + 2 invoices attached', when: '8:47 AM', tag: 'Captured', tone: 'ok', unread: true },
  { from: 'EDI Gateway', subject: 'Batch 8841 — 42 documents ingested', when: '8:05 AM', tag: 'Auto', tone: 'brand', unread: false },
  { from: 'accounts@vertexmedia.com', subject: 'Re: PO-9921 final invoice', when: 'Yesterday', tag: 'Matched', tone: 'ok', unread: false },
  { from: 'noreply@meridian-utilities.com', subject: 'Monthly utility statement — June', when: 'Yesterday', tag: 'Captured', tone: 'ok', unread: false },
  { from: 'invoicing@cobalttools.com', subject: 'Invoice + packing slip', when: 'Jul 11', tag: 'Approved', tone: 'ok', unread: false },
  { from: 'ashfield-legal@billing.com', subject: 'Retainer invoice Q3', when: 'Jul 11', tag: 'Exception', tone: 'attn', unread: false },
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

export const settings: SettingsCard[] = [
  { title: 'Approval Thresholds', desc: 'Dollar limits and routing rules for who signs off at each tier.', action: 'Manage rules' },
  { title: 'GL Mapping', desc: 'Vendor-to-account mappings used by auto-coding. 34 active rules.', action: 'Edit mappings' },
  { title: 'SLA Policies', desc: 'Time targets per stage and escalation behavior on breach.', action: 'Configure' },
  { title: 'Integrations', desc: 'ERP sync (NetSuite), email capture, and EDI gateway connections.', action: 'View connections' },
  { title: 'Team & Roles', desc: '8 members · analyst, approver, and admin permission sets.', action: 'Manage team' },
  { title: 'Notifications', desc: 'Alert channels for critical exceptions and SLA warnings.', action: 'Edit' },
];
