import { Menu } from 'lucide-react';
import { useSidebar } from '@/hooks/useSidebar';

/**
 * Hamburger that opens/closes the nav panel. Rendered at the left of each
 * page's header row (not in TopNav) so it sits at the top-left of the content
 * area, holding the same spot whether the sidebar is open or closed.
 */
export function SidebarToggle() {
  const { expanded, toggle } = useSidebar();
  return (
    <button
      type="button"
      title="Toggle navigation"
      aria-label={expanded ? 'Collapse navigation menu' : 'Expand navigation menu'}
      aria-expanded={expanded}
      onClick={toggle}
      className="pcb-btn flex h-9 w-9 flex-none items-center justify-center rounded-lg border border-line bg-surface text-text2"
    >
      <Menu size={18} />
    </button>
  );
}
