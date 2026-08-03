import { useState, type ReactNode } from 'react';
import { AlertTriangle, CheckCircle2, Clock } from 'lucide-react';
import { GREEN, RED } from '@/lib/theme';
import { stageByName, type ExtractionState, type LifecycleStageName, type LifecycleStageRow } from '@/lib/lifecycle';
import type { WorklistMatch } from '@/data';

/**
 * Document Lifecycle card — implements the "Document Lifecycle Card.dc.html"
 * design from Claude Design (project 3e7c6537-0051-42b2-a33d-c267c169735c).
 * Shown when a Worklist row is hovered. Rows are individually expandable
 * (click or Enter/Space) to reveal detail fields; the hovered document's own
 * stage starts expanded.
 *
 * Every value rendered here is real Supabase data (document_lifecycle_view +
 * the row's own current_match_results) — nothing here is illustrative. Two
 * adaptations from the source design, made because the real data doesn't
 * support what the mockup assumed:
 * 1. The match node is PRESENCE-driven, not verdict-only. It mirrors the real
 *    business lifecycle: once PO + GRN are both in, 2-way matching has started,
 *    so a 2-Way node shows (between GRN and Invoice) even before a verdict
 *    exists — green + glow while pending, or its real Matched/Variance verdict
 *    once current_match_results has one. Once the Invoice arrives, 3-way
 *    matching takes over: the 2-Way node is hidden ("no need of 2-way once
 *    3-way is in play") and a 3-Way node shows at the end instead — again green
 *    + glow while pending, or its real verdict. Exactly ONE match node is shown
 *    at a time (real data has only one current verdict per document — match_type
 *    is exclusively 2_WAY or 3_WAY, never both). Chains with neither condition
 *    met fall back to the neutral "No match run yet".
 * 2. The design's per-stage detail fields (PO Number, Order Date, Ship To,
 *    etc.) aren't fields document_lifecycle_view has. Detail fields here are
 *    limited to what's real per stage: received date and filename, plus the
 *    invoice's own amount (already available on the Worklist row).
 * Sized down further than the source design's own 338x590 spec per explicit
 * request — this is a hover popup, not a full page.
 */

const INDIGO_BORDER = 'rgba(99,102,241,.6)';
const INDIGO_BG = 'rgba(99,102,241,.08)';
const INDIGO_ICON_BG = 'rgba(99,102,241,.18)';
const INDIGO_ICON_COLOR = '#c7d2fe';
const AMBER = '#fb923c';
const TEXT_BRIGHT = '#f5f6fa';
const TEXT_DIM = 'rgba(226,232,255,.5)';
const TEXT_FAINT = 'rgba(226,232,255,.4)';
const TEXT_FAINTER = 'rgba(226,232,255,.35)';
const MUTED_STATUS = 'rgba(226,232,255,.45)';
const MUTED_DOT = 'rgba(226,232,255,.4)';

function PoIcon({ color }: { color: string }) {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <path d="M14 2v6h6" />
      <line x1="8" y1="13" x2="16" y2="13" />
      <line x1="8" y1="17" x2="13" y2="17" />
    </svg>
  );
}
function AckIcon({ color }: { color: string }) {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <rect x="9" y="2" width="6" height="4" rx="1" />
      <path d="M9 4H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2h-3" />
      <path d="m9 14 2 2 4-4" />
    </svg>
  );
}
function GrnIcon({ color }: { color: string }) {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <path d="m7.5 4.27 9 5.15" />
      <path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z" />
      <path d="M3.3 6.96 12 12.01l8.7-5.05" />
      <path d="M12 22.08V12" />
    </svg>
  );
}
function InvoiceIcon({ color }: { color: string }) {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <path d="M14 2v6h6" />
      <line x1="8" y1="12" x2="16" y2="12" />
      <line x1="8" y1="16" x2="16" y2="16" />
    </svg>
  );
}

const STAGE_TITLE: Record<LifecycleStageName, string> = {
  purchase_order: 'Purchase Order',
  acknowledgement: 'Acknowledgement',
  grn: 'Goods Receipt',
  invoice: 'Invoice',
};
const STAGE_ICON: Record<LifecycleStageName, (p: { color: string }) => ReactNode> = {
  purchase_order: PoIcon,
  acknowledgement: AckIcon,
  grn: GrnIcon,
  invoice: InvoiceIcon,
};

function fmtDate(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (isNaN(d.getTime())) return null;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function fmtMoney(amount: number | null, currency: string | null): string | null {
  if (amount == null) return null;
  const symbol = currency ? `${currency} ` : '$';
  return symbol + amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

interface DetailField {
  label: string;
  value: string;
}

interface InvoiceExtras {
  amount: number | null;
  currency: string | null;
  docRef: string | null;
  createdAt: string | null;
}

function detailFieldsFor(name: LifecycleStageName, stage: LifecycleStageRow | undefined, extras: InvoiceExtras): DetailField[] {
  const fields: DetailField[] = [];
  const received = fmtDate(stage?.received_at ?? (name === 'invoice' ? extras.createdAt : null));
  if (received) fields.push({ label: 'Received', value: received });
  const file = stage?.filename ?? (name === 'invoice' ? extras.docRef : null);
  if (file) fields.push({ label: 'File', value: file });
  if (name === 'invoice') {
    const money = fmtMoney(extras.amount, extras.currency);
    if (money) fields.push({ label: 'Amount', value: money });
  }
  return fields;
}

function Connector({ active }: { active: boolean }) {
  return (
    <div className="ml-[21px] flex h-2 justify-center">
      <div
        className="flow-connector-fill relative w-0.5 rounded-full"
        style={{ background: active ? GREEN : 'rgba(255,255,255,.14)' }}
      >
        {active && (
          <span
            className="flow-pulse absolute -left-[2px] h-1.5 w-1.5 rounded-full"
            style={{ background: '#a7f3d0', boxShadow: '0 0 6px 1px rgba(52,211,153,.7)' }}
          />
        )}
      </div>
    </div>
  );
}

function MatchBadge({ label, tone }: { label: string; tone: 'matched' | 'variance' | 'neutral' }) {
  const color = tone === 'matched' ? GREEN : tone === 'variance' ? AMBER : 'rgba(226,232,255,.6)';
  const bg = tone === 'matched' ? 'rgba(52,211,153,.12)' : tone === 'variance' ? 'rgba(251,146,60,.12)' : 'rgba(255,255,255,.05)';
  const border = tone === 'matched' ? 'rgba(52,211,153,.35)' : tone === 'variance' ? 'rgba(251,146,60,.35)' : 'rgba(255,255,255,.14)';
  const Icon = tone === 'matched' ? CheckCircle2 : tone === 'variance' ? AlertTriangle : Clock;
  return (
    <div className="flow-step flex justify-center">
      <span
        className={`inline-flex items-center gap-1 rounded-full px-2.5 py-[3px] text-[10px] font-bold${tone === 'matched' ? ' flow-glow' : ''}`}
        style={{ color, background: bg, border: `1px solid ${border}` }}
      >
        <Icon size={10} />
        {label}
      </span>
    </div>
  );
}

interface DocumentLifecyclePopupProps {
  transactionKey: string | null;
  supplier: string | null;
  /** null while loading, [] when the document has no chain (document_chain_id null). */
  stages: LifecycleStageRow[] | null;
  loadFailed: boolean;
  matchType: WorklistMatch['match_type'];
  matchStatus: WorklistMatch['match_status'];
  failedCheckCount: number | null;
  hoveredStage: LifecycleStageName | null;
  invoiceAmount: number | null;
  invoiceCurrency: string | null;
  invoiceDocRef: string | null;
  invoiceCreatedAt: string | null;
  onMouseEnter: () => void;
  onMouseLeave: () => void;
}

export function DocumentLifecyclePopup({
  transactionKey, supplier, stages, loadFailed, matchType, matchStatus, failedCheckCount, hoveredStage,
  invoiceAmount, invoiceCurrency, invoiceDocRef, invoiceCreatedAt,
  onMouseEnter, onMouseLeave,
}: DocumentLifecyclePopupProps) {
  const [expanded, setExpanded] = useState<LifecycleStageName | null>(hoveredStage);
  const toggle = (name: LifecycleStageName) => setExpanded((cur) => (cur === name ? null : name));

  const shell = (children: ReactNode) => (
    <div
      className="flow-panel w-[264px] overflow-hidden rounded-2xl p-3 text-white"
      style={{
        background: 'linear-gradient(180deg,#2f3550,#282d43)',
        boxShadow: '0 14px 34px rgba(0,0,0,.35)',
        border: '1px solid rgba(255,255,255,.07)',
      }}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      {children}
    </div>
  );

  const header = (
    <>
      <div className="mb-0.5 flex items-baseline justify-between gap-2">
        <span className="text-[9px] font-medium" style={{ color: '#a5b4fc' }}>Document Lifecycle</span>
        {supplier && <span className="truncate text-[10.5px]" style={{ color: 'rgba(226,232,255,.45)' }}>{supplier}</span>}
      </div>
      <div className="mb-2 truncate text-[14.5px] font-bold" style={{ color: TEXT_BRIGHT }}>{transactionKey ?? 'No PO linked'}</div>
    </>
  );

  if (loadFailed) {
    return shell(
      <>
        {header}
        <div className="py-3 text-center text-[13px]" style={{ color: TEXT_DIM }}>Couldn't load the lifecycle chain.</div>
      </>,
    );
  }
  if (stages === null) {
    return shell(
      <>
        {header}
        <div className="py-3 text-center text-[13px]" style={{ color: TEXT_DIM }}>Loading lifecycle…</div>
      </>,
    );
  }
  if (stages.length === 0) {
    return shell(
      <>
        {header}
        <div className="py-3 text-center text-[13px]" style={{ color: TEXT_DIM }}>No transaction chain identified for this document.</div>
      </>,
    );
  }

  const doneAt = (name: LifecycleStageName) => (stageByName(stages, name)?.extraction_status ?? 'not_received') === 'extracted';

  // The match node is presence-driven and reflects the real lifecycle: PO+GRN
  // in => 2-way matching has started (mid node); once the Invoice arrives, 3-way
  // takes over (end node) and the 2-way node is dropped. A green + glowing pill
  // means the match hasn't run yet; a real verdict swaps in Matched/Variance.
  const poDone = doneAt('purchase_order');
  const grnDone = doneAt('grn');
  const invDone = doneAt('invoice');
  const isUnmatched = matchType === 'UNMATCHED' || matchStatus === 'UNMATCHED';
  const verdictTone = matchStatus === 'VARIANCE' ? 'variance' : 'matched';
  const verdictWord = matchStatus === 'VARIANCE' ? 'Variance' : 'Matched';

  let midBadge: ReactNode = null;
  let endBadge: ReactNode = null;
  if (invDone) {
    // 3-way territory: the 2-way node no longer makes sense, so it's suppressed.
    if (matchType === '3_WAY') {
      endBadge = <MatchBadge label={`3-Way ${verdictWord}`} tone={verdictTone} />;
    } else if (isUnmatched) {
      endBadge = <MatchBadge label="Unmatched" tone="neutral" />;
    } else {
      endBadge = <MatchBadge label="3-Way Match" tone="matched" />;
    }
  } else if (poDone && grnDone) {
    // PO + GRN in, no Invoice yet: 2-way matching has started.
    if (matchType === '2_WAY') {
      midBadge = <MatchBadge label={`2-Way ${verdictWord}`} tone={verdictTone} />;
    } else if (isUnmatched) {
      midBadge = <MatchBadge label="Unmatched" tone="neutral" />;
    } else {
      midBadge = <MatchBadge label="2-Way Match" tone="matched" />;
    }
  } else {
    // Chain too early/incomplete for any matching to have started.
    endBadge = <MatchBadge label="No match run yet" tone="neutral" />;
  }

  const stageRow = (name: LifecycleStageName) => {
    const stage = stageByName(stages, name);
    const status: ExtractionState = stage?.extraction_status ?? 'not_received';
    const done = status === 'extracted';
    const isExpanded = expanded === name;
    const Icon = STAGE_ICON[name];

    let dotColor = MUTED_DOT;
    let statusColor = MUTED_STATUS;
    let statusLabel = 'NOT RECEIVED';
    if (status === 'extracted') {
      dotColor = GREEN; statusColor = GREEN; statusLabel = 'EXTRACTED';
    } else if (status === 'received_pending') {
      dotColor = AMBER; statusColor = AMBER; statusLabel = 'RECEIVED';
    } else if (status === 'extraction_failed') {
      dotColor = RED; statusColor = RED; statusLabel = 'FAILED';
    }
    // Per the latest design, only the Invoice row keeps a subtitle line — PO/
    // Ack/GRN rows are title + status only, which is also a bit more compact.
    const subtitle = name === 'invoice' ? (done ? (stage?.filename ?? 'Confirmed') : 'Not yet received') : null;

    const fields = detailFieldsFor(name, stage, {
      amount: invoiceAmount, currency: invoiceCurrency, docRef: invoiceDocRef, createdAt: invoiceCreatedAt,
    });
    const showVariance = name === 'invoice' && matchStatus === 'VARIANCE';

    return (
      <div
        key={name}
        role="button"
        tabIndex={0}
        onClick={() => toggle(name)}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(name); } }}
        aria-expanded={isExpanded}
        className="flow-step cursor-pointer rounded-[9px] px-2 py-1.5 transition-colors"
        style={{
          border: isExpanded ? `1px solid ${INDIGO_BORDER}` : done ? '1px solid rgba(255,255,255,.12)' : '1px dashed rgba(255,255,255,.16)',
          background: isExpanded ? INDIGO_BG : 'rgba(255,255,255,.03)',
        }}
      >
        <div className="flex items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-1.5">
            <div
              className="flex h-[22px] w-[22px] flex-none items-center justify-center rounded-[6px]"
              style={{ background: done ? INDIGO_ICON_BG : 'rgba(255,255,255,.05)' }}
            >
              <Icon color={done ? INDIGO_ICON_COLOR : MUTED_STATUS} />
            </div>
            <div className="min-w-0">
              <div className="text-[11.5px] font-semibold leading-tight" style={{ color: TEXT_BRIGHT }}>{STAGE_TITLE[name]}</div>
              {subtitle && <div className="truncate text-[10px] leading-tight" style={{ color: TEXT_DIM }}>{subtitle}</div>}
            </div>
          </div>
          <div className="flex flex-none items-center gap-1">
            <div className="flex items-center gap-1">
              <span className="h-1 w-1 rounded-full" style={{ background: dotColor }} />
              <span className="whitespace-nowrap text-[8.5px] font-bold tracking-[.03em]" style={{ color: statusColor }}>{statusLabel}</span>
            </div>
            <span
              className="inline-block text-[9px] transition-transform"
              style={{ color: TEXT_FAINTER, transform: isExpanded ? 'rotate(180deg)' : 'none' }}
            >
              &#9662;
            </span>
          </div>
        </div>
        {isExpanded && fields.length > 0 && (
          <div className="mt-1.5 flex flex-wrap justify-between gap-x-3 gap-y-1 border-t pt-1.5" style={{ borderColor: 'rgba(255,255,255,.08)' }}>
            {fields.map((f) => (
              <div key={f.label}>
                <div className="text-[8px] uppercase tracking-[.04em]" style={{ color: TEXT_FAINT }}>{f.label}</div>
                <div className="text-[10.5px] font-medium" style={{ color: '#e6e9f5' }}>{f.value}</div>
              </div>
            ))}
          </div>
        )}
        {isExpanded && showVariance && (
          <div
            className="mt-1 rounded-lg px-1.5 py-1 text-[10px] leading-snug"
            style={{ background: 'rgba(251,146,60,.1)', border: '1px solid rgba(251,146,60,.3)', color: '#fdba74' }}
          >
            Variance found
            {failedCheckCount != null ? ` — ${failedCheckCount} check${failedCheckCount === 1 ? '' : 's'} failed` : ''}.
          </div>
        )}
      </div>
    );
  };

  return shell(
    <>
      {header}
      <div className="flex flex-col gap-0.5">
        {stageRow('purchase_order')}
        <Connector active={doneAt('purchase_order')} />
        {stageRow('acknowledgement')}
        <Connector active={doneAt('acknowledgement')} />
        {stageRow('grn')}
        {midBadge && <div className="my-0.5">{midBadge}</div>}
        <Connector active={doneAt('grn')} />
        {stageRow('invoice')}
        {endBadge && (
          <>
            <Connector active={doneAt('invoice')} />
            <div className="mb-0.5">{endBadge}</div>
          </>
        )}
      </div>
      <div className="mt-2 border-t pt-1.5 text-[8px] leading-snug" style={{ borderColor: 'rgba(255,255,255,.1)', color: TEXT_FAINTER }}>
        Live PO → Acknowledgement → GRN → Invoice chain from Supabase.
      </div>
    </>,
  );
}
