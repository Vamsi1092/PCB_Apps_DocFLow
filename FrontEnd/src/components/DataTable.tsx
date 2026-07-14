import type { ReactNode } from 'react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { cn } from '@/lib/utils';

export interface DataTableColumn<T> {
  key: string;
  label: string;
  align?: 'left' | 'right' | 'center';
  sortable?: boolean;
  cell: (row: T) => ReactNode;
}

export interface DataTableSort {
  col: string;
  dir: 'asc' | 'desc';
}

interface DataTableProps<T> {
  columns: DataTableColumn<T>[];
  rows: (T & { _key?: string })[];
  sort?: DataTableSort;
  onSort?: (col: string) => void;
  minWidth?: number;
}

/** Reusable sortable table with zebra striping and per-column custom cells. */
export function DataTable<T>({ columns, rows, sort, onSort, minWidth = 840 }: DataTableProps<T>) {
  return (
    <div className="overflow-hidden rounded-xl border border-border bg-surface shadow-[0_1px_2px_rgba(16,24,40,.04)]">
      <Table style={{ minWidth }}>
        <TableHeader>
          <TableRow className="border-b border-border bg-surface2 hover:bg-surface2">
            {columns.map((c) => {
              const active = sort?.col === c.key;
              return (
                <TableHead
                  key={c.key}
                  onClick={c.sortable && onSort ? () => onSort(c.key) : undefined}
                  className={cn(
                    'h-auto whitespace-nowrap px-4 py-3 text-[11.5px] font-bold uppercase tracking-[.05em] text-muted-foreground',
                    c.align === 'right' ? 'text-right' : 'text-left',
                    c.sortable && 'cursor-pointer select-none',
                  )}
                >
                  <span className={cn('inline-flex items-center gap-1.5', c.align === 'right' ? 'justify-end' : 'justify-start')}>
                    {c.label}
                    {c.sortable && (
                      <span
                        className="inline-block text-[9px]"
                        style={{
                          color: active ? 'var(--navy)' : 'var(--line)',
                          transform: active && sort?.dir === 'desc' ? 'rotate(180deg)' : 'none',
                        }}
                      >
                        &#9650;
                      </span>
                    )}
                  </span>
                </TableHead>
              );
            })}
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row, i) => (
            <TableRow
              key={row._key ?? i}
              className="pcb-row cursor-pointer border-b border-borderf"
              style={{ background: i % 2 ? 'var(--surface2)' : 'var(--surface)' }}
            >
              {columns.map((c) => (
                <TableCell
                  key={c.key}
                  className={cn('px-4 py-3', c.align === 'right' ? 'text-right' : c.align === 'center' ? 'text-center' : 'text-left')}
                >
                  {c.cell(row)}
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
