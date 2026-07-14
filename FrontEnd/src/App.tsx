import { useEffect, useState } from 'react';
import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { TopNav } from '@/components/TopNav';
import DashboardPage from '@/pages/DashboardPage';
import InboxPage from '@/pages/InboxPage';
import WorklistPage from '@/pages/WorklistPage';
import ExceptionsPage from '@/pages/ExceptionsPage';
import ApprovalsPage from '@/pages/ApprovalsPage';
import ReportingPage from '@/pages/ReportingPage';
import ActivityPage from '@/pages/ActivityPage';
import AutonomyConfigPage from '@/pages/AutonomyConfigPage';
import SettingsPage from '@/pages/SettingsPage';

export default function App() {
  const [dark, setDark] = useState(false);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', dark);
  }, [dark]);

  return (
    <BrowserRouter>
      <div className="flex min-h-screen flex-col bg-background text-foreground">
        <TopNav dark={dark} onToggleDark={() => setDark((v) => !v)} />
        <main className="mx-auto w-full max-w-[1400px] flex-1 px-[22px] pb-[60px] pt-[26px]">
          <Routes>
            <Route path="/" element={<DashboardPage />} />
            <Route path="/inbox" element={<InboxPage />} />
            <Route path="/worklist" element={<WorklistPage />} />
            <Route path="/exceptions" element={<ExceptionsPage />} />
            <Route path="/approvals" element={<ApprovalsPage />} />
            <Route path="/reporting" element={<ReportingPage />} />
            <Route path="/activity" element={<ActivityPage />} />
            <Route path="/autonomy" element={<AutonomyConfigPage />} />
            <Route path="/settings" element={<SettingsPage />} />
          </Routes>
        </main>
      </div>
    </BrowserRouter>
  );
}
