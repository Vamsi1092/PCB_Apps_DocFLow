import { Mail } from 'lucide-react';
import { StatusPill } from '@/components/StatusPill';
import { RED } from '@/lib/theme';
import { inbox, type InboxTone } from '@/data';

const TAG_TONE: Record<InboxTone, { color: string; border: string; background: string }> = {
  attn: { color: RED, border: '#f3c0c0', background: 'var(--redsoft)' },
  ok: { color: 'var(--text3)', border: 'var(--line)', background: 'var(--surface)' },
  brand: { color: 'var(--navy)', border: 'var(--border)', background: 'var(--tint)' },
};

export default function InboxPage() {
  return (
    <div className="pcb-view">
      <div className="mb-4">
        <h1 className="mb-[3px] text-[23px] font-bold tracking-[-.02em]">AP Inbox</h1>
        <p className="text-[13.5px] text-muted-foreground">
          Emails from the Accounts Payable folder · auto-captured from email &amp; EDI
        </p>
      </div>
      <div className="overflow-hidden rounded-xl border border-border bg-surface shadow-[0_1px_2px_rgba(16,24,40,.04)]">
        {inbox.map((m, i) => {
          const tone = TAG_TONE[m.tone];
          return (
            <div
              key={i}
              className="pcb-row flex cursor-pointer items-center gap-3.5 border-b border-borderf px-[18px] py-3.5"
            >
              <span
                className="h-2 w-2 flex-none rounded-full"
                style={{ background: m.unread ? 'var(--navy)' : 'transparent' }}
              />
              <div className="flex h-9 w-9 flex-none items-center justify-center rounded-lg bg-tint text-navy">
                <Mail size={17} />
              </div>
              <div className="min-w-0 flex-1">
                <div className={m.unread ? 'text-[13.5px] font-bold' : 'text-[13.5px] font-medium'}>{m.from}</div>
                <div className="overflow-hidden text-ellipsis whitespace-nowrap text-[12.5px] text-muted-foreground">
                  {m.subject}
                </div>
              </div>
              <StatusPill label={m.tag} dot={false} {...tone} className="flex-none" />
              <span className="w-[66px] flex-none text-right text-xs tabular-nums text-faint">{m.when}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
