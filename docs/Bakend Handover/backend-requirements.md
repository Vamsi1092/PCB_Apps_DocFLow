# DocFlow — Backend Requirements for Afrid

**From:** Frontend (DocFlow UI, reading Supabase directly, read-only)
**To:** Afrid (backend / database owner)
**Last updated:** 2026-07-23
**Purpose:** A clear, screenshot-referenced checklist of what the database needs to
provide so each part of the UI can show real data instead of a placeholder.

> This is the **presentation version** of [`backend-handoff.md`](backend-handoff.md)
> — same asks, reorganized by UI screen with screenshots attached so it's easy to
> hand to Afrid directly. `backend-handoff.md` remains the fuller incremental
> narrative if more technical detail is needed on any point.

## ⚠️ About the screenshots in this doc

The screenshots referenced below (`screenshots/*.png`) were provided in chat but
**are not yet saved as files in this repo** — there is no tool available to this
assistant that can extract a pasted chat image and write it to disk. To make the
image links below actually render:

1. Save each screenshot from the chat to `Projects/Docflow/docs/screenshots/`
2. Use the exact filenames listed in the table below (or update the links here to
   match whatever names you use)

| Filename | What it shows |
|---|---|
| `screenshots/inbox-list.png` | Inbox table — Received / Supplier / Vendor / Attachments |
| `screenshots/document-lifecycle-popup.png` | Worklist hover popup — PO-51309 4-stage chain |
| `screenshots/worklist-exceptions-severity.png` | Worklist — Exceptions / Severity columns |
| `screenshots/inbox-attachments-panel.png` | Inbox — Attachments column, wider view |
| `screenshots/document-review-header-panes.png` | Document Review — header + blank Invoice/PO preview panes |
| `screenshots/document-review-match-status.png` | Document Review — Match Status / Exception Summary / AI Priority / Recommended Action |
| `screenshots/document-review-send-to-approvals.png` | Document Review — Reviewer Note + Send to Approvals |
| `screenshots/approvals-sample-cards.png` | Approvals — sample cards (Meridian Textiles, Harborline Freight) |

---

## 1. Inbox page

![Inbox list](screenshots/inbox-list.png)
![Inbox attachments](screenshots/inbox-attachments-panel.png)

### 1a. Attachment files aren't fetchable — **blocking**
`email_attachments.storage_path` (e.g. `c12ea9dd-…/PO#14193.pdf`) is a path string,
but there's no accessible URL to actually stream the file. **Needed:**
- The Supabase **Storage bucket name** these paths live in.
- Access model: **public bucket** (simplest — we call `getPublicUrl(storage_path)`)
  or **private + signed URLs** (needs storage RLS to allow the anon role to call
  `createSignedUrl`, or a backend endpoint that mints one for us).

*Until resolved, attachment filenames render as plain non-clickable text.*

### 1b. Supplier/Vendor names aren't normalized — **not blocking display, but real evidence it matters**
Supplier and Vendor come from `email_messages.ai_understanding.header` (AI-extracted
free text), not a normalized table. The screenshot above shows the **same real
vendor** appearing as three different strings across different invoices:
- `RADWELL INTERNATIONAL, INC.`
- `RADWELL INTERNATIONAL LLC`
- `RADWELL INTERNATIONAL NEW JERSEY.`

This isn't just a display nuisance — it directly breaks the new Worklist ID format
(see §2 below), any future grouping/reporting by supplier, and the Top Exception
Suppliers chart on Reporting (each variant counts as a different supplier).
**Needed:** a normalized `suppliers` table (canonical name + address) with an FK
from documents/emails, or at minimum a name-normalization step in the extraction
pipeline.

---

## 2. Worklist page

![Worklist exceptions/severity](screenshots/worklist-exceptions-severity.png)

### 2a. Document ID format inherits the supplier-name problem above
The new ID format (`RIL-INV-35404276` = supplier initials + doc-type + reference)
is computed client-side from the same unnormalized supplier name. Because of §1b,
the **same vendor gets a different ID prefix** depending on which invoice's name
variant was extracted (e.g. `RII-` vs `RIL-` vs `RIN-` for the three Radwell
variants above). Fixing §1b fixes this automatically — no separate ask.

### 2b. Exceptions / Severity are sparse — **data reality, not a bug**
Only 2 rows exist in `exception_cases` today, so almost every row shows `0` /
`—`. Not something to "fix," just confirming this is real data, not a rendering
issue — more exception data will naturally populate these columns.

### 2c. Matched Against / Stage columns
These were **removed from the Worklist table** per product decision (not because
of a data gap) — matching and per-document stage are still needed elsewhere (Document
Review, Approvals, the Lifecycle popup, and the Dashboard pipeline), see §4 and §5.

---

## 3. Document Review page (opened from a Worklist row)

![Document Review header + panes](screenshots/document-review-header-panes.png)
![Match Status panel](screenshots/document-review-match-status.png)
![Send to Approvals](screenshots/document-review-send-to-approvals.png)

### 3a. Invoice + Purchase Order preview panes are blank — **blocking, bigger than it looks**
Both panes fail to load a document. This is **two separate gaps stacked together**:
1. Same root cause as §1a — no accessible file URL for the invoice's own attachment.
2. **New finding**: `purchase_orders` and `goods_receipts` have **no attachment/file
   column at all** (confirmed columns — `purchase_orders`: `id, po_number,
   supplier_id, po_date, currency, total_amount, open_amount, status, notes,
   created_at`; `goods_receipts`: `id, grn_number, po_id, supplier_id,
   received_date, notes, created_at, receiver_name, warehouse, status`). Even
   after §1a is fixed, the PO/GRN panes will **stay blank** unless either:
   - these tables get a `storage_path`-style column, **or**
   - (more likely, since PO/GRN documents already arrive as email attachments —
     `email_attachments.detected_type` includes values like `"Purchase Order"`) the
     **chain linkage** in §4 resolves a PO/GRN row to *its own* email attachment,
     the same way an invoice resolves to its own.

### 3b. Match Status shows "Unmatched" / "n/a" — same ask as §4/§5 below.

### 3c. A visible inconsistency you'll want to know about (not a backend ask — explained by §4)
The Exception Summary says **"No exception"** while Recommended Action says
**"Locate and link the correct purchase order, then re-run matching."** This looks
contradictory but is just a side effect of every document currently defaulting to
`match_type: 'unmatched'` — once real matching lands (§4), the recommended action
will stop firing for documents that have no real exception.

### 3d. "Failed to fetch" under Send to Approvals
If you still see this after refreshing, let me know — it was a frontend bug (the
button called a dead FastAPI endpoint) that's since been fixed to just navigate to
the Approvals page. **Not a backend/database item.**

---

## 4. The recurring blocker: Invoice ↔ PO ↔ GRN ↔ Ack linkage & matching — **the single biggest ask**

This one ask, once resolved, unblocks the Document Review match panel, the
Document Lifecycle popup (§5), the Approvals match badge, and half the
Reporting/Dashboard metrics. Today:
- `purchase_orders` (13 rows) are **synthetic seed data**, disconnected from real
  ingested invoices.
- Invoice `po_match_key` values (`APC11012405`, `41323385`, `9484`, or garbage like
  `"No"`/`"Number"`) **don't correspond** to those seed POs.
- Every invoice's `grn_match_key` is `null` → 3-way matching is impossible.

**What we need:**
1. **Real, linked PO/GRN/Ack data** that actually corresponds to ingested invoices
   (not seed rows).
2. A reliable way to say "these 4 documents (PO, Ack, GRN, Invoice) belong to the
   same transaction" — a shared `document_chain_id`, or clean FKs.
3. Ideally a **match-result view or RPC** returning the computed 2-way/3-way
   verdict, so the frontend reads it instead of re-deriving business logic.

---

## 5. Document Lifecycle popup (Worklist hover)

![Document Lifecycle popup](screenshots/document-lifecycle-popup.png)

This is a new feature. Only **one field is real** — the highlighted stage's
extraction status (derived heuristically from that document's own linked email).
Everything else in the popup (the other 3 stages, both match pills) is
clearly-labeled mock data, because of the linkage gap in §4. To make it fully real:
- Everything in §4, plus:
- A **clean extraction-status enum** (e.g. `not_received | received_pending |
  extracted | extraction_failed`) as a real column, instead of us inferring it from
  the shape of the `ai_understanding` JSON.
- Confirmation of whether/how a genuine **extraction failure** is ever recorded (we
  didn't observe one in ~60 sampled rows — only `completed`, `review_required`,
  `needs_review`).
- Per-stage **received timestamps** for display.

---

## 6. Approvals page

![Approvals sample cards](screenshots/approvals-sample-cards.png)

- Real data currently has **0 rows** with `status='pending'` (the one real
  `approval_requests` row is already decided), so the 3 cards shown are clearly
  labeled **"Sample"** placeholders. If you want the page demoable with real data,
  we'd just need at least one pending `approval_requests` row — not a schema
  change, just test data.
- The match badge on each card depends on §4.
- Approve/Return buttons are currently **visual-only** (no write) — see §7 for what
  real persistence would need.

---

## 7. 🚩 Flagging what might be missing — not yet covered above

Going back through every page built so far, two gaps aren't captured by the items
above:

### 7a. No real user/identity model
"Assigned To" (Worklist, Exceptions) and "Approver" (Approvals) currently show a
**hardcoded roster** in the frontend (`Maya Reyes`, `J. Okafor`, …) that doesn't
correspond to any real table. Related fields already in the schema —
`ap_documents.owner`, `exception_cases.owner`, `approval_actions.decided_by` — are
all free-text strings, not FKs. There's also **no authentication** anywhere in the
app today. Before any write features (assigning, approving) can persist for real,
we need either a real `users`/`team_members` table, or confirmation that free-text
names are the intended long-term model.

### 7b. Dashboard/Reporting still-static metrics (carried over from `backend-handoff.md`, summarized here for completeness)
- **Posting data**: `posted_at` never populated (only a `mock_posted` flag) — blocks
  Invoices Posted, Avg Processing, Posting Ready.
- **SLA data**: `sla_due_at`/`sla_breached` never set — blocks SLA Compliance.
- **Pipeline bucket rules**: no column classifies a document into
  Ingested/Extracted/Matched/Approved/Posted.
- **`ap_documents.stage`** frozen at `"review"` for every row — blocks a real
  "Invoices by Stage" breakdown.

### 7c. Smaller items, still open
- RLS: please confirm anon `SELECT` access is intentional (or tell us the auth
  model to move to).
- `document_type` casing/naming is inconsistent (`invoice`/`Invoice`,
  `purchase_order`/`acknowledgement`/`PO Acknowledgement`/`grn`/
  `Delivery / GRN Evidence`) and some extracted `po_number`s are garbage values.
- A schema doc / column list from your side would save us guesswork (we've been
  inferring columns by reading sample rows, since the anon key can't introspect
  schema).

**If anything else comes up as you build — anything the UI needs that isn't listed
here — flag it and we'll add it.**

---

## Summary table

| # | Item | Blocks | Priority |
|---|---|---|---|
| 1a | Attachment file storage access | Inbox click-through, Document Review Invoice pane | **High** |
| 1b | Supplier/Vendor normalization | Inbox, Worklist ID format, Reporting supplier chart | **High** |
| 3a | PO/GRN attachment resolution | Document Review PO/GRN preview panes | Medium (depends on §4) |
| 4 | Invoice↔PO↔GRN↔Ack linkage + match verdicts | Document Review, Lifecycle popup, Approvals badge, several metrics | **Highest — unblocks the most** |
| 5 | Lifecycle popup: status enum + failure repr. + timestamps | 3 of 4 popup stages | Medium |
| 6 | Pending approval test data | Demoing Approvals with real data | Low (just seed data) |
| 7a | Real user/identity model | Any future write features (assign/approve) | Medium (future phase) |
| 7b | Posting + SLA data, pipeline rules, real stage | Several Dashboard/Reporting metrics | Medium |
| 7c | RLS confirmation, data-quality cleanup, schema doc | General robustness | Low |
