import { useEffect, useRef, useState, type MouseEvent as ReactMouseEvent } from 'react';
import { createPortal } from 'react-dom';
import { Check, UserPlus, X } from 'lucide-react';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { teamMembers, type TeamMember } from '@/data';
import { cn } from '@/lib/utils';

/**
 * Assignee picker for the Worklist "Assigned To" column. Replaces the old
 * read-only dash with an avatar chip that opens a searchable roster of AP team
 * members (see `teamMembers` in data.ts). The menu is rendered through a portal
 * because the DataTable clips its overflow — same reason the Lifecycle popup and
 * Priority tooltip portal out of the table (see WorklistPage).
 *
 * Assignment is client-side only for now (this is the read-only Supabase phase);
 * `onChange` lifts the choice into WorklistPage local state. The current owner
 * from the backend is shown as the initial value, and an unknown name (one not
 * in the roster) still renders a chip with derived initials.
 */

const MENU_W = 244;
const MENU_MAX_H = 320;

function initialsOf(name: string): string {
  const parts = name.replace(/\./g, '').trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

// Resolve a stored name to a roster member, or synthesize a neutral chip for a
// name the roster doesn't know (e.g. a legacy backend owner).
function resolve(name: string | null): TeamMember | null {
  if (!name) return null;
  const found = teamMembers.find((m) => m.name === name);
  if (found) return found;
  return { id: name, name, role: 'Assignee', initials: initialsOf(name), avatar: 'from-[#64748B] to-[#94A3B8]' };
}

function MemberAvatar({ member, size }: { member: TeamMember; size: number }) {
  return (
    <Avatar style={{ height: size, width: size }}>
      <AvatarFallback className={cn('bg-gradient-to-br font-bold text-white', member.avatar)} style={{ fontSize: size * 0.4 }}>
        {member.initials}
      </AvatarFallback>
    </Avatar>
  );
}

interface AssigneePickerProps {
  value: string | null;
  onChange: (name: string | null) => void;
  /** Notifies the parent when the menu opens/closes — the Worklist uses this to
   * suppress its row-hover Document Lifecycle popup while a row is being assigned. */
  onOpenChange?: (open: boolean) => void;
}

export function AssigneePicker({ value, onChange, onOpenChange }: AssigneePickerProps) {
  const [open, setOpenState] = useState(false);
  const [query, setQuery] = useState('');
  const [coords, setCoords] = useState<{ top: number; left: number } | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const setOpen = (next: boolean) => {
    setOpenState(next);
    onOpenChange?.(next);
  };

  const current = resolve(value);

  const place = () => {
    const el = triggerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const left = Math.max(12, Math.min(rect.left, window.innerWidth - MENU_W - 12));
    let top = rect.bottom + 6;
    if (top + MENU_MAX_H > window.innerHeight - 12) top = Math.max(12, rect.top - MENU_MAX_H - 6);
    setCoords({ top, left });
  };

  const openMenu = (e: ReactMouseEvent) => {
    e.stopPropagation();
    place();
    setQuery('');
    setOpen(true);
  };

  useEffect(() => {
    if (!open) return;
    const onDocPointer = (e: MouseEvent) => {
      if (menuRef.current?.contains(e.target as Node) || triggerRef.current?.contains(e.target as Node)) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    // Any scroll/resize invalidates the anchored position — simplest to close.
    const dismiss = () => setOpen(false);
    document.addEventListener('mousedown', onDocPointer);
    document.addEventListener('keydown', onKey);
    window.addEventListener('scroll', dismiss, true);
    window.addEventListener('resize', dismiss);
    return () => {
      document.removeEventListener('mousedown', onDocPointer);
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('scroll', dismiss, true);
      window.removeEventListener('resize', dismiss);
    };
  }, [open]);

  const pick = (name: string | null) => {
    onChange(name);
    setOpen(false);
  };

  const q = query.trim().toLowerCase();
  const filtered = q
    ? teamMembers.filter((m) => m.name.toLowerCase().includes(q) || m.role.toLowerCase().includes(q))
    : teamMembers;

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={openMenu}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={current ? `Assigned to ${current.name} — change` : 'Assign to a team member'}
        className={cn(
          'inline-flex max-w-full items-center gap-1.5 rounded-full py-1 pl-1 pr-2.5 text-left transition-colors',
          current
            ? 'border border-transparent bg-surface2 hover:border-line'
            : 'border border-dashed border-line text-muted-foreground hover:border-navy hover:text-navy',
        )}
      >
        {current ? (
          <>
            <MemberAvatar member={current} size={22} />
            <span className="truncate text-[13px] text-text2">{current.name}</span>
          </>
        ) : (
          <>
            <span className="flex h-[22px] w-[22px] items-center justify-center rounded-full border border-dashed border-line">
              <UserPlus size={12} />
            </span>
            <span className="text-[12.5px] font-medium">Assign</span>
          </>
        )}
      </button>

      {open && coords && createPortal(
        <div
          ref={menuRef}
          role="listbox"
          aria-label="Assign to"
          className="pcb-view fixed z-[220] rounded-xl border border-border bg-surface p-1.5 shadow-[0_12px_34px_rgba(16,24,40,.18)]"
          style={{ top: coords.top, left: coords.left, width: MENU_W }}
          onClick={(e) => e.stopPropagation()}
        >
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search people…"
            className="mb-1 h-8 w-full rounded-lg border border-line bg-surface2 px-2.5 text-[12.5px] text-text2 outline-none placeholder:text-muted-foreground focus:border-navy"
          />
          <div className="max-h-[220px] overflow-y-auto">
            {filtered.map((m) => {
              const selected = m.name === value;
              return (
                <button
                  key={m.id}
                  type="button"
                  role="option"
                  aria-selected={selected}
                  onClick={() => pick(m.name)}
                  className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left hover:bg-surface2"
                >
                  <MemberAvatar member={m} size={28} />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[12.5px] font-medium text-foreground">{m.name}</div>
                    <div className="truncate text-[11px] text-muted-foreground">{m.role}</div>
                  </div>
                  {selected && <Check size={14} className="flex-none text-navy" />}
                </button>
              );
            })}
            {filtered.length === 0 && (
              <div className="px-2 py-3 text-center text-[12px] text-muted-foreground">No matches</div>
            )}
          </div>
          {value && (
            <>
              <div className="my-1 border-t border-border2" />
              <button
                type="button"
                onClick={() => pick(null)}
                className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-[12.5px] text-muted-foreground hover:bg-surface2"
              >
                <span className="flex h-7 w-7 items-center justify-center">
                  <X size={14} />
                </span>
                Unassign
              </button>
            </>
          )}
        </div>,
        document.body,
      )}
    </>
  );
}
