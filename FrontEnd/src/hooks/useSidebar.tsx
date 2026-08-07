import { createContext, useContext, type ReactNode } from 'react';

interface SidebarState {
  expanded: boolean;
  toggle: () => void;
}

/** Sidebar open/closed state. Lives in context rather than props because the
 * toggle button renders inside each page's header row (see SidebarToggle),
 * which is several levels below App.tsx where the state itself is held. */
const SidebarContext = createContext<SidebarState | null>(null);

export function SidebarProvider({ value, children }: { value: SidebarState; children: ReactNode }) {
  return <SidebarContext.Provider value={value}>{children}</SidebarContext.Provider>;
}

export function useSidebar(): SidebarState {
  const ctx = useContext(SidebarContext);
  if (!ctx) throw new Error('useSidebar must be used within a SidebarProvider');
  return ctx;
}
