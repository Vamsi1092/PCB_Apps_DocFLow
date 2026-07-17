import { Fragment, useState, type ReactNode } from 'react';
import { Plus, Trash2, X } from 'lucide-react';
import { GREEN, RED } from '@/lib/theme';
import { stages } from '@/data';

type SettingsKey = 'thresholds' | 'gl' | 'sla' | 'integrations' | 'team' | 'notifications';

interface ApprovalTier {
  id: string;
  upTo: number | null;
  approver: string;
}

interface GlMapping {
  id: string;
  vendor: string;
  accountCode: string;
  accountName: string;
}

interface SlaPolicy {
  stage: string;
  targetHours: number;
  escalate: boolean;
}

interface Integration {
  id: string;
  name: string;
  detail: string;
  connected: boolean;
  lastSynced: string;
}

type TeamRole = 'Admin' | 'Approver' | 'Analyst';

interface TeamMember {
  id: string;
  name: string;
  email: string;
  role: TeamRole;
}

type NotifyChannel = 'email' | 'slack' | 'sms';
type NotifyEvent = 'critical' | 'sla' | 'approvals' | 'digest';

const DEFAULT_SLA_HOURS: Record<string, number> = {
  Capture: 1, Extraction: 2, Matching: 4, Coding: 4, Approval: 8, Posting: 2,
};

const INITIAL_TIERS: ApprovalTier[] = [
  { id: 't1', upTo: 1000, approver: 'Auto-approved (no sign-off)' },
  { id: 't2', upTo: 5000, approver: 'Approver' },
  { id: 't3', upTo: 25000, approver: 'Senior Approver' },
  { id: 't4', upTo: null, approver: 'Admin / Finance Director' },
];

const INITIAL_GL_MAPPINGS: GlMapping[] = [
  { id: 'g1', vendor: 'Nimbus Logistics', accountCode: '6110', accountName: 'Freight & Logistics' },
  { id: 'g2', vendor: 'Delta Office Supplies', accountCode: '6210', accountName: 'Office Supplies' },
  { id: 'g3', vendor: 'Vertex Media Group', accountCode: '6410', accountName: 'Marketing Services' },
  { id: 'g4', vendor: 'Cobalt Tools Inc', accountCode: '6510', accountName: 'Equipment & Tools' },
  { id: 'g5', vendor: 'Orion Freight Co', accountCode: '6110', accountName: 'Freight & Logistics' },
  { id: 'g6', vendor: 'Summit Facilities', accountCode: '6610', accountName: 'Facilities & Maintenance' },
  { id: 'g7', vendor: 'Larkspur Print', accountCode: '6220', accountName: 'Printing & Publications' },
  { id: 'g8', vendor: 'Meridian Utilities', accountCode: '6710', accountName: 'Utilities' },
  { id: 'g9', vendor: 'Pinewood Catering', accountCode: '6810', accountName: 'Meals & Catering' },
  { id: 'g10', vendor: 'Ashfield Legal LLP', accountCode: '6910', accountName: 'Legal & Professional Fees' },
];

const INITIAL_INTEGRATIONS: Integration[] = [
  { id: 'netsuite', name: 'NetSuite ERP Sync', detail: 'Posts approved invoices & syncs GL balances', connected: true, lastSynced: '2 min ago' },
  { id: 'outlook', name: 'Outlook Email Capture', detail: 'Watches the shared AP inbox for new documents', connected: true, lastSynced: '6 min ago' },
  { id: 'edi', name: 'EDI Gateway', detail: 'Receives structured PO/invoice batches from trading partners', connected: true, lastSynced: '1h ago' },
];

const INITIAL_TEAM: TeamMember[] = [
  { id: 'u1', name: 'Maya Reyes', email: 'maya.reyes@acmecorp.com', role: 'Admin' },
  { id: 'u2', name: 'J. Okafor', email: 'j.okafor@acmecorp.com', role: 'Approver' },
  { id: 'u3', name: 'A. Bianchi', email: 'a.bianchi@acmecorp.com', role: 'Analyst' },
  { id: 'u4', name: 'D. Whitfield', email: 'd.whitfield@acmecorp.com', role: 'Analyst' },
  { id: 'u5', name: 'R. Solis', email: 'r.solis@acmecorp.com', role: 'Analyst' },
  { id: 'u6', name: 'K. Mercer', email: 'k.mercer@acmecorp.com', role: 'Approver' },
  { id: 'u7', name: 'T. Adeyemi', email: 't.adeyemi@acmecorp.com', role: 'Analyst' },
  { id: 'u8', name: 'S. Novak', email: 's.novak@acmecorp.com', role: 'Admin' },
];

const NOTIFY_EVENTS: { key: NotifyEvent; label: string; desc: string }[] = [
  { key: 'critical', label: 'Critical Exceptions', desc: 'Tax mismatches, missing PO refs, duplicate suspects' },
  { key: 'sla', label: 'SLA Warnings', desc: 'Documents approaching or past their SLA target' },
  { key: 'approvals', label: 'Approval Requests', desc: 'New invoices routed to you for sign-off' },
  { key: 'digest', label: 'Daily Digest', desc: 'Summary of processing activity each morning' },
];

const NOTIFY_CHANNELS: { key: NotifyChannel; label: string }[] = [
  { key: 'email', label: 'Email' },
  { key: 'slack', label: 'Slack' },
  { key: 'sms', label: 'SMS' },
];

const INITIAL_NOTIFY_PREFS: Record<NotifyEvent, Record<NotifyChannel, boolean>> = {
  critical: { email: true, slack: true, sms: true },
  sla: { email: true, slack: true, sms: false },
  approvals: { email: true, slack: false, sms: false },
  digest: { email: true, slack: false, sms: false },
};

const ROLE_OPTIONS: TeamRole[] = ['Analyst', 'Approver', 'Admin'];

function nextId(prefix: string): string {
  return `${prefix}-${Math.random().toString(36).slice(2, 8)}`;
}

function Toggle({ on, onClick, disabled }: { on: boolean; onClick: () => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      disabled={disabled}
      onClick={onClick}
      className="pcb-btn relative h-[22px] w-[40px] flex-none rounded-full border-none disabled:opacity-40"
      style={{ background: on ? 'var(--navy)' : 'var(--border2)' }}
    >
      <span
        className="absolute top-[3px] h-4 w-4 rounded-full bg-white shadow-[0_1px_2px_rgba(0,0,0,.3)] transition-transform"
        style={{ left: 3, transform: on ? 'translateX(18px)' : 'translateX(0)' }}
      />
    </button>
  );
}

function Modal({
  title, subtitle, onClose, children, footer, width = 580,
}: {
  title: string;
  subtitle?: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  width?: number;
}) {
  return (
    <div className="fixed inset-0 z-[300] flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div
        className="flex max-h-[85vh] w-full flex-col overflow-hidden rounded-xl bg-surface shadow-[0_24px_60px_rgba(16,24,40,.35)]"
        style={{ maxWidth: width }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between border-b border-borderf px-5 py-3.5">
          <div>
            <div className="text-[14.5px] font-bold">{title}</div>
            {subtitle && <div className="mt-0.5 text-[12px] text-muted-foreground">{subtitle}</div>}
          </div>
          <button type="button" onClick={onClose} className="pcb-btn rounded-lg p-1 text-muted-foreground">
            <X size={18} />
          </button>
        </div>
        <div className="overflow-y-auto p-5">{children}</div>
        {footer && <div className="flex justify-end gap-2 border-t border-borderf px-5 py-3.5">{footer}</div>}
      </div>
    </div>
  );
}

export default function SettingsPage() {
  const [openModal, setOpenModal] = useState<SettingsKey | null>(null);
  const [savedToast, setSavedToast] = useState<string | null>(null);

  const [tiers, setTiers] = useState<ApprovalTier[]>(INITIAL_TIERS);
  const [glMappings, setGlMappings] = useState<GlMapping[]>(INITIAL_GL_MAPPINGS);
  const [glQuery, setGlQuery] = useState('');
  const [slaPolicies, setSlaPolicies] = useState<SlaPolicy[]>(
    stages.map((s) => ({ stage: s, targetHours: DEFAULT_SLA_HOURS[s] ?? 4, escalate: true })),
  );
  const [integrations, setIntegrations] = useState<Integration[]>(INITIAL_INTEGRATIONS);
  const [syncingId, setSyncingId] = useState<string | null>(null);
  const [team, setTeam] = useState<TeamMember[]>(INITIAL_TEAM);
  const [notifyPrefs, setNotifyPrefs] = useState(INITIAL_NOTIFY_PREFS);

  const close = () => setOpenModal(null);

  const flashSaved = (message: string) => {
    setSavedToast(message);
    setTimeout(() => setSavedToast(null), 2600);
  };

  const updateTier = (id: string, patch: Partial<ApprovalTier>) => {
    setTiers((prev) => prev.map((t) => (t.id === id ? { ...t, ...patch } : t)));
  };
  const removeTier = (id: string) => setTiers((prev) => prev.filter((t) => t.id !== id));
  const addTier = () => setTiers((prev) => [...prev, { id: nextId('t'), upTo: null, approver: 'Approver' }]);

  const removeGlMapping = (id: string) => setGlMappings((prev) => prev.filter((g) => g.id !== id));
  const updateGlMapping = (id: string, patch: Partial<GlMapping>) => {
    setGlMappings((prev) => prev.map((g) => (g.id === id ? { ...g, ...patch } : g)));
  };
  const filteredGl = glMappings.filter((g) => {
    const q = glQuery.trim().toLowerCase();
    return !q || `${g.vendor} ${g.accountCode} ${g.accountName}`.toLowerCase().includes(q);
  });

  const updateSlaPolicy = (stage: string, patch: Partial<SlaPolicy>) => {
    setSlaPolicies((prev) => prev.map((p) => (p.stage === stage ? { ...p, ...patch } : p)));
  };

  const toggleIntegration = (id: string) => {
    setIntegrations((prev) => prev.map((i) => (i.id === id ? { ...i, connected: !i.connected } : i)));
  };
  const syncIntegration = (id: string) => {
    setSyncingId(id);
    setTimeout(() => {
      setIntegrations((prev) => prev.map((i) => (i.id === id ? { ...i, lastSynced: 'Just now' } : i)));
      setSyncingId(null);
    }, 1100);
  };

  const updateTeamRole = (id: string, role: TeamRole) => {
    setTeam((prev) => prev.map((m) => (m.id === id ? { ...m, role } : m)));
  };
  const removeTeamMember = (id: string) => setTeam((prev) => prev.filter((m) => m.id !== id));
  const addTeamMember = () => {
    const n = team.length + 1;
    setTeam((prev) => [...prev, { id: nextId('u'), name: `New Member ${n}`, email: `new.member${n}@acmecorp.com`, role: 'Analyst' }]);
  };

  const toggleNotifyPref = (event: NotifyEvent, channel: NotifyChannel) => {
    setNotifyPrefs((prev) => ({ ...prev, [event]: { ...prev[event], [channel]: !prev[event][channel] } }));
  };

  const escalatingCount = slaPolicies.filter((p) => p.escalate).length;
  const connectedCount = integrations.filter((i) => i.connected).length;
  const roleCounts = ROLE_OPTIONS.map((r) => ({ role: r, n: team.filter((m) => m.role === r).length }));
  const activeChannelCount = NOTIFY_EVENTS.reduce(
    (n, e) => n + NOTIFY_CHANNELS.filter((c) => notifyPrefs[e.key][c.key]).length,
    0,
  );

  const cards: { key: SettingsKey; title: string; action: string; desc: string }[] = [
    {
      key: 'thresholds',
      title: 'Approval Thresholds',
      action: 'Manage rules',
      desc: `${tiers.length} dollar tiers routing who signs off, from auto-approval up to ${tiers.some((t) => t.upTo === null) ? 'Finance Director' : 'top tier'}.`,
    },
    {
      key: 'gl',
      title: 'GL Mapping',
      action: 'Edit mappings',
      desc: `Vendor-to-account mappings used by auto-coding. ${glMappings.length} active rules.`,
    },
    {
      key: 'sla',
      title: 'SLA Policies',
      action: 'Configure',
      desc: `Time targets per stage · ${escalatingCount}/${slaPolicies.length} stages escalate on breach.`,
    },
    {
      key: 'integrations',
      title: 'Integrations',
      action: 'View connections',
      desc: `ERP sync, email capture & EDI gateway · ${connectedCount}/${integrations.length} connected.`,
    },
    {
      key: 'team',
      title: 'Team & Roles',
      action: 'Manage team',
      desc: `${team.length} members · ${roleCounts.map((r) => `${r.n} ${r.role.toLowerCase()}${r.n === 1 ? '' : 's'}`).join(', ')}.`,
    },
    {
      key: 'notifications',
      title: 'Notifications',
      action: 'Edit',
      desc: `${activeChannelCount} alert channel${activeChannelCount === 1 ? '' : 's'} enabled across ${NOTIFY_EVENTS.length} event types.`,
    },
  ];

  return (
    <div className="pcb-view">
      <div className="mb-4">
        <h1 className="mb-[3px] text-[23px] font-bold tracking-[-.02em]">Settings</h1>
        <p className="text-[13.5px] text-muted-foreground">Workspace · Acme Corp AP</p>
      </div>
      <div className="grid grid-cols-[repeat(auto-fill,minmax(300px,1fr))] gap-3.5">
        {cards.map((s) => (
          <div
            key={s.key}
            className="pcb-lift rounded-xl border border-border bg-surface p-[18px] shadow-[0_1px_2px_rgba(16,24,40,.04)]"
          >
            <div className="mb-[5px] text-[14.5px] font-bold">{s.title}</div>
            <div className="mb-[14px] text-[12.5px] leading-[1.5] text-muted-foreground">{s.desc}</div>
            <button
              type="button"
              onClick={() => setOpenModal(s.key)}
              className="pcb-btn h-[34px] rounded-lg border border-line bg-surface px-[14px] text-[12.5px] font-semibold text-navy"
            >
              {s.action}
            </button>
          </div>
        ))}
      </div>

      {openModal === 'thresholds' && (
        <Modal
          title="Approval Thresholds"
          subtitle="Dollar limits and routing rules for who signs off at each tier"
          onClose={close}
          footer={(
            <button
              type="button"
              onClick={() => { flashSaved('Approval thresholds saved'); close(); }}
              className="pcb-btn h-[34px] rounded-lg border-none bg-navy px-4 text-[12.5px] font-semibold text-white"
            >
              Save changes
            </button>
          )}
        >
          <div className="space-y-2.5">
            {tiers.map((t, i) => (
              <div key={t.id} className="flex items-center gap-2.5 rounded-lg border border-border2 p-2.5">
                <span className="w-6 flex-none text-center text-[12px] font-bold text-faint">{i + 1}</span>
                <div className="flex items-center gap-1.5 text-[12.5px] text-text2">
                  <span>Up to</span>
                  {t.upTo === null ? (
                    <span className="font-semibold text-navy">no limit</span>
                  ) : (
                    <input
                      type="number"
                      value={t.upTo}
                      onChange={(e) => updateTier(t.id, { upTo: Number(e.target.value) })}
                      className="h-8 w-[100px] rounded-md border border-line bg-surface px-2 text-[12.5px] tabular-nums"
                    />
                  )}
                </div>
                <input
                  type="text"
                  value={t.approver}
                  onChange={(e) => updateTier(t.id, { approver: e.target.value })}
                  className="h-8 flex-1 rounded-md border border-line bg-surface px-2.5 text-[12.5px]"
                />
                <button type="button" onClick={() => removeTier(t.id)} className="pcb-btn flex-none rounded-md p-1.5 text-muted-foreground hover:text-destructive">
                  <Trash2 size={15} />
                </button>
              </div>
            ))}
          </div>
          <button
            type="button"
            onClick={addTier}
            className="pcb-btn mt-3 flex h-9 items-center gap-1.5 rounded-lg border border-dashed border-line px-3 text-[12.5px] font-semibold text-navy"
          >
            <Plus size={14} /> Add tier
          </button>
        </Modal>
      )}

      {openModal === 'gl' && (
        <Modal
          title="GL Mapping"
          subtitle={`Vendor-to-account mappings used by auto-coding · ${glMappings.length} active rules`}
          onClose={close}
          width={640}
          footer={(
            <button
              type="button"
              onClick={() => { flashSaved('GL mappings saved'); close(); }}
              className="pcb-btn h-[34px] rounded-lg border-none bg-navy px-4 text-[12.5px] font-semibold text-white"
            >
              Save changes
            </button>
          )}
        >
          <input
            type="text"
            value={glQuery}
            onChange={(e) => setGlQuery(e.target.value)}
            placeholder="Search vendor or account…"
            className="mb-3 h-9 w-full rounded-lg border border-line bg-surface px-3 text-[12.5px]"
          />
          <div className="space-y-2">
            {filteredGl.map((g) => (
              <div key={g.id} className="flex items-center gap-2.5 rounded-lg border border-border2 p-2.5">
                <span className="w-[170px] flex-none truncate text-[12.5px] font-semibold">{g.vendor}</span>
                <input
                  type="text"
                  value={g.accountCode}
                  onChange={(e) => updateGlMapping(g.id, { accountCode: e.target.value })}
                  className="h-8 w-[70px] flex-none rounded-md border border-line bg-surface px-2 text-[12.5px] tabular-nums"
                />
                <input
                  type="text"
                  value={g.accountName}
                  onChange={(e) => updateGlMapping(g.id, { accountName: e.target.value })}
                  className="h-8 flex-1 rounded-md border border-line bg-surface px-2.5 text-[12.5px]"
                />
                <button type="button" onClick={() => removeGlMapping(g.id)} className="pcb-btn flex-none rounded-md p-1.5 text-muted-foreground hover:text-destructive">
                  <Trash2 size={15} />
                </button>
              </div>
            ))}
            {filteredGl.length === 0 && (
              <div className="py-6 text-center text-[12.5px] text-faint">No mappings match "{glQuery}"</div>
            )}
          </div>
        </Modal>
      )}

      {openModal === 'sla' && (
        <Modal
          title="SLA Policies"
          subtitle="Time targets per stage and escalation behavior on breach"
          onClose={close}
          footer={(
            <button
              type="button"
              onClick={() => { flashSaved('SLA policies saved'); close(); }}
              className="pcb-btn h-[34px] rounded-lg border-none bg-navy px-4 text-[12.5px] font-semibold text-white"
            >
              Save changes
            </button>
          )}
        >
          <div className="space-y-2">
            {slaPolicies.map((p) => (
              <div key={p.stage} className="flex items-center gap-3 rounded-lg border border-border2 p-2.5">
                <span className="flex-1 text-[13px] font-semibold text-text2">{p.stage}</span>
                <div className="flex items-center gap-1.5 text-[12.5px] text-muted-foreground">
                  <input
                    type="number"
                    min={1}
                    value={p.targetHours}
                    onChange={(e) => updateSlaPolicy(p.stage, { targetHours: Math.max(1, Number(e.target.value)) })}
                    className="h-8 w-[64px] rounded-md border border-line bg-surface px-2 text-[12.5px] tabular-nums"
                  />
                  <span>hours</span>
                </div>
                <div className="flex flex-none items-center gap-1.5">
                  <span className="text-[11.5px] font-medium text-muted-foreground">Escalate on breach</span>
                  <Toggle on={p.escalate} onClick={() => updateSlaPolicy(p.stage, { escalate: !p.escalate })} />
                </div>
              </div>
            ))}
          </div>
        </Modal>
      )}

      {openModal === 'integrations' && (
        <Modal title="Integrations" subtitle="ERP sync (NetSuite), email capture, and EDI gateway connections" onClose={close}>
          <div className="space-y-2.5">
            {integrations.map((i) => (
              <div key={i.id} className="flex items-center gap-3 rounded-lg border border-border2 p-3">
                <span
                  className="h-2.5 w-2.5 flex-none rounded-full"
                  style={{ background: i.connected ? GREEN : 'var(--faint)' }}
                />
                <div className="min-w-0 flex-1">
                  <div className="text-[13px] font-semibold">{i.name}</div>
                  <div className="truncate text-[11.5px] text-muted-foreground">{i.detail}</div>
                  <div className="mt-0.5 text-[11px] text-faint">
                    {i.connected ? `Last synced ${i.lastSynced}` : 'Disconnected'}
                  </div>
                </div>
                <button
                  type="button"
                  disabled={!i.connected || syncingId === i.id}
                  onClick={() => syncIntegration(i.id)}
                  className="pcb-btn h-[30px] flex-none rounded-lg border border-line bg-surface px-3 text-[11.5px] font-semibold text-navy disabled:opacity-40"
                >
                  {syncingId === i.id ? 'Syncing…' : 'Sync now'}
                </button>
                <button
                  type="button"
                  onClick={() => toggleIntegration(i.id)}
                  className="pcb-btn h-[30px] flex-none rounded-lg border-none px-3 text-[11.5px] font-semibold"
                  style={{
                    background: i.connected ? 'var(--redsoft)' : 'var(--greensoft)',
                    color: i.connected ? RED : GREEN,
                  }}
                >
                  {i.connected ? 'Disconnect' : 'Connect'}
                </button>
              </div>
            ))}
          </div>
        </Modal>
      )}

      {openModal === 'team' && (
        <Modal
          title="Team & Roles"
          subtitle={`${team.length} members · analyst, approver, and admin permission sets`}
          onClose={close}
          width={640}
          footer={(
            <button
              type="button"
              onClick={() => { flashSaved('Team changes saved'); close(); }}
              className="pcb-btn h-[34px] rounded-lg border-none bg-navy px-4 text-[12.5px] font-semibold text-white"
            >
              Save changes
            </button>
          )}
        >
          <div className="space-y-2">
            {team.map((m) => (
              <div key={m.id} className="flex items-center gap-2.5 rounded-lg border border-border2 p-2.5">
                <div className="min-w-0 flex-1">
                  <div className="text-[13px] font-semibold">{m.name}</div>
                  <div className="truncate text-[11.5px] text-muted-foreground">{m.email}</div>
                </div>
                <select
                  value={m.role}
                  onChange={(e) => updateTeamRole(m.id, e.target.value as TeamRole)}
                  className="h-8 flex-none rounded-md border border-line bg-surface px-2 text-[12.5px] font-semibold text-text2"
                >
                  {ROLE_OPTIONS.map((r) => (
                    <option key={r} value={r}>{r}</option>
                  ))}
                </select>
                <button type="button" onClick={() => removeTeamMember(m.id)} className="pcb-btn flex-none rounded-md p-1.5 text-muted-foreground hover:text-destructive">
                  <Trash2 size={15} />
                </button>
              </div>
            ))}
          </div>
          <button
            type="button"
            onClick={addTeamMember}
            className="pcb-btn mt-3 flex h-9 items-center gap-1.5 rounded-lg border border-dashed border-line px-3 text-[12.5px] font-semibold text-navy"
          >
            <Plus size={14} /> Invite member
          </button>
        </Modal>
      )}

      {openModal === 'notifications' && (
        <Modal
          title="Notifications"
          subtitle="Alert channels for critical exceptions and SLA warnings"
          onClose={close}
          width={620}
          footer={(
            <button
              type="button"
              onClick={() => { flashSaved('Notification preferences saved'); close(); }}
              className="pcb-btn h-[34px] rounded-lg border-none bg-navy px-4 text-[12.5px] font-semibold text-white"
            >
              Save changes
            </button>
          )}
        >
          <div className="grid gap-2" style={{ gridTemplateColumns: '1fr repeat(3,64px)' }}>
            <div />
            {NOTIFY_CHANNELS.map((c) => (
              <div key={c.key} className="text-center text-[11px] font-bold uppercase tracking-[.04em] text-faint">{c.label}</div>
            ))}
            {NOTIFY_EVENTS.map((ev) => (
              <Fragment key={ev.key}>
                <div className="py-2">
                  <div className="text-[13px] font-semibold text-text2">{ev.label}</div>
                  <div className="text-[11px] text-muted-foreground">{ev.desc}</div>
                </div>
                {NOTIFY_CHANNELS.map((c) => (
                  <div key={`${ev.key}-${c.key}`} className="flex items-center justify-center">
                    <Toggle on={notifyPrefs[ev.key][c.key]} onClick={() => toggleNotifyPref(ev.key, c.key)} />
                  </div>
                ))}
              </Fragment>
            ))}
          </div>
        </Modal>
      )}

      {savedToast && (
        <div className="pcb-view fixed bottom-6 left-1/2 z-[400] flex -translate-x-1/2 items-center gap-[9px] rounded-[10px] bg-[#111a33] px-5 py-3 text-[13.5px] font-semibold text-white shadow-[0_8px_30px_rgba(0,0,0,.28)]">
          {savedToast}
        </div>
      )}
    </div>
  );
}
