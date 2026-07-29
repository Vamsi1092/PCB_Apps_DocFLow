# DocFlow — Backend / Storage Requests from Frontend

**From:** Frontend (Supabase read-only wiring)
**To:** Backend / Database owner
**Date:** 2026-07-22
**Status:** Requests — no backend changes have been made by frontend

## Context

The frontend is being wired to **read directly from Supabase** (SELECT-only, using
the `sb_publishable_` key from the browser). While doing this we hit a few things
that are owned by the backend/database side. None of these are blocking the
**display** of data — lists and fields render fine today — but the items below
need your decision/action to be fully functional.

---

## 1. Attachment file access  ⬅ primary request

### Current state
- Table `email_attachments` has: `id`, `email_id`, `filename`, `file_type`,
  `size_kb`, `storage_path` (e.g. `c12ea9dd-…/PO#14193.pdf`), `detected_type`.
- The frontend previously opened attachments via the FastAPI backend
  (`GET /api/attachments/{id}/file`). When the browser reads Supabase directly
  (no FastAPI in the loop), it has the `storage_path` string but **no way to fetch
  the actual file bytes** — there's no accessible file URL.

### What we need from you
1. **Confirm a Supabase Storage bucket** holds these attachment files, and that
   `email_attachments.storage_path` is the object path *within that bucket*.
   → Please give us the **bucket name**.
2. **Decide the access model:**
   - **Public bucket** — simplest. Frontend builds a URL with
     `supabase.storage.from('<bucket>').getPublicUrl(storage_path)`. No auth needed.
   - **Private bucket + signed URLs** — more secure. Frontend can call
     `createSignedUrl(storage_path, expiresIn)` **only if** the storage RLS grants
     the publishable/anon role access; otherwise we need a backend endpoint or an
     RPC/Edge Function that mints the signed URL for us.
3. *(Optional)* If easier on your side, expose a resolved link directly — e.g. a
   `public_url` column on `email_attachments`, or a view/RPC that returns it.

### Frontend impact once resolved
One-line change: attachment links point at the Storage URL
(`getPublicUrl` / `createSignedUrl`) instead of the FastAPI endpoint. Until then,
the Inbox shows attachment **filenames as non-clickable text**.

> Note: Supabase Storage is the right home for these unstructured PDF files — the
> `storage_path` column already looks set up for exactly this.

---

## 2. Supplier / Vendor data lives only in a JSON blob  ⬅ heads-up, not blocking

Supplier and Vendor (name + address) shown in the Inbox are read from
`email_messages.ai_understanding.header` (`supplier_name` / `supplier_address` and
`ship_to_name` / `ship_to_address`) — i.e. the AI-extraction JSON, not normalized
columns.

- **Fine for read-only display** right now.
- **Heads-up for later:** if we ever need reliable filtering, sorting, or joins on
  supplier/vendor (or a suppliers directory), a normalized `suppliers` table with a
  FK from documents would be far more robust than querying inside JSON. No action
  needed today — flagging for the KPI/analytics phase.

---

## 3. Row Level Security — confirm intended read access  ⬅ please confirm

The `sb_publishable_` (anon) key can currently `SELECT` from `email_messages`,
`email_attachments`, `ap_documents`, `purchase_orders`, `goods_receipts`,
`exception_cases`, `approval_actions`.

- Please **confirm anon read access is intentional** for the browser frontend.
- If you plan to tighten RLS (e.g. require an authenticated user/role), tell us
  which auth model the frontend should adopt so we can align before it breaks.

---

## 4. Schema visibility  ⬅ minor, would speed us up

The publishable key **cannot introspect the schema** (`GET /rest/v1/` returns
`401 – secret API key required`). We've been inferring tables/columns by reading
sample rows.

- If you can share a **schema doc or column list** (or the table→column map for the
  entities the UI touches), it removes guesswork from the remaining pages and avoids
  mapping mistakes. Nice-to-have, not blocking.

---

## 5. Invoice ↔ PO ↔ GRN matching is not wired  ⬅ blocks the Worklist "Matched Against" column

The Worklist's **Matched Against** column and the row-hover **document-flow overlay**
show 2-way / 3-way match results. These are backend-computed
(`match_invoice_against_po_grn()` / `get_document_flow()`), and the underlying data
in Supabase can't support them yet:

- `purchase_orders` (13 rows) are **synthetic seed data** (`PO-21078-A`, `PO-14192`,
  `PO-55321`, …).
- Invoice extraction keys (`ai_understanding.validation_ready_fields.po_match_key`)
  are values like `APC11012405`, `41323385`, `9484` — plus garbage (`"No"`,
  `"Number"`) and many empty — which **do not correspond** to those POs.
- Every invoice's `grn_match_key` is `null`, so **3-way matching is impossible**.

Because of this, the frontend currently renders every row as **"Unmatched"** and the
flow overlay is **disabled**. To light these up we need, from your side:
1. **Real, linked PO and GRN data** (not seed rows) that actually correspond to the
   ingested invoices.
2. Clean, reliable `po_match_key` / `grn_match_key` on the extraction (or an explicit
   FK from `ap_documents` → `purchase_orders` / `goods_receipts`).
3. Ideally a **match-result view or RPC** (e.g. `document_match`, `document_flow`)
   exposing the computed 2/3-way verdicts, so the UI reads them instead of
   re-deriving business logic in the browser.

## 6. Extraction data-quality issues  ⬅ heads-up

Surfaced while mapping the Worklist. Not blocking display, but worth cleaning:

- **`ap_documents.document_type` casing/naming is inconsistent**: both `invoice` and
  `Invoice`, plus `purchase_order` / `acknowledgement` / `PO Acknowledgement` / `grn`.
  Makes grouping/filtering by type unreliable.
- Some extracted `po_number`s are garbage (`"No"`, `"Number"`, `"NUMBER"`).
- `ap_documents.ai_confidence` and exception `max_severity` are largely `null`, so the
  Confidence and Severity columns are sparse.

## 7. Document Pipeline bucket definitions  ⬅ blocks the Dashboard pipeline

The Dashboard's **Document Pipeline** funnel (Ingested → Extracted → Matched →
Approved → Posted) needs a precise membership rule per bucket — there is no single
column that classifies a document into a pipeline stage. We need from you:
- The exact rule for each bucket (which table/column/condition puts a document in
  Ingested vs Extracted vs Approved).
- **Matched** and **Posted** additionally depend on data that doesn't exist yet
  (matching — item 5; posting — item 8).

Until then the pipeline is shown with **static sample numbers**.

## 8. Posting + SLA data (drives several KPIs)  ⬅ blocks Reporting/Dashboard metrics

These are kept **static** in the UI because the underlying data is missing:
- **Posting**: `ap_documents.posted_at` is never populated (only a `mock_posted`
  flag). Needed for **Invoices Posted**, the pipeline **Posted** bucket, **Avg
  Processing time** (needs `posted_at − created_at`), and **Posting Ready**.
- **SLA**: `sla_due_at` / `sla_breached` are never set, and there's no completion
  timestamp. Needed for **SLA Compliance** and the **Processing Health** panel.
- **Match Rate**: depends on matching (item 5).
- Please define + populate a real posting/completion timestamp and an SLA policy
  (due-date or target duration) so these can move off static.

> Also: **"Invoices by Stage"** (Reporting) is deferred — it needs a real
> per-document lifecycle. `ap_documents.stage` is frozen at `"review"` for every row,
> so there is nothing to distribute today.

## 9. Document Lifecycle popup (Worklist hover) — new feature, currently mock-driven

The Worklist page now shows a hover popup on every row: a 4-stage chain (Purchase
Order → Acknowledgement → Goods Receipt → Invoice) with per-stage extraction status
and 2-way (PO↔GRN) / 3-way (PO↔GRN↔Invoice) match verdicts. **Only one field is real
today** — the hovered row's own document's extraction status, heuristically derived
from its linked email's `ai_understanding`. Everything else (the other 3 stages'
presence/status, and both match verdicts) is mock data
(`FrontEnd/src/data/lifecycleMock.ts`), because there's no reliable way to link a
specific invoice to its own PO/Ack/GRN chain — see item 5. To make this feature real,
we need:

- **Chain linkage** — a real FK or join key from a document's `ap_documents` row to
  the specific PO/Ack/GRN/Invoice rows that belong to the *same transaction* (e.g. a
  shared `document_chain_id`, or reliable FKs to `purchase_orders`/`goods_receipts`).
  Without this, stages can't be tied together for a given work item.
- **A clean per-stage extraction-status enum** — ideally a real column (e.g.
  `ap_documents.extraction_status: 'not_received' | 'received_pending' | 'extracted'
  | 'extraction_failed'`) instead of us inferring it from `ai_understanding`'s nested
  shape (presence of the object vs. presence of `extraction_status` vs. its value).
- **Extraction failure representation** — we did not observe any genuine "failed"
  value in ~60 sampled `ai_understanding.extraction_status` rows (only `completed`,
  `review_required`, `needs_review`). Please confirm whether/how a real extraction
  failure is ever recorded, and what a failure reason string should look like.
- **2-way / 3-way match verdict per document** — same ask as item 5, needed here as
  well; ideally a view/RPC returning `{status: 'matched'|'variance'|'review'|
  'not_yet_run', note}` for both 2-way and 3-way, keyed by document/chain.
- **Per-stage received timestamp** (PO/Ack/GRN receipt time) for display — not
  clearly available today outside the disconnected `goods_receipts.received_date`.

> Note: the frontend intentionally does NOT attempt any of this via
> `po_match_key`/`grn_match_key` string-matching — that's the same matching logic
> flagged in item 5, and is your call to make, not ours to approximate.

---

## Summary of asks

| # | Item | Action needed | Blocking? |
|---|------|---------------|-----------|
| 1 | Attachment files | Give bucket name + access model (public vs signed) | Blocks attachment **click-through** only |
| 2 | Supplier/Vendor normalization | Awareness; consider a `suppliers` table later | No |
| 3 | RLS read access | Confirm anon SELECT is intended | Not yet |
| 4 | Schema doc | Share column list if possible | No |
| 5 | Invoice↔PO↔GRN matching | Link real PO/GRN data; expose match/flow view or RPC | Blocks Worklist **Matched Against** + flow overlay |
| 6 | Extraction data quality | Normalize `document_type`; fix bad `po_number`s; populate confidence/severity | No (display degrades) |
| 7 | Pipeline bucket definitions | Define membership rule per pipeline stage | Blocks Dashboard **Document Pipeline** |
| 8 | Posting + SLA data | Populate posting/completion timestamp + SLA policy | Blocks Invoices Posted, Avg Processing, SLA Compliance, Match Rate, Invoices-by-Stage |
| 9 | Document Lifecycle popup data | Chain linkage, extraction-status enum, failure representation, match verdicts | Blocks 3 of 4 stages + both match verdicts in the new Worklist hover popup |
