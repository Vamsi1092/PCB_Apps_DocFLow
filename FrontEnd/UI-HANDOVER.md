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
| State management | None (no Redux/Zustand/React Query/Context). Purely local `useState`/`useEffect`, plus two custom hooks (`useLocalStorage`, `useToast`) |
| Routing | `react-router-dom` `^6.28.0` — `BrowserRouter` + flat `Routes`/`Route` list, no nested layouts |
| Build tool | Vite `^6.0.5` + `@vitejs/plugin-react`, `tsc -b && vite build` for production builds |
| Data layer | `@supabase/supabase-js` (`^2.110.8`) queried directly from pages/components — no backend API layer in the frontend |

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
├── hooks/                # Small reusable hooks (localStorage-backed state, toast timer)
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
| Nav tabs | `text-[13px]`, `uppercase`, `tracking-[.03em]`, weight 500/700 by active state | — | `src/components/TopNav.tsx` |

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

## 5. Page/Layout Patterns

### App shell (used by every route)
**Source:** `src/App.tsx`
```tsx
<BrowserRouter>
  <div className="flex min-h-screen flex-col bg-background text-foreground">
    <TopNav dark={dark} onToggleDark={() => setDark((v) => !v)} />
    <main className="mx-auto w-full max-w-[1400px] flex-1 px-[22px] pb-[60px] pt-[26px]">
      <Routes>{/* one <Route> per page, no nested layout wrappers */}</Routes>
    </main>
  </div>
</BrowserRouter>
```
Reusable shape: **sticky top nav + centered max-width content column**, no sidebar. To adapt for a new project: keep this exact wrapper, swap `TopNav`'s contents and the `<Routes>` list.

### Top nav bar (persistent header, all-in-one)
**Source:** `src/components/TopNav.tsx`
Reusable shape: `sticky top-0 z-50` bar → flex-none logo slab → horizontal scrollable tab list (`NavLink` + active-state class swap) → flex-none utility icon cluster, each icon opening its own absolutely-positioned popover (search / notifications / profile), closed on outside-click + Escape via one shared `useEffect` + `containerRef`.

### Dashboard/list layout — KPI strip + content sections
**Source:** `src/pages/DashboardPage.tsx`
Reusable shape: a horizontal grid of `KpiCard`s at the top, each `onClick`-navigable to a filtered detail view, followed by stacked `rounded-xl border border-border bg-surface p-[20px_22px] shadow-[0_1px_2px_rgba(16,24,40,.04)]` panels for charts/tables below. This "KPI strip → detail panels" shape generalizes to any analytics/overview page.

### List/detail (worklist → review) layout
**Source:** `src/pages/WorklistPage.tsx` → `src/pages/DocumentReviewPage.tsx`, wired via `/worklist` and `/worklist/:documentId` routes in `App.tsx`.
Reusable shape: a filterable/sortable `DataTable` list page where each row's ID column is a `<Link to={"/list/" + id} state={{ row }}>` — the full row object is passed via router state so the detail page can render immediately without a duplicate fetch, falling back to a re-fetch only on a hard refresh. The detail page itself (`DocumentReviewPage.tsx`) uses a **two-pane + info-rail** layout: `flex flex-col gap-4 lg:flex-row` with two comparison panels on the left and a fixed info panel on the right.

### Popover/menu (non-modal overlay) pattern
Reused 4+ times (`TopNav` search/alerts/profile menus, `AssigneePicker` menu, `DocumentLifecyclePopup`): absolutely or fixed positioned `<div>` (not a `<dialog>`/modal), positioned either relative to its trigger (`absolute right-0 top-11 ...`) or via `getBoundingClientRect()` + `createPortal` when it must escape a clipped ancestor, dismissed via outside-`mousedown` + `Escape` keydown listeners attached in a `useEffect` scoped to `open` state.

---

## 6. Theming Notes

To reskin this system for a new brand, touch these files, in this order:

1. **`src/styles/tokens.css`** — the single source of truth for every color. Replace the hex values under `:root` and `.dark` (keep the variable *names* the same so every component/Tailwind class keeps working unchanged). Pay special attention to `--navy`/`--navy2` (primary brand color, referenced directly by name in several components, e.g. `bg-navy` in `TopNav.tsx`) and the semantic bridge block (`--primary`, `--destructive`, `--success`, etc.) if the new brand's semantic mapping differs.
2. **`tailwind.config.ts`** — only needed if you're adding *new* token names (not just changing values, which is handled entirely in step 1) or changing `fontFamily.sans`.
3. **`index.html`** — swap the Google Fonts `<link>` tags for the new brand's typeface, update `<title>`.
4. **`src/lib/theme.ts`** — update `RED`/`GREEN` and `SEVERITY_COLORS` if the new brand's semantic/severity colors differ from red/green/navy-ramp.
5. **`src/assets/PCB_Logo.png`** + its import in `src/components/TopNav.tsx` (`import logo from '@/assets/PCB_Logo.png'`) — swap the file and update the import path/alt text.
6. **Dark mode** — toggled via a `.dark` class on `<html>`, controlled by `App.tsx`'s `useLocalStorage('docflow.theme.dark', ...)` + a `useEffect` that does `document.documentElement.classList.toggle('dark', dark)`. No other file needs to change to support dark mode for a new brand — just make sure your new `.dark` token values in step 1 have real contrast-checked pairs.

No component file needs to be touched for a pure re-skin — every component consumes colors exclusively via Tailwind's semantic/raw token classes or `var(--token)`, never hardcoded hex (with the narrow, documented exception of `DocumentLifecyclePopup.tsx`'s indigo/amber palette, which is local to that one component and would need manual updating if its accent colors should also change).

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
   (Add `@supabase/supabase-js` and `recharts` only if the new project also needs a Supabase-backed data layer or charts — they're not required by the UI system itself.)
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
   4. `src/hooks/useLocalStorage.ts` and `src/hooks/useToast.ts` — zero domain coupling, safe to copy verbatim.
   5. `src/components/DataTable.tsx`, `KpiCard.tsx`, `SeverityBadge.tsx`, `StatusPill.tsx`, `Toast.tsx` — the fully generic component layer (no edits needed beyond token re-skinning already done in step 1).
   6. `src/components/TopNav.tsx` and `src/App.tsx` — copy as a starting shell, then strip out the domain-specific search-source queries in `TopNav.tsx` (the Supabase search wiring) and replace `TABS`/`<Routes>` with your new project's navigation.
5. **Wire the entry point:** copy `index.html` (update `<title>`/font links) and `src/main.tsx` verbatim.
6. **Leave behind, and rebuild per-project:** `data.ts`, `lib/documentRow.ts`, `lib/lifecycle.ts`, `lib/matchingDemo.ts`, `lib/supabase.ts`, everything in `pages/`, and `AssigneePicker.tsx`/`DocumentLifecyclePopup.tsx` (copy these last two only if you want to adapt their *patterns* — portal-escaping dropdown, anchored hover card — to new domain data, per the "Dos" notes in §4).
7. **Verify:** `npm run dev`, confirm the app boots with the new brand's tokens applied and the dark-mode toggle (from the copied `App.tsx`) still switches themes correctly before building out real pages.
