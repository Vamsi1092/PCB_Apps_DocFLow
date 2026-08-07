import { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Bell, Search } from 'lucide-react';
import { cn } from '@/lib/utils';
import { ThemeToggle } from '@/components/ui/theme-toggle';
import { RED } from '@/lib/theme';
import { supabase } from '@/lib/supabase';
import { AP_DOCUMENT_SELECT, fetchDocumentUiRows, titleCaseDocType, toWorklistRow, UNRESOLVED_SUPPLIER, type ApDocRow, type DocumentUiRow } from '@/lib/documentRow';
import type { WorklistRow } from '@/data';
import logo from '@/assets/jdeai-logo-transparent.png';

const SEARCH_RESULT_LIMIT = 8;

// The current page's title, rendered in the bar so each page doesn't spend a
// heading row on it. Deliberately not Sidebar's TABS labels — those are shorter
// nav names ('Dashboard', 'Autonomy') where these are the page's own title.
const PAGE_TITLES: Record<string, string> = {
  '/': 'Payables Overview',
  '/inbox': 'AP Inbox',
  '/worklist': 'Worklist',
  '/approvals': 'Approvals',
  '/reporting': 'Reporting',
  '/activity': 'Activity',
  '/autonomy': 'Workflow Autonomy',
  '/settings': 'Settings',
};

function pageTitle(pathname: string): string {
  const exact = PAGE_TITLES[pathname];
  if (exact) return exact;
  // The document detail view keeps its own heading (the document's display id,
  // which isn't knowable from the route), so name the section it sits under.
  if (pathname.startsWith('/worklist/')) return 'Document Review';
  return '';
}

interface SearchHit {
  key: string;
  group: string;
  primary: string;
  secondary: string;
  to: string;
  state?: unknown;
}

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
  unreadCount: number;
  onMarkNotificationsRead: () => void;
}

/**
 * Fixed navy bar: logo on the left, current page title beside it, then search +
 * notifications + theme toggle on the right (in that order). Profile/sign-out
 * stays in Sidebar.tsx's footer — the Notifications row there shares the same
 * unread state as the bell button here (both live in App.tsx).
 */
export function TopNav({ dark, onToggleDark, unreadCount, onMarkNotificationsRead }: TopNavProps) {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const title = pageTitle(pathname);
  const containerRef = useRef<HTMLDivElement>(null);
  const [searchOpen, setSearchOpen] = useState(false);

  // Search — reads the same Supabase tables the pages themselves read. Loaded
  // once, lazily, the first time the menu opens.
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

  useEffect(() => {
    if (!searchOpen) return;
    const onMouseDown = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setSearchOpen(false);
      }
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setSearchOpen(false);
    };
    document.addEventListener('mousedown', onMouseDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onMouseDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [searchOpen]);

  useEffect(() => {
    if (!searchOpen) return;
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
  }, [searchOpen, searchLoaded]);

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
    setSearchOpen(false);
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

  const utilBtn = 'flex h-[34px] w-[34px] items-center justify-center rounded-lg border-none bg-white/[.08] text-[#dbe3f4]';

  const openNotifications = () => {
    onMarkNotificationsRead();
    navigate('/activity');
  };

  return (
    <header className="sticky top-0 z-50 bg-navy text-white shadow-[0_1px_0_rgba(255,255,255,.06),0_2px_10px_rgba(12,22,58,.18)]">
      <div className="flex h-[58px] items-stretch">
        {/* Nav toggle is not here — it renders at the top-left of the content
            area via SidebarToggle, inside each page's header row. */}
        {/* w-[180px] deliberately matches Sidebar's expanded width. The logo
            fills that block now that the nav toggle has moved out of it. */}
        <div className="flex w-[180px] flex-none items-center bg-[#0d1524] px-3 shadow-[2px_0_8px_rgba(0,0,0,.12)]">
          <img src={logo} alt="JD'EAI" className="block h-[50px] w-full object-contain" />
        </div>

        <div className="flex min-w-0 flex-1 items-center justify-between gap-3 px-[22px]">
          <h1 className="truncate text-[17px] font-semibold tracking-tight text-white">{title}</h1>

          <div className="flex flex-none items-center gap-3">
          <div ref={containerRef} className="relative">
            <button
              type="button"
              title="Search"
              aria-label="Search"
              aria-haspopup="true"
              aria-expanded={searchOpen}
              onClick={() => setSearchOpen((v) => !v)}
              className={cn('pcb-btn', utilBtn)}
            >
              <Search size={17} />
            </button>
            {searchOpen && (
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
                        <span className="flex-none rounded-full border border-border bg-tint px-2 py-0.5 text-[10px] font-semibold text-navy">
                          {r.group}
                        </span>
                      </button>
                    ))
                  )}
                </div>
              </div>
            )}
          </div>

          <button
            type="button"
            title="Notifications"
            aria-label="Notifications"
            onClick={openNotifications}
            className={cn('pcb-btn relative', utilBtn)}
          >
            <Bell size={17} />
            {unreadCount > 0 && (
              <span className="absolute right-1 top-1 h-2 w-2 rounded-full bg-destructive" aria-hidden="true" />
            )}
          </button>

          <ThemeToggle isDark={dark} onToggle={onToggleDark} />
          </div>
        </div>
      </div>
    </header>
  );
}
