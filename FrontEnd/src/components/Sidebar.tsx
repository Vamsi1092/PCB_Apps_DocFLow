import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { NavLink } from 'react-router-dom';
import {
  Activity, BarChart3, Bot, CheckCircle2, Inbox, LayoutDashboard, ListChecks, LogOut,
  Settings, type LucideIcon,
} from 'lucide-react';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/useToast';
import { Toast } from '@/components/Toast';

interface Tab {
  to: string;
  label: string;
  icon: LucideIcon;
}

export const TABS: Tab[] = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/inbox', label: 'AP Inbox', icon: Inbox },
  { to: '/worklist', label: 'Worklist', icon: ListChecks },
  { to: '/approvals', label: 'Approvals', icon: CheckCircle2 },
  { to: '/reporting', label: 'Reporting', icon: BarChart3 },
  { to: '/activity', label: 'Activity', icon: Activity },
  { to: '/autonomy', label: 'Autonomy', icon: Bot },
  { to: '/settings', label: 'Settings', icon: Settings },
];

// Demo identity shown in the Profile dropdown — same person as
// SettingsPage.tsx's INITIAL_TEAM 'u1' entry, reused here for consistency
// rather than inventing a separate placeholder.
const CURRENT_USER = { name: 'Maya Reyes', email: 'maya.reyes@acmecorp.com', initials: 'MR' };

interface SidebarProps {
  expanded: boolean;
}

/**
 * Hamburger-triggered nav panel that pushes/resizes the content area — never
 * a modal overlay, no backdrop, no fixed positioning. It's a real flex
 * sibling of <main> (see App.tsx), so <main> reflows beside it via ordinary
 * flexbox as its width animates; the page stays fully visible, scrollable,
 * and clickable at all times, collapsed or expanded.
 *
 * Collapsed = zero width — nothing shown, no permanent icon rail. Expanded =
 * 180px, deliberately matching TopNav's logo-bar width exactly.
 *
 * Footer holds the Profile menu (name/email header, Log out) — Search, the
 * theme toggle, and Notifications live in TopNav's top bar instead.
 */
export function Sidebar({ expanded }: SidebarProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [profileOpen, setProfileOpen] = useState(false);
  // Profile's dropdown is portaled to document.body (the aside has
  // overflow-hidden, needed for the width-collapse animation, which would
  // otherwise clip a panel wider than the 180px sidebar) — so it needs
  // fixed-position coordinates computed from the trigger's own rect.
  const [menuAnchor, setMenuAnchor] = useState<{ left: number; bottom: number } | null>(null);
  const menuPanelRef = useRef<HTMLDivElement>(null);

  // Sign out — local UI action only, never a real session invalidation.
  const { toast: signOutToast, showToast: showSignOutToast } = useToast(3000);

  useEffect(() => {
    if (!profileOpen) return;
    const onMouseDown = (e: MouseEvent) => {
      const target = e.target as Node;
      const insideTrigger = containerRef.current?.contains(target);
      const insidePanel = menuPanelRef.current?.contains(target);
      if (!insideTrigger && !insidePanel) {
        setProfileOpen(false);
      }
    };
    document.addEventListener('mousedown', onMouseDown);
    return () => document.removeEventListener('mousedown', onMouseDown);
  }, [profileOpen]);

  // Only closes the profile dropdown — deliberately does NOT also collapse
  // the whole sidebar on a bare Escape. TopNav's search popover has its own,
  // independent Escape-close listener now that search lives there instead of
  // here; a shared "Escape collapses the sidebar" fallback would fire for
  // both listeners on every Escape press, unintentionally collapsing the
  // sidebar just from closing the search popover.
  useEffect(() => {
    if (!profileOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setProfileOpen(false);
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [profileOpen]);

  const toggleProfile = (el: HTMLElement) => {
    setProfileOpen((open) => {
      if (open) return false;
      const rect = el.getBoundingClientRect();
      setMenuAnchor({ left: rect.right + 8, bottom: window.innerHeight - rect.bottom });
      return true;
    });
  };

  const handleSignOut = () => {
    setProfileOpen(false);
    showSignOutToast('Signed out — see you soon (local UI only, no session was ended)');
  };

  return (
    <aside
      role="navigation"
      aria-label="Main navigation"
      aria-hidden={!expanded}
      className={cn(
        'sticky top-[58px] flex h-[calc(100vh-58px)] flex-none flex-col overflow-hidden bg-navy text-white',
        'transition-[width] duration-200 ease-out',
        expanded ? 'w-[180px]' : 'w-0',
      )}
    >
      <nav className="flex w-[180px] flex-1 flex-col gap-0.5 overflow-y-auto p-3">
        {TABS.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            end={to === '/'}
            tabIndex={expanded ? undefined : -1}
            className={({ isActive }) =>
              cn(
                'pcb-tab flex items-center gap-3 rounded-lg px-3 py-2.5 text-[13px] tracking-normal transition-all',
                isActive ? 'bg-white/[.16] font-medium text-white' : 'font-normal text-white/[.68]',
              )
            }
          >
            <Icon size={18} className="flex-none" aria-hidden="true" />
            <span className="truncate">{label}</span>
          </NavLink>
        ))}
      </nav>

      <div ref={containerRef} className="flex w-[180px] flex-none flex-col gap-0.5 border-t border-white/10 p-3">
        <div className="relative">
          <button
            type="button"
            tabIndex={expanded ? undefined : -1}
            aria-label={`Account menu — ${CURRENT_USER.name}`}
            aria-haspopup="true"
            aria-expanded={profileOpen}
            onClick={(e) => toggleProfile(e.currentTarget)}
            className="flex w-full items-center gap-3 rounded-lg border-none bg-transparent px-3 py-2 text-left"
          >
            <Avatar className="h-8 w-8 flex-none">
              <AvatarFallback className="bg-gradient-to-br from-navy2 to-[#6B84C4] text-[12.5px] font-bold tracking-[.02em] text-white">
                {CURRENT_USER.initials}
              </AvatarFallback>
            </Avatar>
            <div className="min-w-0 leading-[1.15]">
              <div className="truncate text-[12.5px] font-semibold text-white">{CURRENT_USER.name}</div>
              <div className="truncate text-[11px] text-[#9fb0d6]">{CURRENT_USER.email}</div>
            </div>
          </button>
          {profileOpen && menuAnchor && createPortal(
            <div
              ref={menuPanelRef}
              role="menu"
              aria-label="Account menu"
              className="pcb-view fixed z-[200] w-[240px] rounded-[10px] border border-border bg-surface p-[5px] shadow-[0_10px_30px_rgba(16,24,40,.14)]"
              style={{ left: menuAnchor.left, bottom: menuAnchor.bottom }}
            >
              <div className="flex items-center gap-2.5 border-b border-border2 px-2.5 py-2.5">
                <Avatar className="h-9 w-9">
                  <AvatarFallback className="bg-gradient-to-br from-navy2 to-[#6B84C4] text-[12.5px] font-bold tracking-[.02em] text-white">
                    {CURRENT_USER.initials}
                  </AvatarFallback>
                </Avatar>
                <div className="min-w-0 leading-[1.15]">
                  <div className="truncate text-[13px] font-semibold text-foreground">{CURRENT_USER.name}</div>
                  <div className="truncate text-[11px] text-muted-foreground">{CURRENT_USER.email}</div>
                </div>
              </div>
              <button
                type="button"
                role="menuitem"
                onClick={handleSignOut}
                className="pcb-row mt-1 flex h-9 w-full items-center gap-2 rounded-[7px] border-none bg-redsoft px-[11px] text-[13px] font-semibold text-destructive"
              >
                <LogOut size={15} aria-hidden="true" />
                Log out
              </button>
            </div>,
            document.body,
          )}
        </div>
      </div>

      <Toast message={signOutToast} />
    </aside>
  );
}
