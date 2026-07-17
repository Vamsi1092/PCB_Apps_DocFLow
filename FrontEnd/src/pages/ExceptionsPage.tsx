import { useState } from 'react';
import { Check, ChevronDown, Filter, X } from 'lucide-react';
import { DataTable, type DataTableColumn } from '@/components/DataTable';
import { SeverityBadge } from '@/components/SeverityBadge';
import { sevColor, RED, type Severity } from '@/lib/theme';
import { exceptions, type ExceptionRow } from '@/data';

const SEV_META: Record<Severity, { label: string; sub: string; bg: string; bd: string }> = {
  critical: { label: 'Critical', sub: 'needs action now', bg: 'var(--redsoft)', bd: '#f3c0c0' },
  high: { label: 'High', sub: 'within 4h', bg: 'var(--surface2)', bd: 'var(--border)' },
  medium: { label: 'Medium', sub: 'within 1 day', bg: 'var(--surface2)', bd: 'var(--border)' },
  low: { label: 'Low', sub: 'within 3 days', bg: 'var(--surface2)', bd: 'var(--border)' },
};

const SEVERITIES: Severity[] = ['critical', 'high', 'medium', 'low'];

/** "1d 5h" / "3h 20m" -> total minutes, so the Age column can sort chronologically. */
function ageToMinutes(age: string): number {
  const days = Number(age.match(/(\d+)d/)?.[1] ?? 0);
  const hours = Number(age.match(/(\d+)h/)?.[1] ?? 0);
  const minutes = Number(age.match(/(\d+)m/)?.[1] ?? 0);
  return days * 24 * 60 + hours * 60 + minutes;
}

const OWNERS = Array.from(new Set(exceptions.map((e) => e.owner)));

export default function ExceptionsPage() {
  const [data, setData] = useState<ExceptionRow[]>(exceptions);
  const [ageSort, setAgeSort] = useState<'asc' | 'desc' | undefined>(undefined);
  const [ownerFilter, setOwnerFilter] = useState<string | null>(null);
  const [ownerOpen, setOwnerOpen] = useState(false);
  const [sevFilter, setSevFilter] = useState<Severity | null>(null);
  const [preview, setPreview] = useState<ExceptionRow | null>(null);

  const handleApprove = (r: ExceptionRow) => {
    setData((prev) => prev.filter((row) => row.inv !== r.inv));
    setPreview((p) => (p?.inv === r.inv ? null : p));
  };

  // Counts are derived from the same `data` the table renders (not a separate
  // mock dataset), so the cards and the table can never disagree with each other.
  const severityCounts = SEVERITIES.map((sev) => ({
    sev,
    ...SEV_META[sev],
    n: data.filter((r) => r.sev === sev).length,
  }));

  let filtered = data.slice();
  if (sevFilter) filtered = filtered.filter((r) => r.sev === sevFilter);
  if (ownerFilter) filtered = filtered.filter((r) => r.owner === ownerFilter);
  if (ageSort) {
    const dir = ageSort === 'asc' ? 1 : -1;
    filtered = filtered.sort((a, b) => (ageToMinutes(a.age) - ageToMinutes(b.age)) * dir);
  }
  const rows = filtered.map((e) => ({ ...e, _key: e.inv }));

  const columns: DataTableColumn<ExceptionRow>[] = [
    { key: 'sev', label: 'Severity', cell: (r) => <SeverityBadge severity={r.sev} /> },
    { key: 'inv', label: 'Invoice', cell: (r) => <span className="text-[13px] font-semibold tabular-nums text-navy">{r.inv}</span> },
    { key: 'vendor', label: 'Vendor', cell: (r) => <span className="text-[13.5px]">{r.vendor}</span> },
    { key: 'type', label: 'Exception Type', cell: (r) => <span className="text-[13px] text-text2">{r.type}</span> },
    { key: 'age', label: 'Age', sortable: true, cell: (r) => <span className="text-[13px] tabular-nums text-muted-foreground">{r.age}</span> },
    { key: 'owner', label: 'Owner', cell: (r) => <span className="text-[13px] text-text2">{r.owner}</span> },
    {
      key: 'act',
      label: '',
      align: 'right',
      cell: (r) => (
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={() => setPreview(r)}
            className="pcb-btn h-[30px] rounded-lg border border-line bg-surface px-3 text-xs font-semibold text-navy"
          >
            Review
          </button>
          <button
            type="button"
            onClick={() => handleApprove(r)}
            className="pcb-btn h-[30px] rounded-lg border-none bg-navy px-3 text-xs font-semibold text-white"
          >
            Approve
          </button>
        </div>
      ),
    },
  ];

  return (
    <div className="pcb-view">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="mb-[3px] text-[23px] font-bold tracking-[-.02em]">Exceptions</h1>
          <p className="text-[13.5px] text-muted-foreground">{data.length} open · sorted by severity and age</p>
        </div>
        <div className="relative">
          <button
            type="button"
            onClick={() => setOwnerOpen((o) => !o)}
            className="pcb-btn flex h-[34px] items-center gap-2 rounded-lg border border-line bg-surface px-3.5 text-[12.5px] font-semibold text-text2"
          >
            <Filter size={14} />{ownerFilter ?? 'All Owners'}
            <span className="ml-0.5 flex opacity-60 transition-transform" style={{ transform: ownerOpen ? 'rotate(180deg)' : 'none' }}>
              <ChevronDown size={13} />
            </span>
          </button>
          {ownerOpen && (
            <div className="pcb-view absolute right-0 top-11 z-30 min-w-[170px] rounded-[10px] border border-border bg-surface p-[5px] shadow-[0_10px_30px_rgba(16,24,40,.14)]">
              <button
                type="button"
                onClick={() => { setOwnerFilter(null); setOwnerOpen(false); }}
                className="flex h-9 w-full items-center justify-between gap-2.5 rounded-[7px] border-none px-[11px] text-[13px]"
                style={{ background: !ownerFilter ? 'var(--tint)' : 'transparent', color: !ownerFilter ? 'var(--navy)' : 'var(--text2)', fontWeight: !ownerFilter ? 700 : 500 }}
              >
                <span>All Owners</span>
                <span className="flex text-navy" style={{ opacity: !ownerFilter ? 1 : 0 }}><Check size={14} /></span>
              </button>
              {OWNERS.map((o) => {
                const on = ownerFilter === o;
                return (
                  <button
                    key={o}
                    type="button"
                    onClick={() => { setOwnerFilter(o); setOwnerOpen(false); }}
                    className="flex h-9 w-full items-center justify-between gap-2.5 rounded-[7px] border-none px-[11px] text-[13px]"
                    style={{ background: on ? 'var(--tint)' : 'transparent', color: on ? 'var(--navy)' : 'var(--text2)', fontWeight: on ? 700 : 500 }}
                  >
                    <span>{o}</span>
                    <span className="flex text-navy" style={{ opacity: on ? 1 : 0 }}><Check size={14} /></span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>
      <div className="mb-[18px] grid grid-cols-4 gap-3.5">
        {severityCounts.map((x) => {
          const active = sevFilter === x.sev;
          return (
            <button
              key={x.sev}
              type="button"
              // Toggle behavior: clicking the active card clears the filter; clicking
              // any other card selects it (deselecting whichever was previously active).
              onClick={() => setSevFilter((prev) => (prev === x.sev ? null : x.sev))}
              className="pcb-lift rounded-xl p-4 text-left shadow-[0_1px_2px_rgba(16,24,40,.04)] transition-[opacity,box-shadow]"
              style={{
                background: x.bg,
                border: `1px solid ${active ? 'var(--navy)' : x.bd}`,
                boxShadow: active ? '0 0 0 2px var(--navy) inset' : undefined,
                opacity: sevFilter && !active ? 0.55 : 1,
              }}
            >
              <div className="mb-3 flex items-center gap-2">
                <span className="h-[11px] w-[11px] rounded-full" style={{ background: sevColor(x.sev) }} />
                <span className="text-[13px] font-bold text-text2">{x.label}</span>
              </div>
              <div
                className="text-[30px] font-extrabold leading-none tracking-[-.03em] tabular-nums"
                style={{ color: x.sev === 'critical' ? RED : 'var(--text)' }}
              >
                {x.n}
              </div>
              <div className="mt-1 text-xs text-faint">{x.sub}</div>
            </button>
          );
        })}
      </div>
      <DataTable
        columns={columns}
        rows={rows}
        sort={ageSort ? { col: 'age', dir: ageSort } : undefined}
        onSort={() => setAgeSort((d) => (d === 'desc' ? 'asc' : 'desc'))}
        minWidth={860}
      />
      {preview && (
        <div
          className="fixed inset-0 z-[300] flex items-center justify-center bg-black/50 p-4"
          onClick={() => setPreview(null)}
        >
          <div
            className="flex max-h-[85vh] w-full max-w-[480px] flex-col overflow-hidden rounded-xl bg-surface shadow-[0_24px_60px_rgba(16,24,40,.35)]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-borderf bg-surface2 px-5 py-3">
              <div className="flex items-center gap-2">
                <span className="flex h-6 w-6 items-center justify-center rounded bg-navy text-[9.5px] font-bold text-white">PDF</span>
                <span className="text-[12.5px] font-bold text-text2">Invoice Document — {preview.inv}</span>
              </div>
              <button
                type="button"
                onClick={() => setPreview(null)}
                className="pcb-btn rounded-lg p-1 text-muted-foreground"
              >
                <X size={18} />
              </button>
            </div>
            <div className="overflow-y-auto bg-[#eceef1] p-6">
              <div className="mx-auto w-full rounded-[2px] bg-white p-7 text-gray-900 shadow-[0_1px_3px_rgba(16,24,40,.18)]">
                <div className="mb-6 flex items-start justify-between">
                  <div>
                    <div className="text-[10px] font-bold uppercase tracking-[.12em] text-gray-400">Vendor</div>
                    <div className="text-[19px] font-bold">{preview.vendor}</div>
                  </div>
                  <div className="text-right">
                    <div className="text-[10px] font-bold uppercase tracking-[.12em] text-gray-400">Invoice #</div>
                    <div className="text-[19px] font-bold tabular-nums">{preview.inv}</div>
                  </div>
                </div>
                <div className="mb-6 h-px bg-gray-200" />
                <div className="mb-6 grid grid-cols-2 gap-4">
                  <div>
                    <div className="text-[10px] font-bold uppercase tracking-[.1em] text-gray-400">Age (open)</div>
                    <div className="text-[13.5px] tabular-nums">{preview.age}</div>
                  </div>
                  <div>
                    <div className="text-[10px] font-bold uppercase tracking-[.1em] text-gray-400">Owner</div>
                    <div className="text-[13.5px]">{preview.owner}</div>
                  </div>
                </div>
                <div className="rounded-md border p-3.5" style={{ borderColor: '#f3c0c0', background: '#fdf1f1' }}>
                  <div className="mb-1.5 flex items-center gap-2">
                    <SeverityBadge severity={preview.sev} />
                    <span className="text-[11px] font-bold uppercase tracking-[.05em]" style={{ color: RED }}>Exception Flagged</span>
                  </div>
                  <div className="text-[13.5px]">{preview.type}</div>
                </div>
                <div className="mt-6 space-y-2.5">
                  <div className="h-2.5 w-full rounded-full bg-gray-100" />
                  <div className="h-2.5 w-full rounded-full bg-gray-100" />
                  <div className="h-2.5 w-2/3 rounded-full bg-gray-100" />
                </div>
                <div className="mt-6 text-center text-[10.5px] text-gray-400">
                  Preview generated from captured invoice data — full document scan unavailable
                </div>
              </div>
            </div>
            <div className="flex justify-end gap-2 border-t border-borderf px-5 py-3.5">
              <button
                type="button"
                onClick={() => setPreview(null)}
                className="pcb-btn h-[34px] rounded-lg border border-line bg-surface px-3.5 text-[12.5px] font-semibold text-text2"
              >
                Close
              </button>
              <button
                type="button"
                onClick={() => handleApprove(preview)}
                className="pcb-btn h-[34px] rounded-lg border-none bg-navy px-3.5 text-[12.5px] font-semibold text-white"
              >
                Approve
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
