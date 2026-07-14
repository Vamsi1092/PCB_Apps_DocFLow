import { Bar, BarChart, Cell, ResponsiveContainer, XAxis, YAxis } from 'recharts';
import { GREEN, RED } from '@/lib/theme';
import { months, exceptionTypes } from '@/data';

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
          <div className="my-2.5 flex h-3.5 overflow-hidden rounded-lg" style={{ margin: '10px 0 14px' }}>
            <div style={{ width: '93.2%', background: 'var(--navy)' }} />
            <div style={{ width: '6.8%', background: RED }} />
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
