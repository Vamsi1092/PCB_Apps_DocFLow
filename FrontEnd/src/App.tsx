import { useEffect, useMemo, useState } from 'react';
import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { TopNav } from '@/components/TopNav';
import { Sidebar } from '@/components/Sidebar';
import { useLocalStorage } from '@/hooks/useLocalStorage';
import { SidebarProvider } from '@/hooks/useSidebar';
import { activity } from '@/data';
import DashboardPage from '@/pages/DashboardPage';
import InboxPage from '@/pages/InboxPage';
import WorklistPage from '@/pages/WorklistPage';
import DocumentReviewPage from '@/pages/DocumentReviewPage';
import ApprovalsPage from '@/pages/ApprovalsPage';
import ReportingPage from '@/pages/ReportingPage';
import ActivityPage from '@/pages/ActivityPage';
import AutonomyConfigPage from '@/pages/AutonomyConfigPage';
import SettingsPage from '@/pages/SettingsPage';

export default function App() {
  // Persist the user's explicit choice; when they've never chosen, fall back to
  // the OS-level preference rather than always defaulting to light mode.
  const [dark, setDark] = useLocalStorage<boolean>(
    'docflow.theme.dark',
    () => window.matchMedia('(prefers-color-scheme: dark)').matches,
  );
  // Drives the hamburger-triggered nav panel (see Sidebar.tsx) — hidden
  // (zero-width) by default, no permanent rail. Persists the user's last
  // state, same pattern as the theme toggle above.
  const [sidebarExpanded, setSidebarExpanded] = useLocalStorage<boolean>('docflow.sidebar.expanded', false);
  const sidebar = useMemo(
    () => ({ expanded: sidebarExpanded, toggle: () => setSidebarExpanded((v) => !v) }),
    [sidebarExpanded, setSidebarExpanded],
  );

  // Notification read-state — shared by TopNav's bell button and Sidebar's
  // Profile-dropdown "Notifications" row, so opening either marks the same
  // set read and both badges agree on the unread count.
  const [readIdx, setReadIdx] = useState<Set<number>>(new Set());
  const unreadCount = activity.filter((_, i) => !readIdx.has(i)).length;
  const markAllNotificationsRead = () => setReadIdx(new Set(activity.map((_, i) => i)));

  useEffect(() => {
    document.documentElement.classList.toggle('dark', dark);
  }, [dark]);

  return (
    <BrowserRouter>
      <SidebarProvider value={sidebar}>
      <div className="flex min-h-screen flex-col bg-background text-foreground">
        <TopNav
          dark={dark}
          onToggleDark={() => setDark((v) => !v)}
          unreadCount={unreadCount}
          onMarkNotificationsRead={markAllNotificationsRead}
        />
        {/* Sidebar + main are flex siblings so main reflows as Sidebar's width
            animates (push/resize) — Sidebar is never fixed-position here. */}
        <div className="flex flex-1">
          <Sidebar expanded={sidebarExpanded} />
          <main className="min-w-0 flex-1 px-[22px] pb-[60px] pt-[26px]">
            <div className="mx-auto w-full max-w-[1400px]">
              <Routes>
                <Route path="/" element={<DashboardPage />} />
                <Route path="/inbox" element={<InboxPage />} />
                <Route path="/worklist" element={<WorklistPage />} />
                <Route path="/worklist/:documentId" element={<DocumentReviewPage />} />
                <Route path="/approvals" element={<ApprovalsPage />} />
                <Route path="/reporting" element={<ReportingPage />} />
                <Route path="/activity" element={<ActivityPage />} />
                <Route path="/autonomy" element={<AutonomyConfigPage />} />
                <Route path="/settings" element={<SettingsPage />} />
              </Routes>
            </div>
          </main>
        </div>
      </div>
      </SidebarProvider>
    </BrowserRouter>
  );
}
