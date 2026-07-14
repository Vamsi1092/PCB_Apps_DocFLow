import { useEffect, useRef, useState } from 'react';
import { Check, X } from 'lucide-react';
import { RED, GREEN } from '@/lib/theme';
import { approvals } from '@/data';

type Verdict = 'approved' | 'rejected';

export default function ApprovalsPage() {
  const [decisions, setDecisions] = useState<Record<string, Verdict>>({});
  const [toast, setToast] = useState<string | null>(null);
  const tt = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => () => clearTimeout(tt.current), []);

  const decide = (id: string, verb: Verdict) => {
    setDecisions((prev) => ({ ...prev, [id]: verb }));
    setToast(verb === 'approved' ? 'Invoice approved — queued for posting' : 'Invoice returned to the exceptions queue');
    clearTimeout(tt.current);
    tt.current = setTimeout(() => setToast(null), 2600);
  };

  return (
    <div className="pcb-view">
      <div className="mb-4">
        <h1 className="mb-[3px] text-[23px] font-bold tracking-[-.02em]">Approvals</h1>
        <p className="text-[13.5px] text-muted-foreground">Awaiting your sign-off · matched &amp; ready to post</p>
      </div>
      <div className="grid grid-cols-[repeat(auto-fill,minmax(340px,1fr))] gap-3.5">
        {approvals.map((a) => {
          const verdict = decisions[a.id];
          const approvedVerdict = verdict === 'approved';
          return (
            <div
              key={a.id}
              className="rounded-xl bg-surface shadow-[0_1px_2px_rgba(16,24,40,.04)] transition-[border-color]"
              style={{ border: `1px solid ${verdict ? (approvedVerdict ? '#bbf0c9' : '#f3c0c0') : 'var(--border)'}`, padding: '17px 18px' }}
            >
              <div className="mb-3 flex items-start justify-between">
                <div>
                  <div className="text-[15px] font-bold">{a.vendor}</div>
                  <div className="mt-0.5 text-xs tabular-nums text-faint">{a.inv} · {a.submitted}</div>
                </div>
                <div className="text-[19px] font-extrabold tracking-[-.02em] tabular-nums">{a.amount}</div>
              </div>
              <div className="mb-3.5 flex flex-wrap gap-2">
                <span
                  className="inline-flex items-center gap-1 rounded-full border px-2.5 py-[3px] text-[11.5px] font-semibold"
                  style={{ color: GREEN, background: 'var(--greensoft)', borderColor: '#bbf0c9' }}
                >
                  3-way matched
                </span>
                <span className="rounded-full border border-line bg-surface px-2.5 py-[3px] text-[11.5px] font-semibold text-text3">
                  {a.po}
                </span>
              </div>
              {verdict ? (
                <div
                  className="flex h-[38px] items-center justify-center gap-[7px] rounded-lg border text-[13px] font-bold"
                  style={{
                    color: approvedVerdict ? GREEN : RED,
                    background: approvedVerdict ? 'var(--greensoft)' : 'var(--redsoft)',
                    borderColor: approvedVerdict ? '#bbf0c9' : '#f3c0c0',
                  }}
                >
                  {approvedVerdict ? '✓ Approved & posting' : '↩ Returned to exceptions'}
                </div>
              ) : (
                <div className="flex gap-[9px]">
                  <button
                    type="button"
                    onClick={() => decide(a.id, 'rejected')}
                    className="pcb-btn flex h-[38px] flex-1 items-center justify-center gap-1.5 rounded-lg border text-[13px] font-semibold"
                    style={{ borderColor: '#f3d0d0', background: 'var(--surface)', color: RED }}
                  >
                    <X size={15} />Return
                  </button>
                  <button
                    type="button"
                    onClick={() => decide(a.id, 'approved')}
                    className="pcb-btn flex h-[38px] flex-[1.4] items-center justify-center gap-1.5 rounded-lg border-none bg-navy text-[13px] font-semibold text-white shadow-[0_1px_2px_rgba(30,58,138,.3)]"
                  >
                    <Check size={15} color="#fff" />Approve
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>
      {toast && (
        <div className="pcb-view fixed bottom-6 left-1/2 z-[100] flex -translate-x-1/2 items-center gap-[9px] rounded-[10px] bg-[#111a33] px-5 py-3 text-[13.5px] font-semibold text-white shadow-[0_8px_30px_rgba(0,0,0,.28)]">
          <Check size={17} color="#5eead4" />
          {toast}
        </div>
      )}
    </div>
  );
}
