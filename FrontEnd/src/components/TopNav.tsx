import { useEffect, useMemo, useRef, useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import {
  AlertTriangle, Bell, Check, LogOut, Moon, Search, Settings2, Sun, User, Zap, type LucideIcon,
} from 'lucide-react';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { cn } from '@/lib/utils';
import { GREEN, RED } from '@/lib/theme';
import { activity, exceptions, approvals, type ActivityKind, type InboxMessage } from '@/data';
import { getDocumentQueue, type DocumentQueueRecord } from '../../api/documentapi';
import { getInboxMessages } from '../../api/inboxApi';
import logo from '@/assets/PCB_Logo.png';

export const TABS: [string, string][] = [
  ['/', 'Dashboard'],
  ['/inbox', 'AP Inbox'],
  ['/worklist', 'Worklist'],
  ['/exceptions', 'Exceptions'],
  ['/approvals', 'Approvals'],
  ['/reporting', 'Reporting'],
  ['/activity', 'Activity'],
  ['/autonomy', 'Autonomy'],
  ['/settings', 'Settings'],
];

const KIND_ICON: Record<ActivityKind, LucideIcon> = {
  bolt: Zap,
  check: Check,
  alert: AlertTriangle,
  user: User,
  gear: Settings2,
};

const KIND_COLOR: Record<ActivityKind, string> = {
  bolt: 'var(--navy)',
  check: GREEN,
  alert: RED,
  user: 'var(--muted)',
  gear: 'var(--muted)',
};

const NOTIF_LIMIT = 6;
const SEARCH_RESULT_LIMIT = 8;

interface SearchHit {
  key: string;
  group: string;
  primary: string;
  secondary: string;
  to: string;
}

type MenuKey = 'search' | 'alerts' | 'profile';

interface TopNavProps {
  dark: boolean;
  onToggleDark: () => void;
}

/** Fixed navy bar: logo, horizontal tabs, theme toggle + utility icons, avatar. */
export function TopNav({ dark, onToggleDark }: TopNavProps) {
  const navigate = useNavigate();
  const utilBtn = 'flex h-[34px] w-[34px] items-center justify-center rounded-lg border-none bg-white/[.08] text-[#dbe3f4]';

  const containerRef = useRef<HTMLDivElement>(null);
  const [activeMenu, setActiveMenu] = useState<MenuKey | null>(null);

  // Search
  const [query, setQuery] = useState('');
  const [searchLoaded, setSearchLoaded] = useState(false);
  const [docs, setDocs] = useState<DocumentQueueRecord[]>([]);
  const [msgs, setMsgs] = useState<InboxMessage[]>([]);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Notifications
  const notifItems = activity.slice(0, NOTIF_LIMIT);
  const [readIdx, setReadIdx] = useState<Set<number>>(new Set());
  const unreadCount = notifItems.filter((_, i) => !readIdx.has(i)).length;

  // Sign out
  const [signOutToast, setSignOutToast] = useState(false);
  const signOutTimer = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    if (!activeMenu) return;
    const onMouseDown = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setActiveMenu(null);
      }
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setActiveMenu(null);
    };
    document.addEventListener('mousedown', onMouseDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onMouseDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [activeMenu]);

  useEffect(() => {
    if (activeMenu !== 'search') return;
    searchInputRef.current?.focus();
    if (searchLoaded) return;
    setSearchLoaded(true);
    Promise.all([
      getDocumentQueue().catch(() => ({ documents: [] as DocumentQueueRecord[] })),
      getInboxMessages().catch(() => ({ messages: [] as InboxMessage[] })),
    ]).then(([docRes, inboxRes]) => {
      setDocs(docRes.documents ?? []);
      setMsgs(inboxRes.messages ?? []);
    });
  }, [activeMenu, searchLoaded]);

  useEffect(() => () => clearTimeout(signOutTimer.current), []);

  const searchResults = useMemo<SearchHit[]>(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    const hits: SearchHit[] = [];

    for (const d of docs) {
      const haystack = `${d.supplier ?? ''} ${d.document_reference ?? ''} ${d.po_number ?? ''} ${d.document_type ?? ''} ${d.document_id}`.toLowerCase();
      if (haystack.includes(q)) {
        hits.push({
          key: `wl-${d.document_id}`,
          group: 'Worklist',
          primary: d.supplier ?? d.document_id,
          secondary: `${d.document_reference ?? d.document_id} · ${d.document_type ?? '—'}`,
          to: '/worklist',
        });
      }
    }

    for (const m of msgs) {
      const haystack = `${m.name ?? ''} ${m.from ?? ''} ${m.subject ?? ''}`.toLowerCase();
      if (haystack.includes(q)) {
        hits.push({
          key: `ib-${m.id}`,
          group: 'AP Inbox',
          primary: m.subject || m.name || m.from,
          secondary: m.name ?? m.from ?? '',
          to: '/inbox',
        });
      }
    }

    for (const e of exceptions) {
      const haystack = `${e.vendor} ${e.inv} ${e.type}`.toLowerCase();
      if (haystack.includes(q)) {
        hits.push({ key: `ex-${e.inv}`, group: 'Exceptions', primary: e.vendor, secondary: `${e.inv} · ${e.type}`, to: '/exceptions' });
      }
    }

    for (const a of approvals) {
      const haystack = `${a.vendor} ${a.inv} ${a.po}`.toLowerCase();
      if (haystack.includes(q)) {
        hits.push({ key: `ap-${a.id}`, group: 'Approvals', primary: a.vendor, secondary: `${a.inv} · ${a.po}`, to: '/approvals' });
      }
    }

    return hits.slice(0, SEARCH_RESULT_LIMIT);
  }, [query, docs, msgs]);

  const goToSearchResult = (to: string) => {
    navigate(to);
    setActiveMenu(null);
    setQuery('');
  };

  const openNotification = (i: number) => {
    setReadIdx((prev) => new Set(prev).add(i));
    setActiveMenu(null);
    navigate('/activity');
  };

  const handleSignOut = () => {
    setActiveMenu(null);
    setSignOutToast(true);
    clearTimeout(signOutTimer.current);
    signOutTimer.current = setTimeout(() => setSignOutToast(false), 3000);
  };

  return (
    <header className="sticky top-0 z-50 bg-navy text-white shadow-[0_1px_0_rgba(255,255,255,.06),0_2px_10px_rgba(12,22,58,.18)]">
      <div className="flex h-[58px] items-stretch">
        <div className="flex flex-none items-center bg-surface px-6 shadow-[2px_0_8px_rgba(0,0,0,.12)]">
          <img src={logo} alt="PCB Apps" className="block h-[26px] w-auto" />
        </div>

        <div className="mx-auto flex min-w-0 max-w-[1400px] flex-1 items-center gap-5 px-[22px]">
          <nav className="flex flex-1 gap-0.5 overflow-x-auto [scrollbar-width:none]">
            {TABS.map(([to, label]) => (
              <NavLink
                key={to}
                to={to}
                end={to === '/'}
              className={({ isActive }) =>
                cn(
                  'pcb-tab whitespace-nowrap rounded-lg px-3.5 py-2 text-[13px] transition-all',
                  isActive ? 'bg-white/[.16] font-bold text-white' : 'font-medium text-white/[.68]',
                )
              }
            >
              {label}
            </NavLink>
          ))}
        </nav>

        <div ref={containerRef} className="flex flex-none items-center gap-1.5">
          <button type="button" title="Toggle theme" onClick={onToggleDark} className={cn('pcb-btn', utilBtn)}>
            {dark ? <Sun size={17} /> : <Moon size={17} />}
          </button>

          <div className="relative">
            <button
              type="button"
              title="Search"
              onClick={() => setActiveMenu((m) => (m === 'search' ? null : 'search'))}
              className={cn('pcb-btn', utilBtn)}
            >
              <Search size={17} />
            </button>
            {activeMenu === 'search' && (
              <div className="pcb-view absolute right-0 top-11 z-30 w-[360px] rounded-[10px] border border-border bg-surface p-[5px] shadow-[0_10px_30px_rgba(16,24,40,.14)]">
                <div className="flex items-center gap-2 border-b border-border2 px-2 pb-2 pt-1">
                  <Search size={15} className="flex-none text-faint" />
                  <input
                    ref={searchInputRef}
                    type="text"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Search invoices, suppliers, POs…"
                    className="h-8 flex-1 border-none bg-transparent text-[13px] text-foreground outline-none"
                  />
                </div>
                <div className="max-h-[320px] overflow-y-auto py-1">
                  {query.trim() === '' ? (
                    <div className="px-3 py-4 text-center text-[12.5px] text-faint">
                      Search across Worklist, Inbox, Exceptions &amp; Approvals
                    </div>
                  ) : searchResults.length === 0 ? (
                    <div className="px-3 py-4 text-center text-[12.5px] text-faint">No matches for "{query}"</div>
                  ) : (
                    searchResults.map((r) => (
                      <button
                        key={r.key}
                        type="button"
                        onClick={() => goToSearchResult(r.to)}
                        className="pcb-row flex w-full items-center justify-between gap-2.5 rounded-[7px] border-none px-[11px] py-2 text-left"
                      >
                        <div className="min-w-0">
                          <div className="truncate text-[13px] font-semibold text-text2">{r.primary}</div>
                          <div className="truncate text-[11.5px] text-faint">{r.secondary}</div>
                        </div>
                        <span className="flex-none rounded-full border border-border bg-tint px-2 py-0.5 text-[10px] font-bold uppercase tracking-[.04em] text-navy">
                          {r.group}
                        </span>
                      </button>
                    ))
                  )}
                </div>
              </div>
            )}
          </div>

          <div className="relative">
            <button
              type="button"
              title="Alerts"
              onClick={() => setActiveMenu((m) => (m === 'alerts' ? null : 'alerts'))}
              className={cn('pcb-btn relative', utilBtn)}
            >
              <Bell size={17} />
              {unreadCount > 0 && (
                <span className="absolute -right-1 -top-1 flex h-[16px] min-w-[16px] items-center justify-center rounded-full bg-destructive px-[3px] text-[9px] font-bold text-white shadow-[0_0_0_2px_var(--navy)]">
                  {unreadCount}
                </span>
              )}
            </button>
            {activeMenu === 'alerts' && (
              <div className="pcb-view absolute right-0 top-11 z-30 w-[340px] rounded-[10px] border border-border bg-surface p-[5px] shadow-[0_10px_30px_rgba(16,24,40,.14)]">
                <div className="flex items-center justify-between px-3 pb-1.5 pt-1">
                  <span className="text-[11px] font-bold uppercase tracking-[.06em] text-muted-foreground">Notifications</span>
                  {unreadCount > 0 && <span className="text-[11px] font-semibold text-navy">{unreadCount} new</span>}
                </div>
                <div className="max-h-[360px] overflow-y-auto">
                  {notifItems.map((n, i) => {
                    const Icon = KIND_ICON[n.kind];
                    const unread = !readIdx.has(i);
                    return (
                      <button
                        key={i}
                        type="button"
                        onClick={() => openNotification(i)}
                        className="pcb-row flex w-full items-start gap-2.5 rounded-[7px] border-none px-[11px] py-2.5 text-left"
                        style={{ background: unread ? 'var(--tint)' : 'transparent' }}
                      >
                        <div
                          className="mt-0.5 flex h-7 w-7 flex-none items-center justify-center rounded-[8px]"
                          style={{ background: KIND_COLOR[n.kind] }}
                        >
                          <Icon size={13} color="#fff" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="text-[12.5px] leading-snug text-text2">
                            <strong>{n.who}</strong> {n.action} <span className="font-semibold tabular-nums text-navy">{n.target}</span>
                          </div>
                          <div className="mt-0.5 text-[11px] text-faint">{n.when}</div>
                        </div>
                        {unread && <span className="mt-1.5 h-[7px] w-[7px] flex-none rounded-full bg-navy" />}
                      </button>
                    );
                  })}
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setReadIdx(new Set(notifItems.map((_, i) => i)));
                    setActiveMenu(null);
                    navigate('/activity');
                  }}
                  className="pcb-row mt-1 flex h-9 w-full items-center justify-center rounded-[7px] border-none border-t border-border2 text-[12px] font-semibold text-navy"
                >
                  View all activity
                </button>
              </div>
            )}
          </div>

          <div className="mx-1 h-6 w-px bg-white/[.16]" />

          <div className="relative">
            <button
              type="button"
              onClick={() => setActiveMenu((m) => (m === 'profile' ? null : 'profile'))}
              className="pcb-btn flex cursor-pointer items-center gap-[9px] rounded-lg border-none bg-transparent px-1 py-1"
            >
              <Avatar className="h-8 w-8">
                <AvatarFallback className="bg-gradient-to-br from-navy2 to-[#6B84C4] text-[12.5px] font-bold tracking-[.02em] text-white">
                  MR
                </AvatarFallback>
              </Avatar>
              <div className="text-left leading-[1.15]">
                <div className="text-[12.5px] font-semibold">Maya Reyes</div>
                <div className="text-[11px] text-[#9fb0d6]">AP Analyst</div>
              </div>
            </button>
            {activeMenu === 'profile' && (
              <div className="pcb-view absolute right-0 top-11 z-30 w-[220px] rounded-[10px] border border-border bg-surface p-[5px] shadow-[0_10px_30px_rgba(16,24,40,.14)]">
                <div className="flex items-center gap-2.5 border-b border-border2 px-2.5 py-2.5">
                  <Avatar className="h-9 w-9">
                    <AvatarFallback className="bg-gradient-to-br from-navy2 to-[#6B84C4] text-[12.5px] font-bold tracking-[.02em] text-white">
                      MR
                    </AvatarFallback>
                  </Avatar>
                  <div className="leading-[1.15]">
                    <div className="text-[13px] font-semibold text-foreground">Maya Reyes</div>
                    <div className="text-[11px] text-muted-foreground">AP Analyst</div>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={handleSignOut}
                  className="pcb-row mt-1 flex h-9 w-full items-center gap-2 rounded-[7px] border-none bg-redsoft px-[11px] text-[13px] font-semibold text-destructive"
                >
                  <LogOut size={15} />
                  Sign out
                </button>
              </div>
            )}
          </div>
        </div>
        </div>
      </div>

      {signOutToast && (
        <div className="pcb-view fixed bottom-6 left-1/2 z-[100] flex -translate-x-1/2 items-center gap-[9px] rounded-[10px] bg-[#111a33] px-5 py-3 text-[13.5px] font-semibold text-white shadow-[0_8px_30px_rgba(0,0,0,.28)]">
          <LogOut size={16} color="#5eead4" />
          Signed out — see you soon
        </div>
      )}
    </header>
  );
}
