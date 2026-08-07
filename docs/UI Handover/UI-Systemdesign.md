# UI Handover — DOCFLOW

This document describes the UI system in this repository as a **reusable design system**, independent of the specific AP-automation product it currently powers. Every code example is real, copy-pasted from this codebase — file paths are given so you can verify or extend from source.

---

## 1. Stack Summary

| Concern | Choice |
|---|---|
| Framework | React 18 (`react` / `react-dom` `^18.3.1`), function components + hooks only, no class components |
| Language | TypeScript `^5.7.2`, strict path alias `@/*` → `src/*` |
| Styling | Tailwind CSS v3 (`^3.4.17`) utility classes, no CSS Modules/styled-components/SCSS/CSS-in-JS |
| Component conventions | shadcn/ui conventions — primitives copied into `src/components/ui/`, built on Radix UI primitives (`@radix-ui/react-avatar`), rather than a bundled kit (no MUI/Chakra/AntD) |
| State management | One React Context (`SidebarProvider`/`useSidebar`, purely UI-chrome state — see §5) plus local `useState`/`useEffect` everywhere else; two custom hooks (`useLocalStorage`, `useToast`). Still no Redux/Zustand/React Query — no data-fetching state lives in context, only the sidebar's open/closed flag |
| Routing | `react-router-dom` `^6.28.0` — `BrowserRouter` + flat `Routes`/`Route` list, no nested layouts |
| Build tool | Vite `^6.0.5` + `@vitejs/plugin-react`, `tsc -b && vite build` for production builds |
| Data layer | `@supabase/supabase-js` (`^2.110.8`) queried directly from pages/components — no backend API layer in the frontend |
| Animation | `framer-motion` (`^12.43.0`) — used narrowly, for one hand-built component (`BorderTrail`, see §4) that animates along an element's border; nothing else in the app depends on it. Everything else animates via plain CSS transitions/keyframes in `tokens.css` |

---

## 2. Folder Structure

```
src/
├── App.tsx              # Root shell: router + persistent top nav + route table
├── main.tsx              # Vite/React entry point, mounts <App/>, imports global CSS
├── data.ts               # Static/demo data + shared domain types (swap for real fixtures per project)
├── assets/               # Static images (logo, etc.)
├── components/           # Flat folder of reusable, page-agnostic components
│   └── ui/               # shadcn-style primitives (copied source, not npm-installed)
├── hooks/                # Small reusable hooks (localStorage-backed state, toast timer, sidebar context)
├── lib/                  # Utilities: className merge helper, theme constants, data client, domain shaping
├── pages/                # One top-level component per route, no nested folders
└── styles/
    └── tokens.css        # Single global stylesheet: Tailwind directives + all design tokens + keyframes
```

Notes for reuse:
- There is **no** `layout/`, `common/`, `features/`, or `context/` folder — this is a small/medium app scale. If the new project is larger, introduce `components/layout/` for shells and `features/<domain>/` for domain-specific screens; keep `components/` and `components/ui/` as-is for the generic layer.
- `lib/` mixes generic utilities (`utils.ts`, `theme.ts`) with domain-specific data shaping (`documentRow.ts`, `lifecycle.ts`, `matchingDemo.ts`, `supabase.ts`). When porting, keep `utils.ts` + `theme.ts`, drop or replace the domain-specific files.

---

## 3. Design Tokens

All tokens live in **one file**: `src/styles/tokens.css`, defined as CSS custom properties on `:root` (light) and `.dark` (dark), then bridged into Tailwind via `tailwind.config.ts` so they're usable as utility classes (`bg-surface`, `text-navy`, `border-border`, etc.) as well as raw `var(--token)` in inline styles.

### Colors

| Token | Light | Dark | CSS var | Typical usage |
|---|---|---|---|---|
| Brand primary | `#1E3A8A` | (same) | `--navy` | Primary text/accent color, active nav tab, primary buttons |
| Brand secondary | `#3B5BA9` | `#5b7bc9` | `--navy2` | Gradient accents (avatars), secondary emphasis |
| Page background | `#F8F9FB` | `#0d1524` | `--bg` → `--background` | `<body>` background |
| Surface (card/panel) | `#ffffff` | `#161f30` | `--surface` → `--card` | Cards, panels, table background |
| Surface, subtle | `#fafbfd` | `#1b2536` | `--surface2` | Zebra-striped rows, muted backgrounds |
| Surface, sunken | `#f2f5fb` | `#212d42` | `--surface3` | Row hover state |
| Border, default | `#e6e9ef` | `#2a3750` | `--border` | Card/table borders |
| Border, faint | `#eef1f6` | `#243149` | `--border2` | Divider lines inside popovers |
| Border, faintest | `#f3f5f9` | `#1f2a3e` | `--borderf` | Table row dividers |
| Line | `#d7dce6` | `#33405a` | `--line` | Input borders, dashed borders |
| Text, primary | `#1a2233` | `#e9eef6` | `--text` → `--foreground` | Body text |
| Text, secondary | `#334155` | `#c8d1df` | `--text2` | Secondary emphasis text |
| Text, tertiary | `#475569` | `#b1bccd` | `--text3` | De-emphasized labels |
| Text, muted | `#64748b` | `#8a98ad` | `--muted` → `--muted-foreground` | Captions, metadata |
| Text, faint | `#94a3b8` | `#6b7a91` | `--faint` | Placeholder/disabled text |
| Tint (brand wash) | `#eef2fb` | `#1e2b45` | `--tint` → `--accent` | Selected-state background, icon chips |
| Success wash | `#F0FDF4` | `#123021` | `--greensoft` | Success badge background |
| Danger wash | `#FEF2F2` | `#3a1d21` | `--redsoft` | Error/critical badge background |
| Success (semantic, theme-fixed) | `#16A34A` | (same) | `--green` (also exported as JS `GREEN` in `src/lib/theme.ts`) | Success text/icon — color always means "good," never remapped per theme |
| Danger (semantic, theme-fixed) | `#DC2626` | (same) | `--red` (also exported as JS `RED` in `src/lib/theme.ts`) | Error/critical text/icon |

shadcn semantic aliases (defined in `tokens.css`, all pointing at the raw tokens above — use these names in components you copy from shadcn's registry): `--background`, `--foreground`, `--card`/`--card-foreground`, `--popover`/`--popover-foreground`, `--primary`/`--primary-foreground`, `--secondary`/`--secondary-foreground`, `--muted-bg`/`--muted-foreground`, `--accent`/`--accent-foreground`, `--destructive`/`--destructive-foreground`, `--success`/`--success-foreground`, `--input`, `--ring`.

A 4-step **severity ramp** (single hue intensity, not 4 different hues) is defined separately in `src/lib/theme.ts` and is a good pattern to reuse for any priority/severity UI:
```ts
// src/lib/theme.ts
const SEVERITY_COLORS: Record<Severity, string> = {
  critical: '#DC2626',
  high: '#3B5BA9',
  medium: '#6B84C4',
  low: '#A9B8DA',
};
```

### Typography

No named type scale exists in `tailwind.config.ts` — only the font family is customized:
```ts
// tailwind.config.ts
fontFamily: { sans: ['Archivo', 'system-ui', '-apple-system', 'sans-serif'] }
```
Loaded via Google Fonts in `index.html`:
```html
<link href="https://fonts.googleapis.com/css2?family=Archivo:wght@400;500;600;700;800&display=swap" rel="stylesheet">
```
Every size is an arbitrary Tailwind bracket value chosen per element rather than a shared scale. The **de facto scale actually in use** across the app (observed, not declared) — treat this table as the scale to standardize into real Tailwind config if porting to a new project:

| Role | Size | Weight | Example |
|---|---|---|---|
| Page/KPI hero number | `text-[27px]`, `font-extrabold`, `tracking-[-.03em]` | 800 | `src/components/KpiCard.tsx` value |
| Section/card title | `text-[14.5px]`–`text-[16px]`, `font-bold` | 700 | popover/card headers |
| Body | `text-[13px]`–`text-[13.5px]`, `font-normal`/`font-medium` | 400–500 | table cell content |
| Label/caption | `text-[11px]`–`text-[12.5px]`, `font-semibold`, often `uppercase tracking-[.04em]`–`[.06em]` | 600 | KPI label, section eyebrow, badge text |
| Micro/meta | `text-[8px]`–`text-[10px]` | 400–700 | timestamps, popover footnotes |
| Nav tabs | `text-[13px]`, `uppercase`, `tracking-[.03em]`, weight 500/700 by active state | — | `src/components/Sidebar.tsx` (moved here from `TopNav.tsx` when the horizontal tab bar became the persistent left nav — see §5) |

No explicit `line-height` scale — relies on Tailwind defaults (`leading-none`, `leading-snug`, `leading-tight`, `leading-relaxed` used situationally, e.g. `leading-none` on the KPI hero number, `leading-relaxed` on body paragraphs).

### Spacing scale

No custom spacing scale in `tailwind.config.ts` — **default Tailwind spacing** is used, supplemented heavily by arbitrary bracket values chosen per component (`px-[22px]`, `gap-[9px]`, `p-[15px]`). If formalizing this for a new project, the most frequently repeated values observed are: `4px`/`5px`/`6px` (icon-to-label gaps), `9px`–`11px` (chip/button internal padding), `15px`–`22px` (card padding, page gutters), `26px`/`60px` (page vertical rhythm in `App.tsx`'s `<main>`).

### Border radius scale

Formally tokenized (the one dimension that *is* a real scale):
```ts
// tokens.css
--radius: 0.75rem;

// tailwind.config.ts
borderRadius: {
  lg: 'var(--radius)',                 // 12px
  md: 'calc(var(--radius) - 2px)',     // 10px
  sm: 'calc(var(--radius) - 4px)',     // 8px
}
```
Also used ad hoc outside this scale: `rounded-full` (pills/avatars/dots), `rounded-2xl` (popup panels), one-off `rounded-[7px]`/`rounded-[9px]`/`rounded-[10px]` values on menu items.

### Shadow levels

No `boxShadow` scale in `tailwind.config.ts` — every shadow is an inline arbitrary value. The **de facto 3-level system** observed in practice:

| Level | Value | Usage |
|---|---|---|
| Resting card | `shadow-[0_1px_2px_rgba(16,24,40,.04)]` | Cards, tables, KPI tiles at rest |
| Raised/hover | `shadow-[0_6px_18px_rgba(16,24,40,.10)]` (paired with `translateY(-2px)` via `.pcb-lift`) | Card hover lift |
| Popover/overlay | `shadow-[0_10px_30px_rgba(16,24,40,.14)]` to `shadow-[0_14px_34px_rgba(0,0,0,.35)]` | Dropdown menus, popups, toasts |

**Hover-affordance exception:** `.pcb-node` (the Dashboard Document Pipeline's step circles, `src/styles/tokens.css`) deliberately does **not** use the scale-transform hover convention (`.pcb-lift`'s `translateY` + shadow, or a plain `scale()`) — its connector lines are pixel-calibrated to the circle's static box size, so scaling the circle on hover used to visibly detach the lines from its edge. It uses a glow treatment instead (`box-shadow: 0 0 0 4px rgba(30,58,138,.18), 0 4px 10px rgba(30,58,138,.35)` + `filter: brightness(1.08)`) that still reads as "lit up" without changing geometry. Reach for this same exception — a non-geometry-changing hover cue — for any future hover target whose neighbors are positioned relative to its exact, unchanging box size.

---

## 4. Component Library

### `DataTable<T>` — generic sortable data-grid pattern
**Path:** `src/components/DataTable.tsx`
**Purpose:** Generic, type-safe, sortable table for any row shape. Handles zebra striping, sortable-column headers, responsive column hiding, and optional row-level hover hooks — without knowing anything about the domain data it renders.
**Props:**
```ts
interface DataTableColumn<T> {
  key: string;
  label: string;
  align?: 'left' | 'right' | 'center';
  sortable?: boolean;
  cell: (row: T) => ReactNode;
  hideBelow?: 'sm' | 'md' | 'lg'; // hide this column below a breakpoint, stays reachable via horizontal scroll
}
interface DataTableProps<T> {
  columns: DataTableColumn<T>[];
  rows: (T & { _key?: string })[];
  sort?: { col: string; dir: 'asc' | 'desc' };
  onSort?: (col: string) => void;
  minWidth?: number; // default 840
  onRowMouseEnter?: (row: T, e: MouseEvent<HTMLTableRowElement>) => void;
  onRowMouseLeave?: (row: T) => void;
}
```
**Variants:** driven entirely by the `columns` array you pass in (per-column `align`/`sortable`/`hideBelow`) — the component itself has no fixed variant prop.
**Example usage:**
```tsx
// src/pages/WorklistPage.tsx
const columns: DataTableColumn<WorklistRow>[] = [
  { key: 'display_id', label: 'Preview', sortable: true, cell: (r) => <Link to={`/worklist/${r.id}`}>{r.display_id}</Link> },
  { key: 'supplier', label: 'Supplier', sortable: true, cell: (r) => <span>{r.supplier}</span> },
  { key: 'amount', label: 'Amount', align: 'right', sortable: true, cell: (r) => <span>{fmtMoney(r.amount)}</span> },
];

<DataTable
  columns={columns}
  rows={displayRows}
  sort={{ col: sortCol, dir: sortDir }}
  onSort={onSort}
  minWidth={1650}
/>
```
**Dos:** keep `cell` renderers presentational only (formatting/links), do domain logic (filtering/sorting comparators) in the parent page. Use `hideBelow` for lower-priority columns on responsive layouts instead of removing them outright.
**Don'ts:** don't rely on row-level `onMouseEnter`/`onMouseLeave` for interactions scoped to one column (a `<tr>`'s mouseenter only fires once per row-entry, not per-cell) — attach the handler directly to that column's `cell` content instead, the way the Priority column's tooltip trigger does.

---

### `KpiCard` — metric tile
**Path:** `src/components/KpiCard.tsx`
**Purpose:** Compact metric card: icon, big number, label, trend indicator.
**Props:**
```ts
type KpiAccent = 'default' | 'red' | 'green';
interface KpiCardProps {
  icon: LucideIcon;
  value: string;
  label: string;
  trend: string;      // e.g. "+12%", "-3", or "Not available"
  accent?: KpiAccent;  // default = brand/neutral, red = needs attention, green = performing well
  onClick?: () => void;
}
```
**Variants:** `accent` = `'default' | 'red' | 'green'` — drives border color, icon background, value color, and trend color/weight as one coordinated set (see `ACCENTS` map in source).
**Example usage:**
```tsx
// src/pages/DashboardPage.tsx
<KpiCard
  key={k.label}
  icon={k.icon}
  value={k.value}
  label={k.label}
  trend={k.trend}
  accent={k.accent}
  onClick={() => navigate(k.to, k.navState ? { state: k.navState } : undefined)}
/>
```
**Dos:** pass a `trend` string with a leading `+`/`-`/`−` when it represents real directional movement — the component auto-detects a digit and renders an arrow; pass non-numeric text (e.g. "Not available") to suppress the arrow and render it in muted gray automatically.
**Don'ts:** don't invent a 4th accent — the color-meaning contract (`default`/`red`/`green`) is intentionally small so red/green always mean the same thing app-wide.

---

### `SeverityBadge` — fixed-enum status pill
**Path:** `src/components/SeverityBadge.tsx`
**Purpose:** Renders one of a closed set of severity levels as a colored dot + label pill.
**Props:**
```ts
type Severity = 'critical' | 'high' | 'medium' | 'low'; // src/lib/theme.ts
interface SeverityBadgeProps { severity: Severity; className?: string; }
```
**Variants:** exactly the 4 `Severity` values — `critical` gets a red badge, all others render neutral (dot color still varies via `sevColor()`, but background/text stays neutral) so red is reserved for "needs action now."
**Example usage:**
```tsx
// src/pages/WorklistPage.tsx
<SeverityBadge severity={r.priority} />
```
**Dos:** use this whenever the value is a closed severity/priority enum.
**Don'ts:** don't use this for arbitrary/open-ended status strings — use `StatusPill` instead (see next).

---

### `StatusPill` — open-ended color-driven pill
**Path:** `src/components/StatusPill.tsx`
**Purpose:** The generic counterpart to `SeverityBadge` — same visual shape (dot + label pill), but every color is passed in by the caller, so it works for any status/tag vocabulary a page defines for itself.
**Props:**
```ts
interface StatusPillProps {
  label: string;
  color: string;
  border: string;
  background: string;
  dotColor?: string;
  dot?: boolean;      // default true
  className?: string;
}
```
**Variants:** none built-in — the caller supplies the full color set per status value it defines.
**Example usage:**
```tsx
// src/pages/DocumentReviewPage.tsx
<StatusPill
  label={`${failedCount} failed check${failedCount === 1 ? '' : 's'}`}
  color={failedCount > 0 ? RED : GREEN}
  border={failedCount > 0 ? '#f3c0c0' : '#bfe3c9'}
  background={failedCount > 0 ? 'var(--redsoft)' : 'var(--greensoft)'}
  dotColor={failedCount > 0 ? RED : GREEN}
/>
```
**Dos:** centralize each page's own status→color mapping into one lookup object near the top of the file (don't inline the same ternary at every call site).
**Don'ts:** don't reach for this when the value is a fixed, app-wide severity enum — use `SeverityBadge` there so the color contract stays centralized in one place (`lib/theme.ts`) instead of re-declared per page.

---

### `Toast` + `useToast` — local (per-page) toast notification
**Paths:** `src/components/Toast.tsx`, `src/hooks/useToast.ts`
**Purpose:** A single-message, auto-dismissing toast. Deliberately **not global** — each page/component that needs one calls the hook locally, replacing what the codebase notes were "4 near-duplicate toast implementations."
**Props/interface:**
```ts
// useToast.ts
function useToast(duration = 2600): { toast: string | null; showToast: (text: string, overrideDuration?: number) => void };

// Toast.tsx
function Toast({ message }: { message: string | null }): JSX.Element | null;
```
**Variants:** none — one visual style; `duration`/`overrideDuration` control timing only.
**Example usage:**
```tsx
// src/pages/ApprovalsPage.tsx
const { toast, showToast } = useToast();
// ...
showToast('Approved — routed to posting.');
// ...
<Toast message={toast} />
```
**Dos:** call `useToast()` once per component that needs it; render `<Toast message={toast} />` once, anywhere in that component's tree (it's `fixed`-positioned).
**Don'ts:** don't build a second global toast/notification store — this hook-per-consumer pattern is the established convention here specifically to avoid that.

---

### `AssigneePicker` — searchable roster picker with portal-rendered menu
**Path:** `src/components/AssigneePicker.tsx`
**Purpose:** Avatar-chip trigger that opens a searchable list of people, rendered through a React portal (`createPortal(..., document.body)`) so it can escape an `overflow: hidden`/clipped ancestor (e.g. a table cell) — a reusable pattern for **any** in-table popover/dropdown, not just assignee pickers.
**Props:**
```ts
interface AssigneePickerProps {
  value: string | null;
  onChange: (name: string | null) => void;
  onOpenChange?: (open: boolean) => void; // notify parent so it can suppress a competing row-hover behavior while open
}
```
**Variants:** none — single behavior; renders either an "Assign" placeholder chip or a resolved-member chip depending on `value`.
**Example usage:**
```tsx
// src/pages/WorklistPage.tsx
<AssigneePicker
  value={assigneeOf(r)}
  onChange={(name) => setAssignments((prev) => ({ ...prev, [r.id]: name }))}
  onOpenChange={onAssignOpenChange}
/>
```
**Dos:** reuse the "trigger button + `getBoundingClientRect()`-positioned portal menu, closed on outside-click/Escape/scroll/resize" shape (lines ~72–108 of the source) for any other clipped-container dropdown.
**Don'ts:** don't skip `onOpenChange` if this picker lives inside a row that also has its own hover-triggered popup — without it, opening the picker and hovering the row can visually collide.

---

### `DocumentLifecyclePopup` — domain-specific hover card (generalize the pattern, not the content)
**Path:** `src/components/DocumentLifecyclePopup.tsx`
**Purpose:** the concrete implementation is domain-specific (invoice/PO/GRN chain), but the *pattern* — a rich, portal-free hover popup anchored to a triggering cell, with staggered entrance animation and an expand/collapse per sub-section — is a reusable "detail-on-hover card" pattern for any multi-stage/timeline data.
**Props (for reference, not meant to be reused verbatim outside this domain):**
```ts
interface DocumentLifecyclePopupProps {
  transactionKey: string | null;
  supplier: string | null;
  stages: LifecycleStageRow[] | null; // null = loading, [] = no chain
  loadFailed: boolean;
  matchType: WorklistMatch['match_type'];
  matchStatus: WorklistMatch['match_status'];
  failedCheckCount: number | null;
  hoveredStage: LifecycleStageName | null;
  invoiceAmount: number | null; invoiceCurrency: string | null;
  invoiceDocRef: string | null; invoiceCreatedAt: string | null;
  onMouseEnter: () => void; onMouseLeave: () => void;
}
```
**Variants:** internal `MatchBadge` tones — `'matched' | 'variance' | 'neutral'` — a good 3-state pattern to reuse for any pass/fail/pending indicator.
**Example usage (trigger wiring, generalizable):**
```tsx
// src/pages/WorklistPage.tsx — hover/focus trigger scoped to ONE column,
// not the whole row, so the popup only opens from where it's semantically anchored:
<span
  tabIndex={0}
  onMouseEnter={(e) => openLifecycle(row, e.currentTarget)}
  onFocus={(e) => openLifecycle(row, e.currentTarget)}
  onMouseLeave={scheduleLifecycleHide}
  onBlur={scheduleLifecycleHide}
>
  {row.doc_ref}
</span>
```
**Dos:** if reusing the *pattern* (not this exact component) for a different domain, keep the loading/`null`/empty/error branches explicit the way this component does (`stages === null` → loading, `stages.length === 0` → empty, `loadFailed` → error) rather than collapsing them into one "no data" state.
**Don'ts:** don't wire this kind of popup to whole-row hover if it's conceptually tied to one column — anchor the trigger to that column's cell element directly (see Dos/Don'ts on `DataTable` above for why).

**Animation classes**: the panel/step/connector entrance and match-glow animations (`.flow-panel`, `.flow-step`, `.flow-connector-fill`, `.flow-pulse`, `.flow-glow`, keyframed as `flowPanelIn`/`flowStepIn`/`flowConnectorDraw`/`flowPulseDown`/`flowMatchGlow`) live in `src/styles/tokens.css` under a `/* Worklist document-flow overlay */` comment — a naming holdover from the predecessor `DocumentFlowOverlay.tsx` component this popup replaced. That predecessor file is gone; these classes are **not** dead leftovers — they're the actual, live animation system this component uses today. All respect `prefers-reduced-motion: reduce` (durations collapse to `.01ms`, the two looping glow/pulse animations are disabled outright).

---

### shadcn primitives — `Avatar`, `Table`
**Paths:** `src/components/ui/avatar.tsx`, `src/components/ui/table.tsx`
**Purpose:** Base building blocks copied from the shadcn/ui registry (not installed as a package) — `Avatar`/`AvatarImage`/`AvatarFallback` wraps `@radix-ui/react-avatar`; `Table`/`TableHeader`/`TableBody`/`TableRow`/`TableHead`/`TableCell`/`TableCaption` are plain semantic HTML wrappers with Tailwind classes and `forwardRef`.
**Props:** standard `React.ComponentPropsWithoutRef`/`HTMLAttributes` passthrough plus `className` (merged via `cn()`), per shadcn convention.
**Variants:** none beyond what `className` overrides allow.
**Example usage:**
```tsx
// src/components/AssigneePicker.tsx
<Avatar style={{ height: size, width: size }}>
  <AvatarFallback className="bg-gradient-to-br font-bold text-white ...">{member.initials}</AvatarFallback>
</Avatar>
```
**Dos:** when you need a new shadcn primitive (Dialog, Popover, DropdownMenu, etc.), copy it into `src/components/ui/` the same way — don't add a different UI kit alongside it.
**Don'ts:** don't hand-edit these files beyond what shadcn's own CLI would generate — keep them as a thin, swappable base layer; put app-specific styling in the components that consume them.

---

### `ThemeToggle` — pill-style light/dark switch
**Path:** `src/components/ui/theme-toggle.tsx`
**Purpose:** A hand-built (not shadcn-registry-sourced) toggle switch for light/dark mode — a `w-16 h-8` rounded pill with a sliding `Sun`/`Moon` icon knob, now used in `TopNav.tsx` in place of the plain icon button the top bar used to have.
**Props:**
```ts
interface ThemeToggleProps {
  isDark: boolean;
  onToggle: () => void;
  className?: string;
  tabIndex?: number;
}
```
**Variants:** none — purely controlled by `isDark`; the knob slides between the two ends and swaps which icon is fully opaque vs. dimmed.
**Example usage:**
```tsx
// src/components/TopNav.tsx
<ThemeToggle isDark={dark} onToggle={onToggleDark} />
```
**Dos:** keep it fully controlled (`isDark`/`onToggle` from the parent, same as the rest of this app's dark-mode wiring) rather than giving it its own internal state — `App.tsx` is the single source of truth for the theme, persisted via `useLocalStorage`.
**Don'ts:** don't wire a second, independent dark-mode boolean anywhere else in the tree — every dark-mode-aware control in this app reads/writes the one `dark` state lifted to `App.tsx`.

---

### `useSidebar` / `SidebarProvider` — sidebar open/closed state via context
**Path:** `src/hooks/useSidebar.tsx`
**Purpose:** Holds the nav panel's `expanded` boolean and its `toggle()` function in a React Context instead of prop-drilling, because the toggle *button* now renders inside each page's own header row (`SidebarToggle`, below) — several component levels below `App.tsx`, where the state itself is still held (persisted via `useLocalStorage`, alongside `Sidebar` which still receives `expanded` as a direct prop, not from context, since it's a flex sibling of `App.tsx`'s own JSX). This is the one piece of cross-cutting UI state in the app that isn't just local `useState`; nothing else uses context (see §1).
**Interface:**
```ts
// src/hooks/useSidebar.tsx
interface SidebarState { expanded: boolean; toggle: () => void; }
function SidebarProvider({ value, children }: { value: SidebarState; children: ReactNode }): JSX.Element;
function useSidebar(): SidebarState; // throws if called outside a SidebarProvider
```
**Example usage:**
```tsx
// src/App.tsx
const [sidebarExpanded, setSidebarExpanded] = useLocalStorage<boolean>('docflow.sidebar.expanded', false);
const sidebar = useMemo(
  () => ({ expanded: sidebarExpanded, toggle: () => setSidebarExpanded((v) => !v) }),
  [sidebarExpanded, setSidebarExpanded],
);
// ...
<SidebarProvider value={sidebar}>
  <TopNav ... />              {/* no longer takes sidebarExpanded/onToggleSidebar props */}
  <Sidebar expanded={sidebarExpanded} />
  <main>{/* pages render <SidebarToggle/> themselves, reading this context */}</main>
</SidebarProvider>
```
**Dos:** provide the context value with `useMemo` (as above) so consumers of `useSidebar()` don't re-render on every unrelated `App.tsx` re-render.
**Don'ts:** don't reach for context again for anything else — this hook exists specifically because the toggle button had to move away from the state owner; don't treat it as precedent for lifting other state (dark mode, e.g., stays a plain prop passed to `TopNav` because nothing needs it below page level).

---

### `SidebarToggle` — hamburger button, rendered per-page
**Path:** `src/components/SidebarToggle.tsx`
**Purpose:** The nav-panel hamburger button. It no longer lives in `TopNav.tsx`'s logo slab (see §5) — each page renders its own `<SidebarToggle />` at the start of its header row instead, so the button sits at the fixed top-left of the *content* area (not the fixed navy bar) and holds that same position whether the sidebar is open or collapsed. Reads/writes sidebar state via `useSidebar()`, so it takes no props at all.
**Props:** none — `interface` is empty; all state comes from context.
**Example usage:**
```tsx
// src/pages/DashboardPage.tsx — every page's header row now starts this way,
// in place of what used to be that page's own <h1>; the page title itself
// moved into TopNav (see §5).
<div className="mb-[18px] flex flex-wrap items-center justify-between gap-4">
  <SidebarToggle />
  {/* ...page-specific header controls... */}
</div>
```
**Dos:** render exactly one `<SidebarToggle />` per page, at the top of its own header row — don't reintroduce a second hamburger in `TopNav.tsx`, or the two would fight over the same underlying `toggle()`.
**Don'ts:** don't pass `expanded`/`onToggle` as props to a new instance of this — it must stay wired to `useSidebar()` so every page's button reflects the same shared state.

---

### `BorderTrail` — animated border-tracing flourish (framer-motion)
**Path:** `src/components/ui/border-trail.tsx`
**Purpose:** A small hand-built (not shadcn-registry) component that animates a colored dot/glow along an element's border, using `framer-motion`'s `offsetPath`/`offsetDistance`. The app's only consumer today is `ApprovalsPage.tsx`'s decision flourish — a green (approved) or red (returned) trail that loops the just-decided card's edge a few times, then fades out — but the component itself is generic and domain-agnostic.
**Props:**
```ts
type BorderTrailProps = {
  className?: string;      // color/gradient of the traced dot, e.g. 'bg-gradient-to-l from-green-300 via-green-500 to-green-300'
  size?: number;            // dot size in px, default 60
  transition?: Transition;  // framer-motion Transition; default { repeat: Infinity, duration: 5, ease: 'linear' }
  delay?: number;
  onAnimationComplete?: () => void;
  style?: React.CSSProperties;
};
```
**Variants:** none built-in — color, speed, and repeat count are entirely caller-supplied via `className`/`transition`.
**Example usage:**
```tsx
// src/pages/ApprovalsPage.tsx — plays while `trails[a.id] === 'run'`, then
// fades (`opacity` class flips to 0) before being removed from state/DOM.
<BorderTrail
  className={cn(
    'bg-gradient-to-l transition-opacity duration-300',
    approvedVerdict
      ? 'from-green-300 via-green-500 to-green-300 dark:from-green-700/30 dark:via-green-500 dark:to-green-700/30'
      : 'from-red-300 via-red-500 to-red-300 dark:from-red-700/30 dark:via-red-500 dark:to-red-700/30',
    trail === 'run' ? 'opacity-100' : 'opacity-0',
  )}
  size={120}
  transition={{ ease: [0, 0.5, 0.8, 0.5], duration: 4, repeat: 2 }}
  onAnimationComplete={() => endTrail(a.id)}
/>
```
Needs a `relative` positioned parent (the card itself) since the component fills it with an `absolute inset-0` wrapper.
**Dos:** use a finite `repeat` count + `onAnimationComplete` (as above) for a one-shot confirmation flourish; use the default `Infinity` repeat only for a genuinely persistent "in progress"/loading indicator.
**Don'ts:** don't pull in `framer-motion` elsewhere in the app for simpler transitions (hover states, panel entrances, etc.) — those all use plain CSS (`tokens.css` keyframes/transitions, see the animation-classes note under `DocumentLifecyclePopup` below); this is the one deliberate exception, not a signal that framer-motion is the app's general animation tool.

---

### `titleCasePartyName` — selective all-caps text normalizer
**Path:** `src/lib/documentRow.ts`
**Purpose:** Supplier/ship-to party names come straight from AI-extracted header fields with inconsistent source casing — some fully upper (`"AMERICAN CENTRIFUGE OPERATING LLC"`), some already properly cased (`"Axitronics"`). Rendered side by side, the all-caps ones read as visually larger/heavier at the same font size (no ascenders/descenders), making a list look uneven. This function title-cases **only** the words that are actually all-caps, leaves already-mixed-case words completely untouched (so it can't mangle a name that's already correct), and keeps short tokens (state codes, initials like `"F."`) and known legal-entity suffixes fully capitalized rather than naively title-casing them.
**Signature:**
```ts
// src/lib/documentRow.ts
const PARTY_NAME_SUFFIXES = new Set(['LLC', 'INC', 'ULC', 'LTD', 'LLP', 'LP', 'CORP', 'PLC', 'CO', 'GMBH', 'PVT', 'DBA', 'USA']);

export function titleCasePartyName(name: string | null | undefined): string
```
**Example usage:**
```tsx
// src/pages/InboxPage.tsx
supplier: { name: titleCasePartyName(header.supplier_name), address: header.supplier_address ?? '' },
vendor: { name: titleCasePartyName(header.ship_to_name), address: header.ship_to_address ?? '' },
```
**Dos:** reuse this "selective-casing + suffix allowlist" shape for **any** user-facing name field pulled from an upstream system with inconsistent casing, rather than a blanket `.toLowerCase()`/title-case call that would mangle already-correct names or legal suffixes. Extend `PARTY_NAME_SUFFIXES` per-domain if new suffixes show up in real data.
**Don'ts:** don't apply this to fields where all-caps is semantically meaningful (e.g. currency codes, state/country codes) — it's specifically for human display names.

---

## 5. Page/Layout Patterns

### App shell (used by every route)
**Source:** `src/App.tsx`
```tsx
<BrowserRouter>
  <SidebarProvider value={sidebar}>{/* {expanded, toggle}, see useSidebar in §4 */}
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <TopNav
        dark={dark} onToggleDark={() => setDark((v) => !v)}
        unreadCount={unreadCount} onMarkNotificationsRead={markAllNotificationsRead}
      />
      <div className="flex flex-1">
        <Sidebar expanded={sidebarExpanded} />
        <main className="min-w-0 flex-1 px-[22px] pb-[60px] pt-[26px]">
          <div className="mx-auto w-full max-w-[1400px]">
            <Routes>{/* one <Route> per page, no nested layout wrappers */}</Routes>
          </div>
        </main>
      </div>
    </div>
  </SidebarProvider>
</BrowserRouter>
```
Reusable shape: **sticky top nav + persistent push/resize sidebar + centered max-width content column**. `sidebarExpanded` is lifted to `App.tsx` (persisted via `useLocalStorage`, same pattern as `dark`), but as of the `SidebarToggle`/`useSidebar` split (§4) `TopNav` no longer receives it as a prop — only `Sidebar` (the panel itself) does directly; the *toggle button* now lives inside each page instead of in `TopNav`, so its state is threaded through `SidebarProvider`/`useSidebar()` context rather than another prop. `Sidebar` still takes no `onCollapse` prop — it's `expanded`-only, since nothing inside it can trigger a collapse (see below). `unreadCount`/`onMarkNotificationsRead` are lifted to `App.tsx` (a `readIdx: Set<number>` over the `activity` list) because TopNav's bell button and — historically — Sidebar's footer both needed to agree on the same unread count; notifications now live solely in TopNav, but the state stayed lifted since it's derived from `App.tsx`'s own `activity` import. `Sidebar` is a real flex sibling of `<main>` — not rendered inside `TopNav`, not fixed-position — specifically so `<main>` reflows beside it via ordinary flexbox instead of needing any manual width/margin math. `min-w-0` on `<main>` is required, not decorative: without it a flex child won't shrink below its content's intrinsic width, which would break the reflow-on-resize behavior. To adapt for a new project: keep this exact wrapper, swap `TopNav`'s contents, `Sidebar`'s `TABS`, and the `<Routes>` list.

The route table (`App.tsx`) now has 9 routes, not the smaller set implied by earlier drafts of this doc: `/`, `/inbox`, `/worklist`, `/worklist/:documentId`, `/approvals`, `/reporting`, `/activity`, `/autonomy` (`AutonomyConfigPage`), `/settings`. There is **no** `/exceptions` route — see the Worklist exception-filter note in §5 below for what replaced it.

### Top nav bar (logo + page title + live search + notifications + theme toggle) + push/resize sidebar
**Source:** `src/components/TopNav.tsx`, `src/components/Sidebar.tsx`, `src/components/SidebarToggle.tsx`

**Ownership flipped since an earlier version of this doc**: Dark Mode toggle and Notifications now live in `TopNav.tsx`'s top bar, *not* in `Sidebar.tsx`'s footer. `Sidebar.tsx`'s footer holds **only** the Profile/account menu (name/email + Log out) — no Dark Mode row, no Notifications row inside it. If you're porting this shell and want the leaner top-bar-owns-utilities layout, follow the shape below; if you'd rather keep utilities in the sidebar footer (the shape this doc previously described), that's an equally valid alternative, just be consistent about which panel owns which control.

**The hamburger toggle has since moved out of `TopNav.tsx` entirely.** It used to sit inside the fixed-width logo slab; it now renders as `<SidebarToggle />` (§4) at the start of each *page's own* header row, inside `<main>`, not inside the sticky navy bar. The logo slab is now logo-only. Two reasons this moved: (1) it puts the toggle at a stable spot in the *content* column — flush with each page's own heading row — rather than pinned to the far edge of a full-width fixed bar; (2) it freed up the slab and the bar's left edge for something new — the page title (below). If porting this shell, either shape is defensible; just don't do both (a hamburger in the bar *and* one per page) or users get two toggles.

`TopNav.tsx`: `sticky top-0 z-50` bar → flex-none, **fixed-width (`w-[180px]`) logo slab** (logo only now, filling the slab at `h-[38px] w-full object-contain`, on a theme-invariant `bg-white`, not `bg-surface` — see §6 for why) → the current **page title** (`<h1>`, from a `pathname → label` lookup table `PAGE_TITLES` keyed by route, e.g. `/` → "Payables Overview", `/worklist` → "Worklist"; routes not in the table — currently just `/worklist/:documentId` — fall back to a prefix match, e.g. "Document Review") → three utility controls in a row on the right, in this order: **Search** icon + popover, **Notifications** bell (unread-count dot, `onClick` marks all read via a lifted `onMarkNotificationsRead` and navigates to `/activity`), and the **`ThemeToggle`** pill switch (see §4). `unreadCount` and `onMarkNotificationsRead` are passed in as props from `App.tsx` rather than owned locally, since the same unread state has to be consistent no matter which control surfaces it.

Because `TopNav` now owns the page-level `<h1>`, **individual pages no longer render their own page-title heading** — a page's header row starts with `<SidebarToggle />` where it used to start with an `<h1>{title}</h1>` (e.g. `DashboardPage.tsx`, `WorklistPage.tsx`, `InboxPage.tsx`, `ApprovalsPage.tsx`, `ReportingPage.tsx`, `ActivityPage.tsx`, `AutonomyConfigPage.tsx`, `SettingsPage.tsx` all follow this now), with any page-specific subtitle/description text kept alongside it. The one exception is `DocumentReviewPage.tsx`: its header still shows its own heading (the document's `display_id`, e.g. `INV-2024-0091`), because that value isn't knowable from the route/`PAGE_TITLES` table — but it's demoted from `<h1>` to `<h2>`, since `TopNav` is already rendering the section-level `<h1>` ("Document Review") for that route.

**Search is a real, live, multi-source search**, not a static placeholder — worth treating as its own reusable pattern:
- Lazily loaded: the three source queries (`ap_documents` for Worklist, `email_messages` for Inbox, `approval_requests` joined to `ap_documents→email_messages` for Approvals, all read-only Supabase calls) only fire the *first* time the popover opens (`searchLoaded` guard), not on every keystroke or every open.
- Client-side filtering over the loaded snapshot: each source builds a lowercased haystack string per row (supplier/doc ref/PO/subject/from-name/invoice number, source-dependent) and does a plain `.includes(q)` — no debounce needed since matching is instant against in-memory arrays already capped at 200 rows per source.
- Results are grouped by source (`'Worklist' | 'AP Inbox' | 'Approvals'`) and capped at `SEARCH_RESULT_LIMIT = 8` total across all three, each result showing a primary line, a secondary line, and a small pill naming its source group.
- Full keyboard support: `role="combobox"` on the input with `aria-controls`/`aria-activedescendant` pointing at a `role="listbox"`/`role="option"` results list; `ArrowDown`/`ArrowUp` move a `searchFocusIndex`, `Enter` navigates to the focused result's route (with router `state` attached for Worklist hits, so the destination page can render immediately without a duplicate fetch — same pattern as the list/detail pattern below). `searchFocusIndex` resets to `-1` whenever the query text changes, so a stale index from a longer result set can't point past the end of a shorter one.
- Canonical supplier names in results are resolved the same way the owning pages resolve them (`document_ui_view`, never the raw AI-extracted free-text name) — if you copy this pattern into a new project, keep search's data resolution in lockstep with whatever the source pages themselves consider canonical, rather than inventing a separate shortcut inside the search component.

`Sidebar.tsx` is a single boolean (`expanded`) toggling one panel between **zero width** (collapsed — nothing shown, no permanent icon rail at any viewport) and **`180px`** (expanded — full labels), always in-flow (never an overlay, never a backdrop, no `md:` breakpoint branching):
- `sticky top-[58px] h-[calc(100vh-58px)]`, so it stays pinned below the header while `<main>` scrolls beside it; width animates via `transition-[width]` and `<main>` reflows via ordinary flexbox — nothing is ever covered, dimmed, or blocked, satisfying the "main page stays fully visible/scrollable/clickable at all times" requirement this shape exists for.
- The nav `<nav>` (top, `flex-1`, scrollable) renders `TABS` — an array of `{ to, label, icon }` objects, 8 entries: Dashboard, AP Inbox, Worklist, Approvals, Reporting, Activity, **Autonomy** (`/autonomy`), Settings. No "Exceptions" tab — see the Worklist note below.
- The footer (`border-t`, pinned to the bottom via the nav's `flex-1` above it) now holds a **single** row: **Profile** — an avatar + name + email trigger that opens an account-menu popover containing just a name/email header and **Log out**. There is no Notifications row and no Dark Mode row inside this popover anymore (both moved to `TopNav.tsx`, above).
- The Profile popover is **portaled to `document.body`** (`createPortal`) and positioned via inline `style={{ left, bottom }}` computed from the trigger's `getBoundingClientRect()` at click time (`left: rect.right + 8`, opening to the *right* of the panel) — required because the `<aside>` has `overflow-hidden` (needed for the width-collapse animation), which would otherwise clip a popover wider than the 180px panel. The outside-click check accordingly tests **two** refs (`containerRef` for the trigger, `menuPanelRef` for the portaled panel itself), since the panel is no longer a DOM descendant of the trigger's container once portaled.
- `Escape` closes the Profile popover via its own `useEffect`, scoped to fire *only* while the popover is open — it deliberately does **not** also collapse the whole sidebar on a bare Escape. (`TopNav.tsx`'s search popover has its own, fully independent Escape listener; an early version had Sidebar's Escape handler fall back to collapsing the sidebar whenever no submenu was open, which fired for *both* listeners on every Escape press — closing the search popover from the top bar would unintentionally collapse the sidebar too. Keep the two listeners' concerns fully separate if this is extended further.)
- Width (`180px`) is deliberately set to exactly match the logo slab's width in `TopNav.tsx`, so expanding reads as that same white box extending straight down rather than a differently-sized panel appearing — easy to silently regress since the two width concerns (sidebar width vs. logo-slab width) look unrelated but both trace back to the same literal `180px` in two files.

### Dashboard/list layout — KPI strip + content sections
**Source:** `src/pages/DashboardPage.tsx`
Reusable shape: a horizontal grid of `KpiCard`s at the top, each `onClick`-navigable to a filtered detail view, followed by stacked `rounded-xl border border-border bg-surface p-[20px_22px] shadow-[0_1px_2px_rgba(16,24,40,.04)]` panels for charts/tables below. This "KPI strip → detail panels" shape generalizes to any analytics/overview page.

The Document Pipeline panel's step-to-step connector line is a `calc()` gotcha worth flagging if this component is ever touched: it insets `left`/`right` each `20px` from center so the line stops flush at each step circle's edge (`20px` = half the `h-10`/`w-10` circle's diameter). But the row above uses `gap-2` (`8px`) between steps, and only the *left* side needs to additionally account for it — `right` is measured relative to the current step's own container, so it already lands on that circle's edge, while `left` reaches back into the *previous* step's container, which starts `8px` further away than a gap-less row would. The working value is `left: 'calc(-50% + 12px)'` (`20px - 8px`), not the naive `20px` symmetric with `right` — using `20px` on both sides leaves a visible `8px` gap between every icon and its connector line. If the row's `gap` value ever changes, this offset must change with it.

**AI Insight panel** (new, not previously documented here): a `Sparkles`-icon box (`bg-tint`, navy icon chip) above the KPI strip, `src/pages/DashboardPage.tsx`. It's a **client-side stub Q&A**, not a real backend/LLM call — `resolveInsight(prompt)` is a plain string-matching function that answers a small fixed set of question shapes (e.g. "ingest"/"today") from data already loaded on the page, with a `setTimeout(..., 500)` used purely to simulate latency (`insightLoading` state) rather than any real async work. Paired with a row of suggested-prompt chips (pre-filled questions) and a text input + submit button. Reuse the *shape* — icon chip + prompt input + suggested chips + a fake-latency stub — for any future "ask about this page's data" affordance, but if wiring one to a real model/backend, swap `resolveInsight` for an actual call and keep the same loading/response UI around it.

**Date-filter dropdown**: drives the KPI trend percentages — `Today / This Week / This Month / Last 100 / Custom Range`, replacing what may have been a narrower set in an earlier version. Selecting a window changes which `ap_documents`/`exception_cases`/`approval_requests` fetch window backs the KPI values and their period-over-period trend.

### List/detail (worklist → review) layout
**Source:** `src/pages/WorklistPage.tsx` → `src/pages/DocumentReviewPage.tsx`, wired via `/worklist` and `/worklist/:documentId` routes in `App.tsx`.
Reusable shape: a filterable/sortable `DataTable` list page where each row's ID column is a `<Link to={"/list/" + id} state={{ row }}>` — the full row object is passed via router state so the detail page can render immediately without a duplicate fetch, falling back to a re-fetch only on a hard refresh. The detail page itself (`DocumentReviewPage.tsx`) uses a **two-pane + info-rail** layout: `flex flex-col gap-4 lg:flex-row` with two comparison panels on the left and a fixed info panel on the right.

**A standalone `ExceptionsPage.tsx` no longer exists.** Its role was folded into Worklist via a preset filter/severity read from router `state` (`{ presetFilter?: string; presetSeverity?: Severity }`), seeded once on mount from `useLocation().state`. Dashboard's "Open Exceptions" KPI card and its Exceptions-by-Severity chart rows now navigate to `/worklist` with that state attached instead of to a separate page — Worklist filters its client-side row set down to `filter === 'exception' && r.exceptions > 0` (optionally further narrowed by `severityFilter`) and renders the same `DataTable` the unfiltered Worklist view uses, with the active filter surfaced as a removable chip rather than a separate route/page. This "collapse a single-purpose filtered page into a preset-state deep link on its parent list" pattern is a reasonable one to reuse whenever a dedicated page turns out to be nothing but one fixed filter over a list that already exists elsewhere.

### Popover/menu (non-modal overlay) pattern
Reused 4+ times (`TopNav` search popover, `Sidebar` Profile/account menu, `AssigneePicker` menu, `DocumentLifecyclePopup`): absolutely or fixed positioned `<div>` (not a `<dialog>`/modal), positioned either relative to its trigger (`absolute right-0 top-11 ...`) or via `getBoundingClientRect()` + `createPortal` when it must escape a clipped ancestor, dismissed via outside-`mousedown` + `Escape` keydown listeners attached in a `useEffect` scoped to `open` state.

#### Anchored, viewport-clamped hover tooltip (specialization of the above)
**Sources:** `src/pages/InboxPage.tsx` (supplier/vendor address + summary tooltips), `src/pages/WorklistPage.tsx` (Priority Reason tooltip on the `DataTable` Priority column).
A further-specialized, `fixed`-positioned variant used for hover-triggered detail tooltips, worth copying verbatim into any new table/list that needs the same "small info card follows the cursor's trigger element, never runs off-screen" behavior:
- **Primary-axis placement is chosen by available space**, not fixed: Inbox tries to the *right* of the trigger first (`spaceRight >= TOOLTIP_WIDTH + TOOLTIP_MARGIN`), falling back to *above*; Worklist tries *below* the trigger first (`spaceBelow >= TOOLTIP_MAX_HEIGHT + TOOLTIP_MARGIN`), falling back to *above* — pick whichever primary/fallback pair fits the trigger's typical position in your layout (a table cell vs. a badge), not necessarily this exact pair.
- **Cross-axis offset is clamped**, not just computed: `left` (or the tooltip's horizontal position generally) is `Math.max(TOOLTIP_MARGIN, Math.min(rawPosition, window.innerWidth - <tooltip width> - TOOLTIP_MARGIN))`, so it can never run off the left or right viewport edge even when the trigger sits near one.
- **The fallback axis is clamped too**: when placed above/below, `top` is likewise clamped between `TOOLTIP_MARGIN` and `window.innerHeight - TOOLTIP_MAX_HEIGHT - TOOLTIP_MARGIN` — added specifically because an earlier version anchored purely off `rect.top`/`rect.bottom` with no bottom-edge check, letting tooltips triggered near the bottom of a long, real-data table render partly or fully below the viewport.
- **The panel's own height is capped**, not left to grow unbounded: an inline `style={{ maxHeight: TOOLTIP_MAX_HEIGHT, ... }}` paired with `overflow-y-auto` on the tooltip's root `<div>` means long content (a multi-line address, a long Priority Reason) scrolls *inside* the fixed-size tooltip instead of pushing its bottom edge past the viewport.
- Constants live at module scope per-page (`TOOLTIP_MARGIN`, `TOOLTIP_MAX_HEIGHT`, and a width constant — `TOOLTIP_WIDTH` in Inbox, `TOOLTIP_PANEL_WIDTH` in Worklist since it also uses `TOOLTIP_MAX_HEIGHT` to decide the below/above flip), all in sync with the panel's own `min-w-[...]`/`max-w-[...]` Tailwind classes — if you resize the panel, update the matching width constant too, since the flip/clamp math reads from the constant, not the rendered DOM size.

Inbox's Supplier/Vendor cells pair with this tooltip via a **compact trigger, not an inline full-text trigger**: the cell now renders just the (title-cased, see `titleCasePartyName` above) party name plus a small inline `MapPin` icon button (`h-[13px] w-[13px]`) that opens the address tooltip on hover/focus — replacing an earlier version where the full address string itself was a truncated, underlined button/trigger. Prefer this "name + small affordance icon" shape over a long-text trigger whenever the triggering text itself is variable-length and shares a narrow column (here `max-w-[190px] break-words`, down from `max-w-[240px] truncate`) — it keeps column width predictable regardless of how long the underlying address happens to be.

---

## 6. Theming Notes

To reskin this system for a new brand, touch these files, in this order:

1. **`src/styles/tokens.css`** — the single source of truth for every color. Replace the hex values under `:root` and `.dark` (keep the variable *names* the same so every component/Tailwind class keeps working unchanged). Pay special attention to `--navy`/`--navy2` (primary brand color, referenced directly by name in several components, e.g. `bg-navy` in `TopNav.tsx`) and the semantic bridge block (`--primary`, `--destructive`, `--success`, etc.) if the new brand's semantic mapping differs.
2. **`tailwind.config.ts`** — only needed if you're adding *new* token names (not just changing values, which is handled entirely in step 1) or changing `fontFamily.sans`.
3. **`index.html`** — swap the Google Fonts `<link>` tags for the new brand's typeface, update `<title>`.
4. **`src/lib/theme.ts`** — update `RED`/`GREEN` and `SEVERITY_COLORS` if the new brand's semantic/severity colors differ from red/green/navy-ramp.
5. **`src/assets/PCB_Logo.png`** + its import in `src/components/TopNav.tsx` (`import logo from '@/assets/PCB_Logo.png'`) — swap the file and update the import path/alt text.
6. **Dark mode** — toggled via a `.dark` class on `<html>`, controlled by `App.tsx`'s `useLocalStorage('docflow.theme.dark', ...)` + a `useEffect` that does `document.documentElement.classList.toggle('dark', dark)`. No other file needs to change to support dark mode for a new brand — just make sure your new `.dark` token values in step 1 have real contrast-checked pairs.

No component file needs to be touched for a pure re-skin — every component consumes colors exclusively via Tailwind's semantic/raw token classes or `var(--token)`, never hardcoded hex, with two narrow, documented exceptions: (a) `DocumentLifecyclePopup.tsx`'s indigo/amber palette, local to that one component and would need manual updating if its accent colors should also change; and (b) the logo slab's `bg-white` in `TopNav.tsx` (see §5) — deliberately theme-invariant rather than `bg-surface`, because the brand logo's own colors (dark navy/red, designed for a light backdrop) aren't recolored per theme, and `bg-surface` turns dark in dark mode and swallows it. If reskinning with a logo that already ships a dark-mode-safe variant, this can revert to `bg-surface`.

---

## 7. How to Bootstrap a New Project With This UI

1. **Scaffold Vite + React + TS**
   ```
   npm create vite@latest my-app -- --template react-ts
   ```
2. **Install the exact dependency set this system relies on:**
   ```
   npm install react-router-dom clsx tailwind-merge lucide-react @radix-ui/react-avatar
   npm install -D tailwindcss@^3 postcss autoprefixer tailwindcss-animate
   ```
   (Add `@supabase/supabase-js` and `recharts` only if the new project also needs a Supabase-backed data layer or charts; add `framer-motion` only if you're also porting `BorderTrail` — none of these three are required by the UI system's core.)
3. **Port config files, unmodified, in this order:**
   - `tailwind.config.ts` (then edit only `fontFamily`/token names if needed — see §6)
   - `postcss.config.js`
   - `components.json` (the shadcn CLI config — keep so you can pull more shadcn components later with `npx shadcn add <component>`)
   - `vite.config.ts` (keep the `@` → `./src` alias; keeps every `@/...` import in copied components working unchanged)
   - `tsconfig.json` / `tsconfig.app.json` / `tsconfig.node.json` (for the same path-alias support in TypeScript)
4. **Copy the foundation layer, in this order (each step depends on the previous):**
   1. `src/styles/tokens.css` → then re-skin its hex values per §6 before anything else, so every component you copy next renders in the new brand immediately.
   2. `src/lib/utils.ts` (the `cn()` helper — almost everything else depends on it) and `src/lib/theme.ts` (adjust `SEVERITY_COLORS`/`RED`/`GREEN` for the new brand).
   3. `src/components/ui/` (shadcn primitives) — start with just `table.tsx` and `avatar.tsx` if that's all you need; pull additional ones from shadcn's registry as required.
   4. `src/hooks/useLocalStorage.ts`, `src/hooks/useToast.ts`, and `src/hooks/useSidebar.tsx` — zero domain coupling, safe to copy verbatim.
   5. `src/components/DataTable.tsx`, `KpiCard.tsx`, `SeverityBadge.tsx`, `StatusPill.tsx`, `Toast.tsx`, `SidebarToggle.tsx` — the fully generic component layer (no edits needed beyond token re-skinning already done in step 1). Copy `src/components/ui/border-trail.tsx` too, and add `framer-motion` (step 2), only if the new project wants that same decision-flourish animation.
   6. `src/components/TopNav.tsx`, `src/components/Sidebar.tsx`, and `src/App.tsx` — copy as a starting shell (note `sidebarExpanded`/`dark` state lives in `App.tsx`; `sidebarExpanded` reaches `Sidebar` as a direct prop and reaches `TopNav`/every page's `SidebarToggle` via the `SidebarProvider` wrapper — see §4/§5), then strip out the domain-specific search-source queries in `TopNav.tsx` (the Supabase search wiring), replace `TopNav.tsx`'s `PAGE_TITLES` map with your new project's route→title labels, and replace `Sidebar.tsx`'s `TABS`/`<Routes>`/demo `CURRENT_USER` with your new project's navigation, icons, and account identity. Also add a `<SidebarToggle />` at the top of every new page's own header row (see §5) — without it there's no way to open the sidebar, since `TopNav.tsx` no longer renders a hamburger itself. If you resize the logo, update `Sidebar.tsx`'s expanded width (`w-[180px]`) to match `TopNav.tsx`'s logo slab width so the two stay visually seamless (see §5).
5. **Wire the entry point:** copy `index.html` (update `<title>`/font links) and `src/main.tsx` verbatim.
6. **Leave behind, and rebuild per-project:** `data.ts`, `lib/documentRow.ts`, `lib/lifecycle.ts`, `lib/matchingDemo.ts`, `lib/supabase.ts`, everything in `pages/`, and `AssigneePicker.tsx`/`DocumentLifecyclePopup.tsx` (copy these last two only if you want to adapt their *patterns* — portal-escaping dropdown, anchored hover card — to new domain data, per the "Dos" notes in §4).
7. **Verify:** `npm run dev`, confirm the app boots with the new brand's tokens applied and the dark-mode toggle (from the copied `App.tsx`) still switches themes correctly before building out real pages.
