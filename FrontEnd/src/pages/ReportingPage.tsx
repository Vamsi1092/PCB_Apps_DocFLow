import { Bar, BarChart, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { GREEN, RED } from '@/lib/theme';
import { months, exceptionTypes, type MonthTrend, type ExceptionTypeCount } from '@/data';

const tooltipBox = 'rounded-lg bg-[#111a33] px-3.5 py-2.5 text-white shadow-[0_10px_30px_rgba(0,0,0,.3)]';

interface RechartsTooltipProps<T> {
  active?: boolean;
  payload?: { payload: T; dataKey?: string; value?: number }[];
  label?: string;
}

/** Invoices-vs-exceptions bar tooltip: shows both series for the hovered month plus the derived exception rate. */
function MonthTooltip({ active, payload, label }: RechartsTooltipProps<MonthTrend>) {
  if (!active || !payload?.length) return null;
  const inv = payload.find((p) => p.dataKey === 'inv')?.value ?? 0;
  const exc = payload.find((p) => p.dataKey === 'exc')?.value ?? 0;
  const rate = inv ? ((exc / inv) * 100).toFixed(1) : '0.0';
  return (
    <div className={tooltipBox}>
      <div className="mb-1.5 text-[12px] font-bold">{label}</div>
      <div className="flex items-center gap-2 text-[12px] text-[#c3cce3]">
        <span className="h-2 w-2 flex-none rounded-[2px] bg-navy2" />
        Invoices
        <strong className="ml-auto tabular-nums text-white">{inv.toLocaleString('en-US')}</strong>
      </div>
      <div className="mt-1 flex items-center gap-2 text-[12px] text-[#c3cce3]">
        <span className="h-2 w-2 flex-none rounded-[2px]" style={{ background: RED }} />
        Exceptions
        <strong className="ml-auto tabular-nums text-white">{exc.toLocaleString('en-US')}</strong>
      </div>
      <div className="mt-1.5 border-t border-white/15 pt-1.5 text-[11px] text-[#9fb0d6]">{rate}% exception rate</div>
    </div>
  );
}

/** Exception-type bar tooltip: names the category, its count, and flags the highest-impact one. */
function ExceptionTypeTooltip({ active, payload }: RechartsTooltipProps<ExceptionTypeCount>) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div className={tooltipBox}>
      <div className="mb-1 text-[12px] font-bold">{d.label}</div>
      <div className="text-[12px] text-[#c3cce3]">
        <strong className="tabular-nums text-white">{d.n}</strong> exception{d.n === 1 ? '' : 's'} logged this period
      </div>
      {d.attn && (
        <div className="mt-1.5 border-t border-white/15 pt-1.5 text-[11px] font-semibold" style={{ color: '#ff9a9a' }}>
          Highest-impact category — prioritize for rule tuning
        </div>
      )}
    </div>
  );
}

export default function ReportingPage() {
  return (
    <div className="pcb-view">
      <div className="mb-4">
        <h1 className="mb-[3px] text-[23px] font-bold tracking-[-.02em]">Reporting</h1>
        <p className="text-[13.5px] text-muted-foreground">Last 6 months · processing &amp; exception trends</p>
      </div>

      <div className="mb-4 grid grid-cols-[1.5fr_1fr] gap-4">
        <div className="rounded-xl border border-border bg-surface p-[18px_20px] shadow-[0_1px_2px_rgba(16,24,40,.04)]">
          <div className="mb-1.5 flex items-center justify-between">
            <span className="text-[14.5px] font-bold">Invoices vs. Exceptions</span>
            <div className="flex gap-4">
              <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                <span className="h-[11px] w-[11px] rounded-[3px] bg-navy" />Invoices
              </span>
              <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                <span className="h-[11px] w-[11px] rounded-[3px]" style={{ background: RED }} />Exceptions
              </span>
            </div>
          </div>
          <div style={{ height: 254 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={months} barGap={5} margin={{ top: 24, right: 0, bottom: 0, left: 0 }}>
                <XAxis
                  dataKey="m"
                  axisLine={false}
                  tickLine={false}
                  tick={{ fontSize: 12, fontWeight: 600, fill: 'var(--muted)' }}
                />
                <YAxis hide domain={[0, 'dataMax']} />
                <Tooltip content={<MonthTooltip />} cursor={{ fill: 'rgba(30,58,138,.06)' }} />
                <Bar dataKey="inv" fill="var(--navy)" radius={[5, 5, 0, 0]} maxBarSize={30} />
                <Bar dataKey="exc" fill={RED} radius={[5, 5, 0, 0]} maxBarSize={30} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="flex flex-col rounded-xl border border-border bg-surface p-[18px_20px] shadow-[0_1px_2px_rgba(16,24,40,.04)]">
          <span className="mb-[18px] text-[14.5px] font-bold">Processing Health</span>
          <div className="mb-1.5 flex items-baseline gap-2">
            <span className="text-[38px] font-extrabold leading-none tracking-[-.03em] tabular-nums" style={{ color: GREEN }}>
              93.2%
            </span>
            <span className="text-[13px] font-semibold text-muted-foreground">on track</span>
          </div>
          <div className="relative" style={{ margin: '10px 0 14px' }}>
            <div className="flex h-3.5 overflow-hidden rounded-lg">
              <div style={{ width: '93.2%', background: 'var(--navy)' }} />
              <div style={{ width: '6.8%', background: RED }} />
            </div>
            <div className="group absolute inset-y-0 left-0 cursor-default" style={{ width: '93.2%' }}>
              <div className={`pointer-events-none absolute bottom-[calc(100%+8px)] left-0 z-20 hidden whitespace-nowrap text-[11.5px] font-semibold group-hover:block ${tooltipBox}`}>
                5,088 documents on track — 93.2% within SLA
              </div>
            </div>
            <div className="group absolute inset-y-0 right-0 cursor-default" style={{ width: '6.8%' }}>
              <div className={`pointer-events-none absolute bottom-[calc(100%+8px)] right-0 z-20 hidden whitespace-nowrap text-[11.5px] font-semibold group-hover:block ${tooltipBox}`}>
                372 documents need attention — 6.8% flagged for review
              </div>
            </div>
          </div>
          <div className="mb-1.5 flex justify-between text-[12.5px]">
            <span className="inline-flex items-center gap-[7px] text-text2">
              <span className="h-2.5 w-2.5 rounded-[3px] bg-navy" />On track
            </span>
            <span className="font-bold tabular-nums">5,088</span>
          </div>
          <div className="flex justify-between text-[12.5px]">
            <span className="inline-flex items-center gap-[7px] text-text2">
              <span className="h-2.5 w-2.5 rounded-[3px]" style={{ background: RED }} />Needs attention
            </span>
            <span className="font-bold tabular-nums">372</span>
          </div>
          <div className="mt-auto border-t border-border2 pt-4 text-[12.5px] text-muted-foreground" style={{ marginTop: 'auto' }}>
            Avg processing time <strong className="text-foreground">2.4h</strong>, down from 3.1h in May.
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-border bg-surface p-[18px_20px] shadow-[0_1px_2px_rgba(16,24,40,.04)]">
        <span className="text-[14.5px] font-bold">Exception Types</span>
        <div style={{ height: exceptionTypes.length * 35 + 10 }} className="mt-4">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={exceptionTypes}
              layout="vertical"
              barCategoryGap={13}
              margin={{ top: 0, right: 40, bottom: 0, left: 0 }}
            >
              <XAxis type="number" hide />
              <YAxis
                type="category"
                dataKey="label"
                width={150}
                axisLine={false}
                tickLine={false}
                tick={{ fontSize: 13, fontWeight: 500, fill: 'var(--text2)' }}
              />
              <Tooltip content={<ExceptionTypeTooltip />} cursor={{ fill: 'rgba(30,58,138,.06)' }} />
              <Bar dataKey="n" radius={6} barSize={22} label={{ position: 'right', fontSize: 13, fontWeight: 700, fill: 'var(--text)' }}>
                {exceptionTypes.map((t) => (
                  <Cell key={t.label} fill={t.attn ? RED : 'var(--navy)'} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}
