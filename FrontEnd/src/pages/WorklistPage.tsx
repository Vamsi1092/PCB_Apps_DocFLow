import { useState } from 'react';
import { DataTable, type DataTableColumn } from '@/components/DataTable';
import { StatusPill } from '@/components/StatusPill';
import { SeverityBadge } from '@/components/SeverityBadge';
import { RED, GREEN } from '@/lib/theme';
import { worklist, type WorklistRow, type WorklistStatus, type WorklistSla } from '@/data';

type SortableKey = keyof WorklistRow;

const PRIORITY_RANK: Record<WorklistRow['priority'], number> = { critical: 3, high: 2, medium: 1, low: 0 };
const SLA_RANK: Record<WorklistSla, number> = { breached: 2, at_risk: 1, on_track: 0 };
const NUMERIC_KEYS = new Set<SortableKey>(['amount', 'confidence', 'exceptions']);

const STATUS_META: Record<WorklistStatus, { label: string; color: string; border: string; background: string; dotColor: string }> = {
  matched: { label: 'Matched', color: 'var(--text2)', border: 'var(--line)', background: 'var(--surface)', dotColor: 'var(--muted)' },
  review: { label: 'In Review', color: 'var(--text3)', border: 'var(--line)', background: 'var(--surface)', dotColor: 'var(--faint)' },
  exception: { label: 'Exception', color: RED, border: '#f3c0c0', background: 'var(--redsoft)', dotColor: RED },
  approved: { label: 'Approved', color: GREEN, border: '#bbf0c9', background: 'var(--greensoft)', dotColor: GREEN },
  posted: { label: 'Posted', color: GREEN, border: '#bbf0c9', background: 'var(--greensoft)', dotColor: GREEN },
};

const SLA_META: Record<WorklistSla, { label: string; color: string; border: string; background: string; dotColor: string }> = {
  on_track: { label: 'On Track', color: GREEN, border: '#bbf0c9', background: 'var(--greensoft)', dotColor: GREEN },
  at_risk: { label: 'At Risk', color: 'var(--text3)', border: 'var(--line)', background: 'var(--surface)', dotColor: 'var(--faint)' },
  breached: { label: 'Breached', color: RED, border: '#f3c0c0', background: 'var(--redsoft)', dotColor: RED },
};

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function fmtMoney(n: number) {
  return '$' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtDate(iso: string) {
  const [d, t] = iso.split(' ');
  const p = d.split('-');
  return `${MONTHS[+p[1] - 1]} ${+p[2]}, ${t}`;
}

const FILTERS: [string, string][] = [
  ['all', 'All'],
  ['exception', 'Exceptions'],
  ['review', 'In Review'],
  ['matched', 'Matched'],
  ['done', 'Approved / Posted'],
];

export default function WorklistPage() {
  const [sortCol, setSortCol] = useState<SortableKey>('created_at');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [filter, setFilter] = useState('all');

  const onSort = (col: string) => {
    const key = col as SortableKey;
    if (key === sortCol) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortCol(key);
      setSortDir(key === 'created_at' || key === 'updated_at' || NUMERIC_KEYS.has(key) ? 'desc' : 'asc');
    }
  };

  let rows = worklist.slice();
  if (filter !== 'all') {
    rows = filter === 'done'
      ? rows.filter((r) => r.status === 'approved' || r.status === 'posted')
      : rows.filter((r) => r.status === filter);
  }
  const dir = sortDir === 'asc' ? 1 : -1;
  rows = rows.sort((a, b) => {
    if (sortCol === 'priority') return (PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority]) * dir;
    if (sortCol === 'sla') return (SLA_RANK[a.sla] - SLA_RANK[b.sla]) * dir;
    if (NUMERIC_KEYS.has(sortCol)) return ((a[sortCol] as number) - (b[sortCol] as number)) * dir;
    const x = String(a[sortCol]).toLowerCase();
    const y = String(b[sortCol]).toLowerCase();
    return (x < y ? -1 : x > y ? 1 : 0) * dir;
  });
  const displayRows = rows.map((r) => ({ ...r, _key: r.id }));

  const columns: DataTableColumn<WorklistRow>[] = [
    { key: 'id', label: 'ID', sortable: true, cell: (r) => <span className="text-[13px] font-semibold tabular-nums text-navy">{r.id}</span> },
    { key: 'priority', label: 'Priority', sortable: true, cell: (r) => <SeverityBadge severity={r.priority} /> },
    { key: 'supplier', label: 'Supplier', sortable: true, cell: (r) => <span className="text-[13.5px]">{r.supplier}</span> },
    { key: 'doc_ref', label: 'Doc Ref', sortable: true, cell: (r) => <span className="text-[13px] tabular-nums">{r.doc_ref}</span> },
    { key: 'po_number', label: 'PO Number', sortable: true, cell: (r) => <span className="text-[13px] tabular-nums text-muted-foreground">{r.po_number}</span> },
    { key: 'document_type', label: 'Document Type', sortable: true, cell: (r) => <span className="whitespace-nowrap text-[13px] text-text2">{r.document_type}</span> },
    { key: 'amount', label: 'Amount', align: 'right', sortable: true, cell: (r) => <span className="text-[13.5px] font-semibold tabular-nums">{fmtMoney(r.amount)}</span> },
    { key: 'stage', label: 'Stage', sortable: true, cell: (r) => <span className="text-[13px] text-text2">{r.stage}</span> },
    { key: 'confidence', label: 'Confidence', align: 'right', sortable: true, cell: (r) => <span className="text-[13px] tabular-nums text-muted-foreground">{r.confidence}%</span> },
    { key: 'exceptions', label: 'Exceptions', align: 'right', sortable: true, cell: (r) => <span className="text-[13px] tabular-nums" style={{ color: r.exceptions > 0 ? RED : 'var(--muted)' }}>{r.exceptions}</span> },
    {
      key: 'sla',
      label: 'SLA',
      sortable: true,
      cell: (r) => {
        const m = SLA_META[r.sla];
        return <StatusPill label={m.label} color={m.color} border={m.border} background={m.background} dotColor={m.dotColor} />;
      },
    },
    {
      key: 'status',
      label: 'Status',
      sortable: true,
      cell: (r) => {
        const m = STATUS_META[r.status];
        return <StatusPill label={m.label} color={m.color} border={m.border} background={m.background} dotColor={m.dotColor} />;
      },
    },
    { key: 'assigned_to', label: 'Assigned To', sortable: true, cell: (r) => <span className="whitespace-nowrap text-[13px]">{r.assigned_to}</span> },
    { key: 'created_at', label: 'Created', sortable: true, cell: (r) => <span className="whitespace-nowrap text-[13px] tabular-nums text-muted-foreground">{fmtDate(r.created_at)}</span> },
    { key: 'updated_at', label: 'Updated', sortable: true, cell: (r) => <span className="whitespace-nowrap text-[13px] tabular-nums text-muted-foreground">{fmtDate(r.updated_at)}</span> },
  ];

  return (
    <div className="pcb-view">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="mb-[3px] text-[23px] font-bold tracking-[-.02em]">Worklist</h1>
          <p className="text-[13.5px] text-muted-foreground">
            Assigned to you · <span className="tabular-nums">{displayRows.length}</span> invoices
          </p>
        </div>
        <div className="flex flex-wrap gap-[7px]">
          {FILTERS.map(([id, label]) => {
            const on = filter === id;
            return (
              <button
                key={id}
                type="button"
                onClick={() => setFilter(id)}
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
      </div>
      <DataTable
        columns={columns}
        rows={displayRows}
        sort={{ col: sortCol, dir: sortDir }}
        onSort={onSort}
        minWidth={1760}
      />
    </div>
  );
}
