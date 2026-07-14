import { DataTable, type DataTableColumn } from '@/components/DataTable';
import { SeverityBadge } from '@/components/SeverityBadge';
import { sevColor, RED, type Severity } from '@/lib/theme';
import { severity, exceptions, type ExceptionRow } from '@/data';

const SEV_META: Record<Severity, { sub: string; bg: string; bd: string }> = {
  critical: { sub: 'needs action now', bg: 'var(--redsoft)', bd: '#f3c0c0' },
  high: { sub: 'within 4h', bg: 'var(--surface2)', bd: 'var(--border)' },
  medium: { sub: 'within 1 day', bg: 'var(--surface2)', bd: 'var(--border)' },
  low: { sub: 'within 3 days', bg: 'var(--surface2)', bd: 'var(--border)' },
};

export default function ExceptionsPage() {
  const rows = exceptions.map((e) => ({ ...e, _key: e.inv }));

  const columns: DataTableColumn<ExceptionRow>[] = [
    { key: 'sev', label: 'Severity', cell: (r) => <SeverityBadge severity={r.sev} /> },
    { key: 'inv', label: 'Invoice', cell: (r) => <span className="text-[13px] font-semibold tabular-nums text-navy">{r.inv}</span> },
    { key: 'vendor', label: 'Vendor', cell: (r) => <span className="text-[13.5px]">{r.vendor}</span> },
    { key: 'type', label: 'Exception Type', cell: (r) => <span className="text-[13px] text-text2">{r.type}</span> },
    { key: 'age', label: 'Age', cell: (r) => <span className="text-[13px] tabular-nums text-muted-foreground">{r.age}</span> },
    { key: 'owner', label: 'Owner', cell: (r) => <span className="text-[13px] text-text2">{r.owner}</span> },
    {
      key: 'act',
      label: '',
      align: 'right',
      cell: () => (
        <button type="button" className="pcb-btn h-[30px] rounded-lg border border-line bg-surface px-3 text-xs font-semibold text-navy">
          Resolve
        </button>
      ),
    },
  ];

  return (
    <div className="pcb-view">
      <div className="mb-4">
        <h1 className="mb-[3px] text-[23px] font-bold tracking-[-.02em]">Exceptions</h1>
        <p className="text-[13.5px] text-muted-foreground">87 open · sorted by severity and age</p>
      </div>
      <div className="mb-[18px] grid grid-cols-4 gap-3.5">
        {severity.map((x) => {
          const meta = SEV_META[x.sev];
          return (
            <div
              key={x.label}
              className="pcb-lift rounded-xl p-4 shadow-[0_1px_2px_rgba(16,24,40,.04)]"
              style={{ background: meta.bg, border: `1px solid ${meta.bd}` }}
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
              <div className="mt-1 text-xs text-faint">{meta.sub}</div>
            </div>
          );
        })}
      </div>
      <DataTable columns={columns} rows={rows} minWidth={860} />
    </div>
  );
}
