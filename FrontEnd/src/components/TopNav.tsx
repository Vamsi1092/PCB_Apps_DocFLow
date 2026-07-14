import { NavLink } from 'react-router-dom';
import { Bell, Moon, Search, Sun } from 'lucide-react';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { cn } from '@/lib/utils';
import logo from '@/assets/pcb-logo.png';

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

interface TopNavProps {
  dark: boolean;
  onToggleDark: () => void;
}

/** Fixed navy bar: logo, horizontal tabs, theme toggle + utility icons, avatar. */
export function TopNav({ dark, onToggleDark }: TopNavProps) {
  const utilBtn = 'flex h-[34px] w-[34px] items-center justify-center rounded-lg border-none bg-white/[.08] text-[#dbe3f4]';

  return (
    <header className="sticky top-0 z-50 bg-navy text-white shadow-[0_1px_0_rgba(255,255,255,.06),0_2px_10px_rgba(12,22,58,.18)]">
      <div className="mx-auto flex h-[58px] max-w-[1400px] items-center gap-5 px-[22px]">
        <div className="flex flex-none items-center">
          <div className="flex items-center rounded-lg bg-surface px-[9px] py-[5px] shadow-[0_1px_2px_rgba(0,0,0,.25)]">
            <img src={logo} alt="PCB Apps" className="block h-[26px] w-auto" />
          </div>
        </div>

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

        <div className="flex flex-none items-center gap-1.5">
          <button type="button" title="Toggle theme" onClick={onToggleDark} className={cn('pcb-btn', utilBtn)}>
            {dark ? <Sun size={17} /> : <Moon size={17} />}
          </button>
          <button type="button" title="Search" className={cn('pcb-btn', utilBtn)}>
            <Search size={17} />
          </button>
          <button type="button" title="Alerts" className={cn('pcb-btn relative', utilBtn)}>
            <Bell size={17} />
            <span className="absolute right-[7px] top-1.5 h-[7px] w-[7px] rounded-full bg-destructive shadow-[0_0_0_2px_var(--navy)]" />
          </button>
          <div className="mx-1 h-6 w-px bg-white/[.16]" />
          <div className="flex cursor-pointer items-center gap-[9px]">
            <Avatar className="h-8 w-8">
              <AvatarFallback className="bg-gradient-to-br from-navy2 to-[#6B84C4] text-[12.5px] font-bold tracking-[.02em] text-white">
                MR
              </AvatarFallback>
            </Avatar>
            <div className="leading-[1.15]">
              <div className="text-[12.5px] font-semibold">Maya Reyes</div>
              <div className="text-[11px] text-[#9fb0d6]">AP Analyst</div>
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}
