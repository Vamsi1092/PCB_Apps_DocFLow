import type { MouseEvent, ReactNode } from 'react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { cn } from '@/lib/utils';

export interface DataTableColumn<T> {
  key: string;
  label: string;
  align?: 'left' | 'right' | 'center';
  sortable?: boolean;
  cell: (row: T) => ReactNode;
  /** Hide this column below the given breakpoint, for narrow/tablet viewports.
   * The column stays reachable by scrolling the table horizontally — this only
   * trims lower-priority columns so the important ones fit without scrolling. */
  hideBelow?: 'sm' | 'md' | 'lg';
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
  // Optional row-level hover hooks (used by the Worklist's document-flow overlay).
  // The full mouse event is passed (not just the row element) so callers can
  // position a portal at the actual cursor location, not a fixed offset off
  // the row's bounding rect.
  onRowMouseEnter?: (row: T, e: MouseEvent<HTMLTableRowElement>) => void;
  onRowMouseLeave?: (row: T) => void;
}

const HIDE_BELOW_CLASS: Record<NonNullable<DataTableColumn<unknown>['hideBelow']>, string> = {
  sm: 'hidden sm:table-cell',
  md: 'hidden md:table-cell',
  lg: 'hidden lg:table-cell',
};

/** Reusable sortable table with zebra striping and per-column custom cells.
 * Horizontally scrollable (rather than clipped) below `minWidth`, so narrow
 * viewports can still reach every column instead of losing content. */
export function DataTable<T>({ columns, rows, sort, onSort, minWidth = 840, onRowMouseEnter, onRowMouseLeave }: DataTableProps<T>) {
  return (
    <div className="overflow-hidden rounded-xl border border-border bg-surface shadow-[0_1px_2px_rgba(16,24,40,.04)]">
      <div className="overflow-x-auto">
        <Table style={{ minWidth }}>
          <TableHeader>
            <TableRow className="border-b border-border bg-surface2 hover:bg-surface2">
              {columns.map((c) => {
                const active = sort?.col === c.key;
                const ariaSort = c.sortable ? (active ? (sort?.dir === 'asc' ? 'ascending' : 'descending') : 'none') : undefined;
                return (
                  <TableHead
                    key={c.key}
                    aria-sort={ariaSort}
                    className={cn(
                      'h-auto whitespace-nowrap px-4 py-3 text-[11.5px] font-medium text-muted-foreground',
                      c.align === 'right' ? 'text-right' : 'text-left',
                      c.hideBelow && HIDE_BELOW_CLASS[c.hideBelow],
                    )}
                  >
                    {c.sortable && onSort ? (
                      <button
                        type="button"
                        onClick={() => onSort(c.key)}
                        // Browsers reset text-transform to `none` on form controls
                        // by default (a UA-stylesheet quirk, not a Tailwind one) —
                        // the `uppercase` set on the parent <th> doesn't inherit
                        // into this <button>, so it has to be repeated here.
                        className={cn(
                          'inline-flex cursor-pointer items-center gap-1.5 bg-transparent p-0 uppercase tracking-[.05em]',
                          c.align === 'right' ? 'justify-end' : 'justify-start',
                        )}
                      >
                        {c.label}
                        <span
                          className="inline-block text-[9px]"
                          style={{
                            color: active ? 'var(--navy)' : 'var(--line)',
                            transform: active && sort?.dir === 'desc' ? 'rotate(180deg)' : 'none',
                          }}
                        >
                          &#9650;
                        </span>
                      </button>
                    ) : (
                      <span className={cn('inline-flex items-center gap-1.5 uppercase tracking-[.05em]', c.align === 'right' ? 'justify-end' : 'justify-start')}>
                        {c.label}
                      </span>
                    )}
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
                onMouseEnter={onRowMouseEnter ? (e: MouseEvent<HTMLTableRowElement>) => onRowMouseEnter(row, e) : undefined}
                onMouseLeave={onRowMouseLeave ? () => onRowMouseLeave(row) : undefined}
              >
                {columns.map((c) => (
                  <TableCell
                    key={c.key}
                    className={cn(
                      'px-4 py-3',
                      c.align === 'right' ? 'text-right' : c.align === 'center' ? 'text-center' : 'text-left',
                      c.hideBelow && HIDE_BELOW_CLASS[c.hideBelow],
                    )}
                  >
                    {c.cell(row)}
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
