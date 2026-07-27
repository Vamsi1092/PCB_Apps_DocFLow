import { useEffect, useMemo, useRef, useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import {
  AlertTriangle, Bell, Check, LogOut, Moon, Search, Settings2, Sun, User, Zap, type LucideIcon,
} from 'lucide-react';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { cn } from '@/lib/utils';
import { GREEN, RED } from '@/lib/theme';
import { activity, type ActivityKind } from '@/data';
import { supabase } from '@/lib/supabase';
import { AP_DOCUMENT_SELECT, fetchDocumentUiRows, titleCaseDocType, toWorklistRow, UNRESOLVED_SUPPLIER, type ApDocRow, type DocumentUiRow } from '@/lib/documentRow';
import type { WorklistRow } from '@/data';
import { useToast } from '@/hooks/useToast';
import { Toast } from '@/components/Toast';
import logo from '@/assets/PCB_Logo.png';

export const TABS: [string, string][] = [
  ['/', 'Dashboard'],
  ['/inbox', 'AP Inbox'],
  ['/worklist', 'Worklist'],
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
  state?: unknown;
}

type MenuKey = 'search' | 'alerts' | 'profile';

// Minimal row shapes for the search sources that aren't already the full Worklist
// mapping — only what's needed to build a SearchHit. Each mirrors the same
// ai_understanding.header extraction the owning page itself uses.
interface EmailSearchRow {
  id: string;
  from_name: string | null;
  from_email: string | null;
  subject: string | null;
  ai_understanding: Record<string, any> | null;
}
interface ApprovalSearchRow {
  id: string;
  document_id: string | null;
  ap_documents: { email_messages: { ai_understanding: Record<string, any> | null } | null } | null;
}

// Canonical supplier per FRONTEND_HANDOFF_FOR_VAMSI.md §8 — never the AI-extracted
// free-text name. `ui` is looked up from the shared document_ui_view fetch below.
function canonicalSupplier(ui: DocumentUiRow | undefined): string {
  return ui?.supplier_id ? (ui.supplier_name ?? UNRESOLVED_SUPPLIER) : UNRESOLVED_SUPPLIER;
}

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

  // Search — reads the same Supabase tables the pages themselves read (no more
  // dead FastAPI calls). Loaded once, lazily, the first time the menu opens.
  const [query, setQuery] = useState('');
  const [searchLoaded, setSearchLoaded] = useState(false);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [worklistRows, setWorklistRows] = useState<WorklistRow[]>([]);
  // document_ui_view rows for every document referenced by any search source
  // (Worklist + Approvals), keyed by document_id — the single source of
  // canonical supplier names across both categories.
  const [uiRowMap, setUiRowMap] = useState<Map<string, DocumentUiRow>>(new Map());
  const [msgs, setMsgs] = useState<EmailSearchRow[]>([]);
  const [approvalRows, setApprovalRows] = useState<ApprovalSearchRow[]>([]);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [searchFocusIndex, setSearchFocusIndex] = useState(-1);

  // Notifications — still the same static demo data (src/data.ts); labeled as
  // such in the panel rather than presented as a real activity feed.
  const notifItems = activity.slice(0, NOTIF_LIMIT);
  const [readIdx, setReadIdx] = useState<Set<number>>(new Set());
  const unreadCount = notifItems.filter((_, i) => !readIdx.has(i)).length;
  const [notifFocusIndex, setNotifFocusIndex] = useState(-1);

  // Sign out — local UI action only, never a real session invalidation.
  const { toast: signOutToast, showToast: showSignOutToast } = useToast(3000);

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
    setSearchLoading(true);
    setSearchError(null);

    Promise.all([
      supabase.from('ap_documents').select(AP_DOCUMENT_SELECT).eq('is_active', true).limit(200),
      supabase.from('email_messages').select('id, from_name, from_email, subject, ai_understanding').limit(200),
      supabase
        .from('approval_requests')
        .select('id, document_id, ap_documents ( email_messages ( ai_understanding ) )')
        .eq('status', 'pending'),
    ]).then(([docRes, msgRes, apprRes]) => {
      const firstError = docRes.error || msgRes.error || apprRes.error;
      if (firstError) {
        setSearchError(firstError.message);
        setSearchLoading(false);
        return;
      }
      const docs = (docRes.data ?? []) as unknown as ApDocRow[];
      const apprs = (apprRes.data ?? []) as unknown as ApprovalSearchRow[];
      // document_ui_view is a separate query (it's a view, not embeddable via the
      // ap_documents FK) — fetched once for every document any search source
      // references, then merged/looked-up in JS. See documentRow.ts.
      const allIds = [
        ...docs.map((d) => d.id),
        ...apprs.map((a) => a.document_id).filter((x): x is string => !!x),
      ];
      fetchDocumentUiRows(allIds)
        .then((uiMap) => {
          setUiRowMap(uiMap);
          setWorklistRows(docs.map((d) => toWorklistRow(d, uiMap.get(d.id))));
          setMsgs((msgRes.data ?? []) as unknown as EmailSearchRow[]);
          setApprovalRows(apprs);
          setSearchLoading(false);
        })
        .catch((uiErr) => {
          setSearchError(uiErr instanceof Error ? uiErr.message : 'Failed to load search data.');
          setSearchLoading(false);
        });
    });
  }, [activeMenu, searchLoaded]);

  const searchResults = useMemo<SearchHit[]>(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    const hits: SearchHit[] = [];

    for (const r of worklistRows) {
      const haystack = `${r.supplier} ${r.doc_ref} ${r.po_number} ${r.document_type} ${r.display_id}`.toLowerCase();
      if (haystack.includes(q)) {
        hits.push({
          key: `wl-${r.id}`,
          group: 'Worklist',
          primary: r.supplier,
          secondary: `${r.doc_ref} · ${titleCaseDocType(r.document_type)}`,
          to: `/worklist/${r.id}`,
          state: { row: r },
        });
      }
    }

    for (const m of msgs) {
      const header = (m.ai_understanding?.header ?? {}) as Record<string, any>;
      const haystack = `${m.from_name ?? ''} ${m.from_email ?? ''} ${m.subject ?? ''} ${header.supplier_name ?? ''} ${header.ship_to_name ?? ''}`.toLowerCase();
      if (haystack.includes(q)) {
        hits.push({
          key: `ib-${m.id}`,
          group: 'AP Inbox',
          primary: m.subject || m.from_name || m.from_email || 'Message',
          secondary: m.from_name ?? m.from_email ?? '',
          to: '/inbox',
        });
      }
    }

    for (const a of approvalRows) {
      const header = (a.ap_documents?.email_messages?.ai_understanding?.header ?? {}) as Record<string, any>;
      const supplier = canonicalSupplier(a.document_id ? uiRowMap.get(a.document_id) : undefined);
      const haystack = `${supplier} ${header.invoice_number ?? ''} ${header.po_number ?? ''}`.toLowerCase();
      if (haystack.includes(q)) {
        hits.push({
          key: `ap-${a.id}`,
          group: 'Approvals',
          primary: supplier,
          secondary: `${header.invoice_number ?? '—'} · ${header.po_number ?? '—'}`,
          to: '/approvals',
        });
      }
    }

    return hits.slice(0, SEARCH_RESULT_LIMIT);
  }, [query, worklistRows, msgs, approvalRows]);

  // Reset keyboard focus whenever the visible result set changes, so an old
  // index from a longer list can't point past the end of a shorter one.
  useEffect(() => {
    setSearchFocusIndex(-1);
  }, [query]);

  const goToSearchResult = (hit: SearchHit) => {
    navigate(hit.to, hit.state ? { state: hit.state } : undefined);
    setActiveMenu(null);
    setQuery('');
  };

  const onSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!searchResults.length) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSearchFocusIndex((i) => Math.min(i + 1, searchResults.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSearchFocusIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter' && searchFocusIndex >= 0) {
      e.preventDefault();
      goToSearchResult(searchResults[searchFocusIndex]);
    }
  };

  const openNotification = (i: number) => {
    setReadIdx((prev) => new Set(prev).add(i));
    setActiveMenu(null);
    navigate('/activity');
  };

  const onNotifKeyDown = (e: React.KeyboardEvent) => {
    if (!notifItems.length) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setNotifFocusIndex((i) => Math.min(i + 1, notifItems.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setNotifFocusIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter' && notifFocusIndex >= 0) {
      e.preventDefault();
      openNotification(notifFocusIndex);
    }
  };

  const handleSignOut = () => {
    setActiveMenu(null);
    showSignOutToast('Signed out — see you soon (local UI only, no session was ended)');
  };

  const toggleMenu = (key: MenuKey) => {
    setActiveMenu((m) => (m === key ? null : key));
    if (key === 'alerts') setNotifFocusIndex(-1);
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
                  'pcb-tab whitespace-nowrap rounded-lg px-3.5 py-2 text-[13px] uppercase tracking-[.03em] transition-all',
                  isActive ? 'bg-white/[.16] font-bold text-white' : 'font-medium text-white/[.68]',
                )
              }
            >
              {label}
            </NavLink>
          ))}
        </nav>

        <div ref={containerRef} className="flex flex-none items-center gap-1.5">
          <button
            type="button"
            title="Toggle theme"
            aria-label={dark ? 'Switch to light theme' : 'Switch to dark theme'}
            onClick={onToggleDark}
            className={cn('pcb-btn', utilBtn)}
          >
            {dark ? <Sun size={17} /> : <Moon size={17} />}
          </button>

          <div className="relative">
            <button
              type="button"
              title="Search"
              aria-label="Search"
              aria-haspopup="true"
              aria-expanded={activeMenu === 'search'}
              onClick={() => toggleMenu('search')}
              className={cn('pcb-btn', utilBtn)}
            >
              <Search size={17} />
            </button>
            {activeMenu === 'search' && (
              <div className="pcb-view absolute right-0 top-11 z-30 w-[360px] rounded-[10px] border border-border bg-surface p-[5px] shadow-[0_10px_30px_rgba(16,24,40,.14)]">
                <div className="flex items-center gap-2 border-b border-border2 px-2 pb-2 pt-1">
                  <Search size={15} className="flex-none text-faint" aria-hidden="true" />
                  <input
                    ref={searchInputRef}
                    type="text"
                    role="combobox"
                    aria-expanded={searchResults.length > 0}
                    aria-controls="topnav-search-listbox"
                    aria-autocomplete="list"
                    aria-activedescendant={searchFocusIndex >= 0 ? searchResults[searchFocusIndex]?.key : undefined}
                    aria-label="Search invoices, suppliers, purchase orders"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    onKeyDown={onSearchKeyDown}
                    placeholder="Search invoices, suppliers, POs…"
                    className="h-8 flex-1 border-none bg-transparent text-[13px] text-foreground outline-none"
                  />
                </div>
                <div id="topnav-search-listbox" role="listbox" aria-label="Search results" className="max-h-[320px] overflow-y-auto py-1">
                  {searchLoading ? (
                    <div className="px-3 py-4 text-center text-[12.5px] text-faint">Searching…</div>
                  ) : searchError ? (
                    <div className="px-3 py-4 text-center text-[12.5px]" style={{ color: RED }}>{searchError}</div>
                  ) : query.trim() === '' ? (
                    <div className="px-3 py-4 text-center text-[12.5px] text-faint">
                      Search across Worklist, Inbox &amp; Approvals
                    </div>
                  ) : searchResults.length === 0 ? (
                    <div className="px-3 py-4 text-center text-[12.5px] text-faint">No matches for "{query}"</div>
                  ) : (
                    searchResults.map((r, i) => (
                      <button
                        key={r.key}
                        id={r.key}
                        role="option"
                        aria-selected={i === searchFocusIndex}
                        type="button"
                        onClick={() => goToSearchResult(r)}
                        onMouseEnter={() => setSearchFocusIndex(i)}
                        className="pcb-row flex w-full items-center justify-between gap-2.5 rounded-[7px] border-none px-[11px] py-2 text-left"
                        style={{ background: i === searchFocusIndex ? 'var(--tint)' : undefined }}
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
              aria-label={`Notifications${unreadCount > 0 ? `, ${unreadCount} unread` : ''}`}
              aria-haspopup="true"
              aria-expanded={activeMenu === 'alerts'}
              onClick={() => toggleMenu('alerts')}
              onKeyDown={onNotifKeyDown}
              className={cn('pcb-btn relative', utilBtn)}
            >
              <Bell size={17} aria-hidden="true" />
              {unreadCount > 0 && (
                <span
                  aria-hidden="true"
                  className="absolute -right-1 -top-1 flex h-[16px] min-w-[16px] items-center justify-center rounded-full bg-destructive px-[3px] text-[9px] font-bold text-white shadow-[0_0_0_2px_var(--navy)]"
                >
                  {unreadCount}
                </span>
              )}
            </button>
            {activeMenu === 'alerts' && (
              <div role="menu" aria-label="Notifications" className="pcb-view absolute right-0 top-11 z-30 w-[340px] rounded-[10px] border border-border bg-surface p-[5px] shadow-[0_10px_30px_rgba(16,24,40,.14)]">
                <div className="flex items-center justify-between px-3 pb-1 pt-1">
                  <span className="text-[11px] font-bold uppercase tracking-[.06em] text-muted-foreground">Notifications</span>
                  {unreadCount > 0 && <span className="text-[11px] font-semibold text-navy">{unreadCount} new</span>}
                </div>
                <div className="px-3 pb-1.5 text-[10.5px] text-faint">Demo activity feed — local sample data</div>
                <div className="max-h-[360px] overflow-y-auto">
                  {notifItems.map((n, i) => {
                    const Icon = KIND_ICON[n.kind];
                    const unread = !readIdx.has(i);
                    return (
                      <button
                        key={i}
                        role="menuitem"
                        type="button"
                        onClick={() => openNotification(i)}
                        onMouseEnter={() => setNotifFocusIndex(i)}
                        className="pcb-row flex w-full items-start gap-2.5 rounded-[7px] border-none px-[11px] py-2.5 text-left"
                        style={{ background: unread ? 'var(--tint)' : i === notifFocusIndex ? 'var(--surface2)' : 'transparent' }}
                      >
                        <div
                          className="mt-0.5 flex h-7 w-7 flex-none items-center justify-center rounded-[8px]"
                          style={{ background: KIND_COLOR[n.kind] }}
                        >
                          <Icon size={13} color="#fff" aria-hidden="true" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="text-[12.5px] leading-snug text-text2">
                            <strong>{n.who}</strong> {n.action} <span className="font-semibold tabular-nums text-navy">{n.target}</span>
                          </div>
                          <div className="mt-0.5 text-[11px] text-faint">{n.when}</div>
                        </div>
                        {unread && <span aria-hidden="true" className="mt-1.5 h-[7px] w-[7px] flex-none rounded-full bg-navy" />}
                      </button>
                    );
                  })}
                </div>
                <button
                  type="button"
                  role="menuitem"
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
              aria-label="Account menu — Maya Reyes, AP Analyst"
              aria-haspopup="true"
              aria-expanded={activeMenu === 'profile'}
              onClick={() => toggleMenu('profile')}
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
              <div role="menu" aria-label="Account menu" className="pcb-view absolute right-0 top-11 z-30 w-[220px] rounded-[10px] border border-border bg-surface p-[5px] shadow-[0_10px_30px_rgba(16,24,40,.14)]">
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
                <div className="px-2.5 pb-1 pt-2 text-[10.5px] leading-snug text-muted-foreground">
                  Local demo profile — no real authentication or session.
                </div>
                <button
                  type="button"
                  role="menuitem"
                  onClick={handleSignOut}
                  className="pcb-row mt-1 flex h-9 w-full items-center gap-2 rounded-[7px] border-none bg-redsoft px-[11px] text-[13px] font-semibold text-destructive"
                >
                  <LogOut size={15} aria-hidden="true" />
                  Sign out
                </button>
              </div>
            )}
          </div>
        </div>
        </div>
      </div>

      <Toast message={signOutToast} />
    </header>
  );
}
