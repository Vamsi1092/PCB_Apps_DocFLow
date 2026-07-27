import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  AlertTriangle, Check, Copy, File, FileSpreadsheet, FileText, Image as ImageIcon, Loader2, Search,
} from 'lucide-react';
import { DataTable, type DataTableColumn } from '@/components/DataTable';
import { RED } from '@/lib/theme';
import { type InboxAttachment, type InboxMessage } from '@/data';
import { supabase } from '@/lib/supabase';

const MONTH_ABBR = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "Jul 14, 4:51 PM" for the current year, "Dec 30, 2025, 8:17 AM" otherwise.
 * Falls back to a dash for missing/invalid dates rather than rendering "Invalid Date". */
function fmtReceived(iso: string): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '—';
  const time = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
  const base = `${MONTH_ABBR[d.getMonth()]} ${d.getDate()}`;
  return d.getFullYear() === new Date().getFullYear() ? `${base}, ${time}` : `${base}, ${d.getFullYear()}, ${time}`;
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

// Extends InboxMessage with a flag for whether AI extraction ran at all on this
// email (ai_understanding present), vs. simply having empty fields — so the UI
// can distinguish "not yet extracted" from "extracted but this field is blank".
interface InboxRow extends InboxMessage {
  extracted: boolean;
}

function iconForAttachment(a: InboxAttachment) {
  const type = (a.file_type ?? '').toLowerCase();
  const name = a.filename.toLowerCase();
  if (type.includes('sheet') || type.includes('excel') || /\.(xlsx?|csv)$/.test(name)) return FileSpreadsheet;
  if (type.startsWith('image/') || /\.(png|jpe?g|gif|bmp|webp)$/.test(name)) return ImageIcon;
  if (type.includes('pdf') || name.endsWith('.pdf')) return FileText;
  return File;
}

// A real, clickable attachment: requests a short-lived signed URL from Supabase
// Storage on click and opens it in a new tab. Falls back to a disabled, plainly
// labeled chip when the attachment has no Storage location on record, or shows
// an inline error if the signed URL request itself fails (e.g. a broken path) —
// never a misleading "always unavailable" indicator now that Storage is wired up.
function AttachmentChip({ attachment }: { attachment: InboxAttachment }) {
  const [state, setState] = useState<'idle' | 'loading' | 'error'>('idle');
  const hasFile = !!(attachment.storage_bucket && attachment.storage_path);
  const Icon = state === 'loading' ? Loader2 : iconForAttachment(attachment);

  const handleClick = async () => {
    if (!hasFile || state === 'loading') return;
    setState('loading');
    // Open the tab synchronously, inside the click gesture, then point it at
    // the signed URL once it resolves — opening it only after the `await`
    // would fall outside the user-gesture window most browsers require, and
    // get silently blocked as a popup.
    const tab = window.open('', '_blank', 'noopener,noreferrer');
    const { data, error } = await supabase.storage
      .from(attachment.storage_bucket!)
      .createSignedUrl(attachment.storage_path!, 600);
    if (error || !data?.signedUrl) {
      tab?.close();
      setState('error');
      setTimeout(() => setState('idle'), 2500);
      return;
    }
    if (tab) tab.location.href = data.signedUrl;
    else window.open(data.signedUrl, '_blank', 'noopener,noreferrer');
    setState('idle');
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={!hasFile}
      title={
        !hasFile
          ? `${attachment.filename} — no file on record`
          : state === 'error'
            ? "Couldn't open this file — try again"
            : `Open ${attachment.filename}`
      }
      className="inline-flex max-w-[190px] items-center gap-1.5 rounded-md border border-line bg-surface px-2 py-1 text-xs text-text2 disabled:cursor-default disabled:opacity-60 enabled:hover:border-navy enabled:hover:text-navy enabled:hover:bg-tint"
    >
      <Icon size={12} className={state === 'loading' ? 'flex-none animate-spin text-muted-foreground' : 'flex-none text-muted-foreground'} />
      <span className="truncate">{attachment.filename}</span>
      {state === 'error' && <AlertTriangle size={11} className="flex-none" style={{ color: RED }} />}
    </button>
  );
}

export default function InboxPage() {
  const [search, setSearch] = useState('');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [hover, setHover] = useState<HoverState | null>(null);
  const [addressHover, setAddressHover] = useState<AddressHoverState | null>(null);
  const [addressCopied, setAddressCopied] = useState(false);
  const [messages, setMessages] = useState<InboxRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);
  const hideTimer = useRef<ReturnType<typeof setTimeout>>();
  const addressHideTimer = useRef<ReturnType<typeof setTimeout>>();
  const copiedTimer = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    // Read directly from Supabase (read-only). Supplier/Vendor and the summary are
    // pulled from the AI-extraction blob `ai_understanding`; attachments come from
    // the embedded `email_attachments` rows via their FK to email_messages.
    supabase
      .from('email_messages')
      .select('id, from_name, from_email, subject, received_at, ai_understanding, email_attachments(id, filename, file_type, storage_bucket, storage_path)')
      .order('received_at', { ascending: false })
      .then(({ data, error: qErr }) => {
        if (cancelled) return;
        if (qErr) {
          setError(qErr.message);
          setLoading(false);
          return;
        }
        // Fields can be null/missing — fall back to empty strings so the
        // table/tooltip rendering doesn't have to null-check.
        setMessages((data ?? []).map((r): InboxRow => {
          const ai = (r.ai_understanding ?? {}) as Record<string, any>;
          const header = (ai.header ?? {}) as Record<string, any>;
          return {
            id: r.id,
            name: r.from_name ?? '',
            from: r.from_email ?? '',
            subject: r.subject ?? '',
            when: r.received_at ?? '',
            category: ai.document_type ?? null,
            tag: '',        // not rendered on this page; required by the type
            tone: 'brand',  // not rendered on this page; required by the type
            unread: false,
            extracted: r.ai_understanding != null,
            attachments: (r.email_attachments ?? []).map((a: {
              id: string; filename: string; file_type: string | null; storage_bucket: string | null; storage_path: string | null;
            }) => ({
              id: a.id,
              filename: a.filename,
              file_type: a.file_type,
              storage_bucket: a.storage_bucket,
              storage_path: a.storage_path,
            })),
            summary: ai.ai_intent ?? '',
            supplier: {
              name: header.supplier_name ?? '',
              address: header.supplier_address ?? '',
            },
            vendor: {
              name: header.ship_to_name ?? '',
              address: header.ship_to_address ?? '',
            },
          };
        }));
        setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [reloadToken]);

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

  const openAttachmentsHover = (id: string, rect: DOMRect) => {
    cancelHide();
    const spaceRight = window.innerWidth - rect.right;
    // Keyed by the message's own id — multiple emails can share the same
    // attachment filename, and keying on that made every row's tooltip
    // resolve to whichever message happened to match first.
    if (spaceRight >= TOOLTIP_WIDTH + TOOLTIP_MARGIN) {
      setHover({ key: id, placement: 'right', top: rect.top, left: rect.right + 10 });
    } else {
      const left = Math.max(TOOLTIP_MARGIN, Math.min(rect.left, window.innerWidth - TOOLTIP_WIDTH - TOOLTIP_MARGIN));
      setHover({ key: id, placement: 'above', bottom: window.innerHeight - rect.top + 10, left });
    }
  };

  const copyAddress = (text: string) => {
    navigator.clipboard.writeText(text).then(() => {
      setAddressCopied(true);
      clearTimeout(copiedTimer.current);
      copiedTimer.current = setTimeout(() => setAddressCopied(false), 1500);
    }).catch(() => {});
  };

  const columns: DataTableColumn<InboxRow>[] = [
    {
      key: 'when',
      label: 'Received',
      sortable: true,
      cell: (m) => <span className="whitespace-nowrap text-[13px] tabular-nums text-muted-foreground">{fmtReceived(m.when)}</span>,
    },
    {
      key: 'category',
      label: 'Category',
      cell: (m) => (
        m.category
          ? <span className="whitespace-nowrap text-[13px] text-text2">{m.category}</span>
          : m.extracted
            ? <span className="text-[13px] text-faint">—</span>
            : <span className="whitespace-nowrap text-[13px] italic text-faint">Not yet extracted</span>
      ),
    },
    {
      key: 'supplier',
      label: 'Supplier',
      cell: (m) => (
        <div className="max-w-[240px]">
          <div className={m.unread ? 'text-[13.5px] font-bold leading-snug' : 'text-[13.5px] font-medium leading-snug'}>
            {m.supplier.name || (m.extracted ? '—' : <span className="italic text-faint">Not yet extracted</span>)}
          </div>
          <button
            type="button"
            className="block max-w-full truncate border-none bg-transparent p-0 text-left text-[12px] text-muted-foreground underline decoration-dotted decoration-faint underline-offset-2 hover:text-text2"
            onMouseEnter={(e) => openAddressHover(e.currentTarget.getBoundingClientRect(), m.supplier.address)}
            onMouseLeave={scheduleAddressHide}
            onFocus={(e) => openAddressHover(e.currentTarget.getBoundingClientRect(), m.supplier.address)}
            onBlur={scheduleAddressHide}
            onKeyDown={(e) => { if (e.key === 'Escape') setAddressHover(null); }}
            aria-label={m.supplier.address ? `Supplier address: ${m.supplier.address}` : 'No supplier address'}
          >
            {m.supplier.address || '—'}
          </button>
        </div>
      ),
    },
    {
      key: 'vendor',
      label: 'Vendor',
      cell: (m) => (
        <div className="max-w-[240px]">
          <div className="text-[13.5px] font-medium leading-snug">
            {m.vendor.name || (m.extracted ? '—' : <span className="italic text-faint">Not yet extracted</span>)}
          </div>
          <button
            type="button"
            className="block max-w-full truncate border-none bg-transparent p-0 text-left text-[12px] text-muted-foreground underline decoration-dotted decoration-faint underline-offset-2 hover:text-text2"
            onMouseEnter={(e) => openAddressHover(e.currentTarget.getBoundingClientRect(), m.vendor.address)}
            onMouseLeave={scheduleAddressHide}
            onFocus={(e) => openAddressHover(e.currentTarget.getBoundingClientRect(), m.vendor.address)}
            onBlur={scheduleAddressHide}
            onKeyDown={(e) => { if (e.key === 'Escape') setAddressHover(null); }}
            aria-label={m.vendor.address ? `Vendor address: ${m.vendor.address}` : 'No vendor address'}
          >
            {m.vendor.address || '—'}
          </button>
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
        // A plain div, not a button: each attachment below is itself a real,
        // clickable button (opens the file), and buttons can't nest. Keyboard
        // focus still reaches this via the chips themselves (focus bubbles),
        // so the Summary tooltip still opens on focus; Escape closes it.
        <div
          className="inline-block max-w-[220px] text-left"
          onMouseEnter={(e) => openAttachmentsHover(m.id, e.currentTarget.getBoundingClientRect())}
          onMouseLeave={scheduleHide}
          onFocus={(e) => openAttachmentsHover(m.id, e.currentTarget.getBoundingClientRect())}
          onBlur={scheduleHide}
          onKeyDown={(e) => { if (e.key === 'Escape') setHover(null); }}
        >
          {m.attachments.length === 0 ? (
            <span className="text-[13px] text-faint">—</span>
          ) : (
            <div className="flex flex-col items-start gap-1.5">
              {m.attachments.map((a) => (
                <AttachmentChip key={a.id} attachment={a} />
              ))}
            </div>
          )}
        </div>
      ),
    },
  ];

  let filtered = messages.slice();
  if (search.trim()) {
    const q = search.trim().toLowerCase();
    filtered = filtered.filter((m) => [
      m.supplier.name, m.supplier.address, m.vendor.name, m.vendor.address,
      m.name, m.from, m.subject, m.category ?? '',
      ...m.attachments.map((a) => a.filename),
    ].some((v) => v.toLowerCase().includes(q)));
  }
  filtered = filtered.sort((a, b) => {
    const dir = sortDir === 'asc' ? 1 : -1;
    const at = new Date(a.when).getTime();
    const bt = new Date(b.when).getTime();
    const aInvalid = isNaN(at);
    const bInvalid = isNaN(bt);
    // Invalid/missing dates always sort last, regardless of direction, so a
    // NaN comparison never produces visually inconsistent ordering.
    if (aInvalid && bInvalid) return 0;
    if (aInvalid) return 1;
    if (bInvalid) return -1;
    return (at - bt) * dir;
  });
  const rows = filtered.map((m, i) => ({ ...m, _key: `${m.id}-${i}` }));

  const hovered = hover ? messages.find((m) => m.id === hover.key) : null;

  return (
    <div className="pcb-view">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="mb-[3px] text-[23px] font-bold uppercase tracking-[.01em]">AP Inbox</h1>
          <p className="text-[13.5px] text-muted-foreground">
            Emails from the Accounts Payable folder · auto-captured from email &amp; EDI
          </p>
        </div>
        <div className="relative">
          <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search supplier, vendor, sender, subject…"
            aria-label="Search supplier, vendor, sender, or subject"
            className="h-[34px] w-[260px] rounded-lg border border-line bg-surface pl-8 pr-3 text-[12.5px] font-medium text-text2 outline-none placeholder:text-muted-foreground focus:border-navy"
          />
        </div>
      </div>
      {loading ? (
        <div className="rounded-xl border border-border bg-surface p-10 text-center text-[13.5px] text-muted-foreground">
          Loading inbox…
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
      ) : rows.length === 0 ? (
        <div className="rounded-xl border border-border bg-surface p-10 text-center text-[13.5px] text-muted-foreground">
          {search ? `No messages match "${search}".` : 'No messages in the inbox.'}
        </div>
      ) : (
        <DataTable
          columns={columns}
          rows={rows}
          sort={{ col: 'when', dir: sortDir }}
          onSort={() => setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))}
          minWidth={1040}
        />
      )}
      {hovered && createPortal(
        // Portaled to document.body: this page's root .pcb-view div has a transform-based
        // fade-in animation, and a transform-animating ancestor becomes the containing block
        // for `position: fixed` descendants — which silently pinned this tooltip thousands of
        // pixels below the viewport on long (real-data) tables instead of next to the hovered row.
        <div
          role="tooltip"
          className="pcb-view fixed z-[200] min-w-[280px] max-w-[380px] rounded-xl bg-[#111a33] p-[13px_15px] shadow-[0_12px_36px_rgba(0,0,0,.32)]"
          style={
            hover!.placement === 'right'
              ? { top: hover!.top, left: hover!.left }
              : { bottom: hover!.bottom, left: hover!.left }
          }
          onMouseEnter={cancelHide}
          onMouseLeave={scheduleHide}
        >
          <p className="whitespace-normal break-words text-[13px] leading-[1.55] text-[#dbe2f0]">
            {hovered.summary || 'No AI summary available for this document yet.'}
          </p>
        </div>,
        document.body,
      )}
      {addressHover && createPortal(
        // Same containing-block-hijack reasoning as the Summary tooltip above — must
        // portal to document.body rather than rendering inline.
        <div
          role="tooltip"
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
