# DocFlow — Session Status

**Last updated:** 2026-07-23
**Purpose:** Living snapshot of where DocFlow's frontend stands — what's wired to
Supabase, what's still mock/static, and what's blocked on backend work. Edited in
place as work continues (not a chronological log). See also
[`docs/backend-handoff.md`](backend-handoff.md), the incremental narrative of asks
for the backend owner (Afrid), and
[`docs/backend-requirements.md`](backend-requirements.md), the presentation version
of the same asks organized by UI screen with screenshot references — hand that one
to Afrid directly.

## Current state summary

DocFlow's frontend (`Projects/Docflow/FrontEnd`) originally read all live data from
a FastAPI backend at `http://127.0.0.1:8000`. This session migrated all 6 data-driven
pages to **read directly from Supabase** via a minimal read-only `supabase-js`
client — no backend/schema/RLS changes, no writes, no client-side business logic.
Every metric or field that can't be honestly computed from what Supabase currently
exposes is left static/mock and explicitly labeled, with the underlying gap recorded
in `docs/backend-handoff.md` for Afrid. A new feature (Document Lifecycle hover
popup on Worklist) was also added, mock-driven except for one real field.

## Supabase connection

- **Client**: [`src/lib/supabase.ts`](../FrontEnd/src/lib/supabase.ts) — a single
  `createClient()` call reading `VITE_SUPABASE_URL` / `VITE_SUPABASE_PUBLISHABLE_KEY`
  from `.env` (typed in `src/vite-env.d.ts`). Used by every page via `@/lib/supabase`.
- **Auth model**: publishable (anon) key. Verified it can `SELECT` from every table
  used (RLS allows read); it **cannot** introspect schema (`401` on `/rest/v1/`
  root — needs a `sb_secret_...` key for that, which we don't have and don't need
  for read-only display).
- **Confirmed live tables** (with real row counts at time of investigation):
  `ap_documents` (113), `email_messages` (109), `email_attachments` (109),
  `purchase_orders` (13, synthetic seed — disconnected), `goods_receipts` (12,
  partly synthetic), `exception_cases` (2), `approval_requests` (1),
  `approval_actions` (1).
- **Naming mismatch**: the old FastAPI vocabulary (`exceptions`, `approvals`,
  `attachments`, `inbox_messages`) does not match the real table names
  (`exception_cases`, `approval_requests`/`approval_actions`, `email_attachments`,
  `email_messages`) — the FastAPI backend evidently renames/aggregates these.
- **Supplier/amount/PO/invoice-number data lives inside JSON**, not plain columns:
  `email_messages.ai_understanding.header.*` (an AI-extraction blob), not on
  `ap_documents` itself.

## Per-page status

| Page | Source | Wired from Supabase | Static / mock / deferred |
|---|---|---|---|
| **Inbox** (`/inbox`) | `email_messages` + embedded `email_attachments` | Supplier/Vendor (from `ai_understanding.header`), Summary tooltip (`business_summary`+`ai_intent`), attachments list | Attachment links are **non-clickable filenames** — real file requires Supabase Storage bucket info from Afrid (handoff item 1) |
| **Worklist** (`/worklist`) | `ap_documents` + embedded `email_messages(ai_understanding)` + `exception_cases` | Supplier/doc ref/PO/amount/currency, confidence, priority, stage, exception count/severity, created/updated, client-side sort/search/pagination (~113 rows fetched once) | **Matched Against** column always "Unmatched" (matching not wired — item 5); **Assigned To** is read-only text (writes out of scope); old hover Flow overlay removed (superseded by the new Lifecycle popup, see below) |
| **Exceptions** (`/exceptions`) | `exception_cases` + joined `ap_documents→email_messages` | Severity/type/reason/age, severity cards, owner/search/severity filters, client-side pagination | Owner is read-only; "Approve/Resolve" action removed (write, out of scope); only 1 open row exists in current data |
| **Approvals** (`/approvals`) | `approval_requests` + joined `ap_documents→email_messages` + `approval_actions` | Vendor/invoice/PO/amount, reviewer note, pending-only filter (kept faithful to original semantics per user's choice) | Approve/Return buttons replaced with a "Pending review" status pill (writes out of scope); Matched Against static "Unmatched"; currently shows **0 rows** (the only approval in the DB is already `approved`) |
| **Dashboard** (`/`) | `ap_documents`, `exception_cases`, `approval_requests` (fetched per date-filter window) | Active Invoices / Pending Review / Open Exceptions / Pending Approvals (with period-over-period trend %), Exceptions-by-Severity panel, **Top 5 Aging Documents** (replaced old Aging panel per user's request — supplier/doc ref/age, no 24h badge) | **Posting Ready** static (no posting signal in data); **Document Pipeline** funnel static sample (bucket definitions needed — item 7); bottom KPI strip + AI Insight box remain presentational stubs |
| **Reporting** (`/reporting`) | `email_messages`, `ap_documents`, `exception_cases` (fetched once, filtered client-side) | Emails Processed / Invoices Created / Invoices Posted (= invoices in worklist) / Open Exceptions tiles; Invoices-vs-Exceptions monthly trend; Exception Types (severity-weighted "highest-impact" flag); Top Exception Suppliers; new period filter (**Yesterday / Last Week / Last Month / Custom**, replacing the old this_month/last_3/last_6) | **Avg Processing / Match Rate / Exception Rate / SLA Compliance** static "— Not available yet" (item 8); **Processing Health** panel static, labeled "Sample"; **Invoices by Stage** deferred with an explicit placeholder (stage frozen at "review"); AI AP Insights static |

## Document Lifecycle popup (new feature, Worklist)

Hover any Worklist row to see a 4-stage chain popup: **Purchase Order → Acknowledgement
→ Goods Receipt → Invoice**, each with an extraction status
(`not_received`/`received_pending`/`extracted`/`extraction_failed`), plus 2-way
(PO↔GRN) and 3-way (PO↔GRN↔Invoice) match verdict pills.

- **Contract + mock data**: [`src/data/lifecycleMock.ts`](../FrontEnd/src/data/lifecycleMock.ts)
  — `DocumentLifecycle` type, 7 deterministic mock scenarios (picked per document id
  via a stable hash, so the same row always shows the same scenario).
- **UI**: [`src/components/DocumentLifecyclePopup.tsx`](../FrontEnd/src/components/DocumentLifecyclePopup.tsx)
  — adapted from the old (now-superseded) `DocumentFlowOverlay.tsx`; same glass-card/
  connector/verdict-pill visual language, extended from 3 stages to 4 and from a
  boolean received/extracted pair to a 4-value status enum (adds a real
  extraction-failed state).
- **Wiring**: `WorklistPage.tsx` now uses `DataTable`'s `onRowMouseEnter`/
  `onRowMouseLeave` (previously unwired) to open the popup, anchored to the hovered
  row.
- **Mock vs real split**: only the **hovered row's own stage** (mapped from its
  `document_type`) reflects real data — derived heuristically from its linked
  email's `ai_understanding` (`deriveOwnStageStatus` in the mock file). The other 3
  stages and both match verdicts are 100% mock, because there's no reliable way to
  link a specific document to its own PO/Ack/GRN chain today (only fuzzy
  `po_match_key`/`grn_match_key` string matching exists, which is backend matching
  logic the frontend must not compute). Backend ask recorded as handoff item 9.

## Backend handoff doc — open items

Full detail in [`docs/backend-handoff.md`](backend-handoff.md). Summary:

| # | Item | Blocks |
|---|---|---|
| 1 | Attachment file storage (bucket + access model) | Inbox attachment click-through |
| 2 | Supplier/Vendor normalization (JSON → real table) | Awareness only, not blocking |
| 3 | Confirm RLS anon-read is intentional | Not yet blocking |
| 4 | Share a schema doc / column list | Would speed up future work |
| 5 | Invoice↔PO↔GRN matching (real linkage + match view/RPC) | Worklist Matched Against, flow overlay, Approvals match badge |
| 6 | Extraction data quality (`document_type` casing, garbage PO numbers) | Display quality only |
| 7 | Pipeline bucket definitions | Dashboard Document Pipeline |
| 8 | Posting + SLA data (timestamps, policy) | Invoices Posted, Avg Processing, SLA Compliance, Match Rate, Invoices-by-Stage |
| 9 | Document Lifecycle popup data (chain linkage, status enum, failure repr., match verdicts) | 3 of 4 lifecycle stages + both match verdicts |

## Known limitations / recurring blockers

- **Matching is not wired**: `purchase_orders` is synthetic seed data; invoice
  `po_match_key` values rarely align with it; every `grn_match_key` is null. No
  2-way/3-way verdict is real anywhere in the app yet.
- **`ap_documents.stage`** is frozen at `"review"` for every row — no real per-document
  lifecycle stage exists, blocking "Invoices by Stage" and the Pipeline funnel.
- **No posting/completion data**: `posted_at` is never populated; only a
  `mock_posted` flag exists. Blocks Avg Processing, SLA Compliance, Posting Ready.
- **No SLA data**: `sla_due_at`/`sla_breached` never set.
- **Data quality**: `document_type` casing/naming is inconsistent across rows
  (`invoice`/`Invoice`, `purchase_order`/`acknowledgement`/`PO Acknowledgement`/`grn`/
  `Delivery / GRN Evidence`); some extracted PO numbers are garbage values
  (`"No"`, `"Number"`).
- **Read-only scope**: every write action (assign, resolve, approve/reject, decide)
  has been replaced with read-only display per the user's explicit scope for this
  phase. Not a bug — a deliberate phase boundary.

## Files created/modified this session

**Supabase plumbing (new):**
- `FrontEnd/src/lib/supabase.ts` — client
- `FrontEnd/src/vite-env.d.ts` — typed env vars
- `Projects/Docflow/.mcp.json` — Supabase MCP server config (dev-tooling only, unrelated to the app's runtime data path)

**Pages rewired to Supabase (modified):**
- `FrontEnd/src/pages/InboxPage.tsx`
- `FrontEnd/src/pages/WorklistPage.tsx`
- `FrontEnd/src/pages/ExceptionsPage.tsx`
- `FrontEnd/src/pages/ApprovalsPage.tsx`
- `FrontEnd/src/pages/DashboardPage.tsx`
- `FrontEnd/src/pages/ReportingPage.tsx`

**Document Lifecycle popup (new):**
- `FrontEnd/src/data/lifecycleMock.ts`
- `FrontEnd/src/components/DocumentLifecyclePopup.tsx`

**Docs (new/updated):**
- `Projects/Docflow/docs/backend-handoff.md` — created, then extended with items 2–9 across the session
- `Projects/Docflow/docs/session_status.md` — this file

**Untouched (left in place, no longer imported by rewired pages):**
- `FrontEnd/api/*.ts` (all 8 FastAPI client files) — kept on disk in case FastAPI is reintroduced later
- `FrontEnd/src/components/DocumentFlowOverlay.tsx` — superseded by `DocumentLifecyclePopup.tsx` but not deleted

## Open decisions / next steps

- Awaiting Afrid's response on `docs/backend-handoff.md` items 1, 5, 7, 8, 9 — once
  any land, the corresponding static/mock pieces above can move to real data.
- No page or feature currently in progress — all 6 data pages + the lifecycle popup
  are in the state described above, pending either backend input or new direction
  from the user.
- Document Review page (`/worklist/:id`) and the remaining static pages (Activity,
  Autonomy Config, Settings) have not been touched this session — still on the old
  static/`data.ts` path (Activity/Autonomy/Settings were already static by design;
  Document Review was out of scope so far).
