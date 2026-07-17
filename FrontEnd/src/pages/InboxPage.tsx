import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, ChevronDown, Copy, Filter } from 'lucide-react';
import { DataTable, type DataTableColumn } from '@/components/DataTable';
import { StatusPill } from '@/components/StatusPill';
import { RED } from '@/lib/theme';
import { type InboxMessage, type InboxTone } from '@/data';
import { getInboxMessages, getAttachmentFileUrl } from '../../api/inboxApi';

const TAG_TONE: Record<InboxTone, { color: string; border: string; background: string }> = {
  attn: { color: RED, border: '#f3c0c0', background: 'var(--redsoft)' },
  ok: { color: 'var(--text3)', border: 'var(--line)', background: 'var(--surface)' },
  brand: { color: 'var(--navy)', border: 'var(--border)', background: 'var(--tint)' },
};

const MONTH_ABBR = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const STAGE_FILTERS: [string, string][] = [
  ['all', 'All'],
  ['exception', 'Exception'],
  ['captured', 'Captured'],
  ['auto', 'Auto'],
  ['matched', 'Matched'],
  ['approved', 'Approved'],
];

type ReceivedFilter = 'all' | 'today' | 'week' | 'month' | 'custom';

const RECEIVED_FILTERS: [ReceivedFilter, string][] = [
  ['all', 'All Time'],
  ['today', 'Today'],
  ['week', 'This Week'],
  ['month', 'This Month'],
  ['custom', 'Custom Date'],
];

/** "Jul 14, 4:51 PM" for the current year, "Dec 30, 2025, 8:17 AM" otherwise. */
function fmtReceived(iso: string): string {
  const d = new Date(iso);
  const time = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
  const base = `${MONTH_ABBR[d.getMonth()]} ${d.getDate()}`;
  return d.getFullYear() === new Date().getFullYear() ? `${base}, ${time}` : `${base}, ${d.getFullYear()}, ${time}`;
}

function inReceivedRange(iso: string, filter: ReceivedFilter, customDate: string): boolean {
  if (filter === 'all') return true;
  const d = new Date(iso);
  if (filter === 'custom') {
    if (!customDate) return true;
    return d.toDateString() === new Date(customDate).toDateString();
  }
  const now = new Date();
  if (filter === 'today') return d.toDateString() === now.toDateString();
  if (filter === 'week') {
    const weekAgo = new Date(now);
    weekAgo.setDate(now.getDate() - 7);
    return d >= weekAgo && d <= now;
  }
  const monthAgo = new Date(now);
  monthAgo.setMonth(now.getMonth() - 1);
  return d >= monthAgo && d <= now;
}

const TOOLTIP_WIDTH = 400;
const TOOLTIP_MARGIN = 12;
const TOOLTIP_HIDE_DELAY = 150;

type HoverState =
  | { key: string; placement: 'right'; top: number; left: number }
  | { key: string; placement: 'above'; bottom: number; left: number };

type AddressHoverState =
  | { text: string; placement: 'right'; top: number; left: number }
  | { text: string; placement: 'above'; bottom: number; left: number };

export default function InboxPage() {
  // Pipeline-stage filter buttons: null means no button is selected (default state).
  // When null, the table shows every row, same as if "All" were active but with no button highlighted.
  const [stageFilter, setStageFilter] = useState<string | null>(null);
  const [receivedFilter, setReceivedFilter] = useState<ReceivedFilter>('all');
  const [receivedOpen, setReceivedOpen] = useState(false);
  const [customDate, setCustomDate] = useState('');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [hover, setHover] = useState<HoverState | null>(null);
  const [addressHover, setAddressHover] = useState<AddressHoverState | null>(null);
  const [addressCopied, setAddressCopied] = useState(false);
  const [messages, setMessages] = useState<InboxMessage[]>([]);
  const hideTimer = useRef<ReturnType<typeof setTimeout>>();
  const addressHideTimer = useRef<ReturnType<typeof setTimeout>>();
  const copiedTimer = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    getInboxMessages()
      .then((res) => {
        if (!res.messages.length) return;
        // API fields can be null (e.g. an email with no sender name on file) — fall back
        // to empty strings so the table/tooltip rendering doesn't have to null-check.
        setMessages(res.messages.map((m) => ({
          id: m.id,
          name: m.name ?? '',
          from: m.from ?? '',
          subject: m.subject ?? '',
          when: m.when ?? '',
          tag: m.tag,
          tone: m.tone,
          unread: m.unread,
          attachments: m.attachments,
          summary: m.summary,
          supplier: m.supplier ?? { name: '', address: '' },
          vendor: m.vendor ?? { name: '', address: '' },
        })));
      })
      .catch(() => {});
  }, []);

  const cancelHide = () => clearTimeout(hideTimer.current);
  const scheduleHide = () => {
    clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => setHover(null), TOOLTIP_HIDE_DELAY);
  };

  const cancelAddressHide = () => clearTimeout(addressHideTimer.current);
  const scheduleAddressHide = () => {
    clearTimeout(addressHideTimer.current);
    addressHideTimer.current = setTimeout(() => setAddressHover(null), TOOLTIP_HIDE_DELAY);
  };

  const openAddressHover = (rect: DOMRect, text: string) => {
    if (!text) return;
    cancelAddressHide();
    const spaceRight = window.innerWidth - rect.right;
    if (spaceRight >= TOOLTIP_WIDTH + TOOLTIP_MARGIN) {
      setAddressHover({ text, placement: 'right', top: rect.top, left: rect.right + 10 });
    } else {
      const left = Math.max(TOOLTIP_MARGIN, Math.min(rect.left, window.innerWidth - TOOLTIP_WIDTH - TOOLTIP_MARGIN));
      setAddressHover({ text, placement: 'above', bottom: window.innerHeight - rect.top + 10, left });
    }
  };

  const copyAddress = (text: string) => {
    navigator.clipboard.writeText(text).then(() => {
      setAddressCopied(true);
      clearTimeout(copiedTimer.current);
      copiedTimer.current = setTimeout(() => setAddressCopied(false), 1500);
    }).catch(() => {});
  };

  const columns: DataTableColumn<InboxMessage>[] = [
    {
      key: 'when',
      label: 'Received',
      sortable: true,
      cell: (m) => <span className="whitespace-nowrap text-[13px] tabular-nums text-muted-foreground">{fmtReceived(m.when)}</span>,
    },
    {
      key: 'supplier',
      label: 'Supplier',
      cell: (m) => (
        <div className="max-w-[240px]">
          <div className={m.unread ? 'text-[13.5px] font-bold leading-snug' : 'text-[13.5px] font-medium leading-snug'}>{m.supplier.name || '—'}</div>
          <div
            className="truncate text-[12px] text-muted-foreground underline decoration-dotted decoration-faint underline-offset-2 hover:text-text2"
            onMouseEnter={(e) => openAddressHover(e.currentTarget.getBoundingClientRect(), m.supplier.address)}
            onMouseLeave={scheduleAddressHide}
          >
            {m.supplier.address || '—'}
          </div>
        </div>
      ),
    },
    {
      key: 'vendor',
      label: 'Vendor',
      cell: (m) => (
        <div className="max-w-[240px]">
          <div className="text-[13.5px] font-medium leading-snug">{m.vendor.name || '—'}</div>
          <div
            className="truncate text-[12px] text-muted-foreground underline decoration-dotted decoration-faint underline-offset-2 hover:text-text2"
            onMouseEnter={(e) => openAddressHover(e.currentTarget.getBoundingClientRect(), m.vendor.address)}
            onMouseLeave={scheduleAddressHide}
          >
            {m.vendor.address || '—'}
          </div>
        </div>
      ),
    },
    {
      key: 'attachments',
      label: 'Attachments',
      cell: (m) => (
        // Shrink-wrapped to its own content (not the full table cell) so the hover
        // target — and the rect used to position the tooltip — matches what's
        // actually visible on screen, instead of stretching to the column width.
        <div
          className="inline-block max-w-[220px]"
          onMouseEnter={(e) => {
            // Cancel any pending hide from a previous row so the tooltip doesn't
            // flicker when the mouse moves quickly between adjacent rows.
            cancelHide();
            const rect = e.currentTarget.getBoundingClientRect();
            const spaceRight = window.innerWidth - rect.right;
            // Keyed by the message's own id — multiple emails can share the same
            // attachment filename, and keying on that made every row's tooltip
            // resolve to whichever message happened to match first.
            if (spaceRight >= TOOLTIP_WIDTH + TOOLTIP_MARGIN) {
              // Enough room to the right of the cell — default placement.
              setHover({ key: m.id, placement: 'right', top: rect.top, left: rect.right + 10 });
            } else {
              // Not enough horizontal room (near the right edge of the screen) —
              // flip above the cell instead, clamped so it never runs off the
              // left/right edges of the viewport.
              const left = Math.max(TOOLTIP_MARGIN, Math.min(rect.left, window.innerWidth - TOOLTIP_WIDTH - TOOLTIP_MARGIN));
              setHover({ key: m.id, placement: 'above', bottom: window.innerHeight - rect.top + 10, left });
            }
          }}
          onMouseLeave={scheduleHide}
        >
          {m.attachments.length === 0 ? (
            <span className="text-[13px] text-faint">—</span>
          ) : (
            <div className="flex flex-col items-start gap-1.5">
              {m.attachments.map((a) => (
                // Opens the backend's file-streaming endpoint in a new tab so the
                // browser's own PDF viewer handles the preview.
                <a
                  key={a.id}
                  href={getAttachmentFileUrl(a.id)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex max-w-[190px] items-center gap-1.5 rounded-md border border-line bg-surface px-2 py-1 text-xs text-text2 hover:border-navy hover:text-navy"
                >
                  <span className="h-1.5 w-1.5 flex-none rounded-full" style={{ background: RED }} />
                  <span className="truncate">{a.filename}</span>
                </a>
              ))}
            </div>
          )}
        </div>
      ),
    },
    {
      key: 'tag',
      label: 'Pipeline Stage',
      cell: (m) => {
        const tone = TAG_TONE[m.tone];
        return <StatusPill label={m.tag} dot={false} {...tone} />;
      },
    },
  ];

  // Apply the stage filter: no active filter (null) or the explicit "All" option both show every row;
  // otherwise only keep rows whose pipeline-stage tag matches the selected filter id.
  let filtered = messages.filter((m) => !stageFilter || stageFilter === 'all' || m.tag.toLowerCase() === stageFilter);
  filtered = filtered.filter((m) => inReceivedRange(m.when, receivedFilter, customDate));
  filtered = filtered.sort((a, b) => {
    const dir = sortDir === 'asc' ? 1 : -1;
    return (new Date(a.when).getTime() - new Date(b.when).getTime()) * dir;
  });
  const rows = filtered.map((m, i) => ({ ...m, _key: `${m.from}-${i}` }));

  const hovered = hover ? messages.find((m) => m.id === hover.key) : null;
  const receivedLabel = RECEIVED_FILTERS.find(([id]) => id === receivedFilter)?.[1] ?? 'All Time';

  return (
    <div className="pcb-view">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="mb-[3px] text-[23px] font-bold tracking-[-.02em]">AP Inbox</h1>
          <p className="text-[13.5px] text-muted-foreground">
            Emails from the Accounts Payable folder · auto-captured from email &amp; EDI
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex flex-wrap gap-[7px]">
            {STAGE_FILTERS.map(([id, label]) => {
              const on = stageFilter === id;
              return (
                <button
                  key={id}
                  type="button"
                  // Toggle behavior: clicking the already-active button deselects it (back to null/no filter);
                  // clicking any other button selects it and deselects whichever was previously active.
                  onClick={() => setStageFilter((prev) => (prev === id ? null : id))}
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
          <div className="relative">
            <button
              type="button"
              onClick={() => setReceivedOpen((o) => !o)}
              className="pcb-btn flex h-[34px] items-center gap-2 rounded-lg border border-line bg-surface px-3.5 text-[12.5px] font-semibold text-text2"
            >
              <Filter size={14} />{receivedLabel}
              <span className="ml-0.5 flex opacity-60 transition-transform" style={{ transform: receivedOpen ? 'rotate(180deg)' : 'none' }}>
                <ChevronDown size={13} />
              </span>
            </button>
            {receivedOpen && (
              <div className="pcb-view absolute right-0 top-11 z-30 min-w-[170px] rounded-[10px] border border-border bg-surface p-[5px] shadow-[0_10px_30px_rgba(16,24,40,.14)]">
                {RECEIVED_FILTERS.map(([id, label]) => {
                  const on = receivedFilter === id;
                  return (
                    <button
                      key={id}
                      type="button"
                      onClick={() => { setReceivedFilter(id); if (id !== 'custom') setReceivedOpen(false); }}
                      className="flex h-9 w-full items-center justify-between gap-2.5 rounded-[7px] border-none px-[11px] text-[13px]"
                      style={{ background: on ? 'var(--tint)' : 'transparent', color: on ? 'var(--navy)' : 'var(--text2)', fontWeight: on ? 700 : 500 }}
                    >
                      <span>{label}</span>
                      <span className="flex text-navy" style={{ opacity: on ? 1 : 0 }}><Check size={14} /></span>
                    </button>
                  );
                })}
                {receivedFilter === 'custom' && (
                  <div className="flex flex-col gap-2 px-1.5 pb-1 pt-2">
                    <label className="text-[11px] font-bold uppercase tracking-[.04em] text-faint">
                      Date
                      <input
                        type="date"
                        value={customDate}
                        onChange={(e) => setCustomDate(e.target.value)}
                        className="mt-1 h-[34px] w-full rounded-lg border border-line bg-surface px-2.5 font-sans text-[13px] text-foreground"
                      />
                    </label>
                    <button
                      type="button"
                      onClick={() => setReceivedOpen(false)}
                      className="mt-0.5 h-[34px] rounded-lg border-none bg-navy text-[12.5px] font-semibold text-white"
                    >
                      Apply date
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
      <DataTable
        columns={columns}
        rows={rows}
        sort={{ col: 'when', dir: sortDir }}
        onSort={() => setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))}
        minWidth={1040}
      />
      {hovered && createPortal(
        // Portaled to document.body: this page's root .pcb-view div has a transform-based
        // fade-in animation, and a transform-animating ancestor becomes the containing block
        // for `position: fixed` descendants — which silently pinned this tooltip thousands of
        // pixels below the viewport on long (real-data) tables instead of next to the hovered row.
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
          <div className="mb-1.5 text-[10.5px] font-bold uppercase tracking-[.06em] text-[#8ca0d6]">Summary</div>
          <div className="mb-1.5 text-[13.5px] font-bold leading-snug">{hovered.summary.headline}</div>
          <p className="whitespace-normal break-words text-[12.5px] leading-[1.5] text-[#c3cce3]">{hovered.summary.body}</p>
        </div>,
        document.body,
      )}
      {addressHover && createPortal(
        // Same containing-block-hijack reasoning as the Summary tooltip above — must
        // portal to document.body rather than rendering inline.
        <div
          className="pcb-view fixed z-[200] min-w-[260px] max-w-[380px] rounded-xl bg-[#111a33] p-[14px_16px] text-white shadow-[0_12px_36px_rgba(0,0,0,.32)]"
          style={
            addressHover.placement === 'right'
              ? { top: addressHover.top, left: addressHover.left }
              : { bottom: addressHover.bottom, left: addressHover.left }
          }
          onMouseEnter={cancelAddressHide}
          onMouseLeave={scheduleAddressHide}
        >
          <div className="mb-1.5 flex items-center justify-between gap-3">
            <div className="text-[10.5px] font-bold uppercase tracking-[.06em] text-[#8ca0d6]">Address</div>
            <button
              type="button"
              className="flex items-center gap-1 rounded-md border border-white/15 px-2 py-1 text-[11px] font-medium text-[#c3cce3] hover:bg-white/10"
              onClick={() => copyAddress(addressHover.text)}
            >
              {addressCopied ? <Check size={12} /> : <Copy size={12} />}
              {addressCopied ? 'Copied!' : 'Copy'}
            </button>
          </div>
          <p className="whitespace-normal break-words text-[12.5px] leading-[1.5] text-[#c3cce3]">{addressHover.text}</p>
        </div>,
        document.body,
      )}
    </div>
  );
}
