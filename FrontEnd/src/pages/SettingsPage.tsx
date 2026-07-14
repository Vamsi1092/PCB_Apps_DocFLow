import { settings } from '@/data';

export default function SettingsPage() {
  return (
    <div className="pcb-view">
      <div className="mb-4">
        <h1 className="mb-[3px] text-[23px] font-bold tracking-[-.02em]">Settings</h1>
        <p className="text-[13.5px] text-muted-foreground">Workspace · Acme Corp AP</p>
      </div>
      <div className="grid grid-cols-[repeat(auto-fill,minmax(300px,1fr))] gap-3.5">
        {settings.map((s) => (
          <div
            key={s.title}
            className="pcb-lift rounded-xl border border-border bg-surface p-[18px] shadow-[0_1px_2px_rgba(16,24,40,.04)]"
          >
            <div className="mb-[5px] text-[14.5px] font-bold">{s.title}</div>
            <div className="mb-[14px] text-[12.5px] leading-[1.5] text-muted-foreground">{s.desc}</div>
            <button
              type="button"
              className="pcb-btn h-[34px] rounded-lg border border-line bg-surface px-[14px] text-[12.5px] font-semibold text-navy"
            >
              {s.action}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
