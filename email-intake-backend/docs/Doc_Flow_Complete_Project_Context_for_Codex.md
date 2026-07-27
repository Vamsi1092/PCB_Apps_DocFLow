# Doc_Flow / Daiwa AI POC — Complete Project Context and Backend Handoff

**Prepared for:** Codex-assisted backend development  
**Backend owner:** Afrid Basha  
**Project:** PCB Apps — Daiwa Accounts Payable Document Flow / Intelligent AP Automation  
**Context date:** 22 July 2026  
**Primary stack:** Python, FastAPI, Microsoft Graph API, Supabase/PostgreSQL, OCI Generative AI  
**Frontend/integration partner:** Vamsi Krishna Reddy  

> **Core instruction for Codex:** Inspect the current repository and Supabase migrations before changing anything. Multiple historical code versions exist. Preserve working behavior, add regression tests, and improve the backend incrementally rather than rewriting it from scratch.

---

## 1. Purpose of this handoff

This document consolidates the complete working context of the `Doc_Flow` project so Codex can help complete an end-to-end functional backend. It covers:

- Business objective and architecture.
- Stakeholders and ownership.
- Outlook and Microsoft Graph integration.
- Attachment download and file readers.
- AI classification and extraction.
- Migration from Groq/Gemini experiments to OCI GenAI.
- Post-processing and structured persistence.
- Supabase schema evolution.
- UI integration and API contracts.
- Supplier resolution and ERP-reference validation.
- Reference PO/GRN generation.
- 2-way and 3-way matching.
- Completed tests and verified database counts.
- Historical bugs and fixes.
- Current gaps, technical debt and production-hardening priorities.
- A recommended Codex execution plan.

The repository is the source of truth for exact function signatures. This document is the source of truth for project intent, decisions, completed work and known gaps.

---

# 2. Business objective

The project automates Accounts Payable document processing from an Outlook shared mailbox.

## Current/manual process

```text
Supplier sends email
→ AP user opens Outlook
→ AP user downloads the attachment
→ AP user identifies the document
→ AP user manually enters or validates data
→ AP user checks supplier, PO and GRN in ERP/JDE
→ AP user decides whether to approve, reject or escalate
```

## Target automated process

```text
Supplier Email
→ Outlook Shared Mailbox
→ Microsoft Graph API
→ FastAPI Backend
→ Email and Attachment Persistence
→ AI Relevance Detection / Classification
→ Attachment Text Extraction
→ OCI GenAI Structured Extraction
→ Post-processing and Normalization
→ Supplier Resolution
→ ERP Reference Lookup
→ 2-Way / 3-Way Validation
→ Exception Detection
→ AI Priority and Recommended Action
→ Worklist / Dashboard APIs
→ Human Review / Approval
→ ERP Posting or Payment Process
→ Audit Trail
```

The React frontend must not call JDE/ERP directly. The backend owns email ingestion, AI processing, Supabase access, validation and clean API responses.

---

# 3. Stakeholders and ownership

## Afrid Basha

Current owner of:

- Entire FastAPI backend.
- Microsoft Graph / Outlook integration.
- Attachment retrieval and file reading.
- AI classification and extraction.
- OCI GenAI migration.
- Post-processing.
- Supabase writes and schema alignment.
- Supplier validation.
- POC reference PO/GRN generation.
- 2-way and 3-way validation.
- Worklist/dashboard/UI-facing APIs.
- Backend integration support for Vamsi.

## Vamsi Krishna Reddy

Primary owner of:

- React UI/frontend.
- Connecting UI screens to backend APIs.
- Dashboard, worklist, detail and review screens.
- Communicating required UI fields and payload expectations.

## Rohan Thorat

Coordination/delivery oversight. Important directions:

- Prioritize backend-to-UI integration.
- Deliver requested APIs together, not in disconnected pieces.
- Keep demo stability as the immediate priority.
- Provide clean APIs that combine data from multiple tables.

## Kaushik Ray

Supervisor and solution oversight. Important directions:

- Compare the current demo with the earlier ADW/enterprise-style demo.
- Reduce demo gaps and avoid unnecessary emphasis on Supabase in customer discussions.
- Keep the solution ready for a future enterprise database/JDE integration.
- Show practical end-to-end AP automation progress.

## Sri Vaishno Prattipati

Provided business, schema and extraction guidance:

- Header versus line-item meaning.
- PO, acknowledgement and GRN business meaning.
- UI views over normalized backend tables.
- Human-assisted versus autonomous processing.
- Reference extraction outputs for comparison.
- Backend design guidance for UI aggregation.

## Hima Alamanda

Previously owned much of the frontend and expected future workflow work. Hima later resigned. Items such as complete validation, exception queue, approval queue and reporting could not simply be assumed complete and had to be reviewed or built by the remaining team.

---

# 4. High-level architecture

```text
Microsoft Outlook Shared Mailbox
        │
        ▼
Microsoft Entra ID App Registration
        │
        ▼
Microsoft Graph API
        │
        ├── Read Inbox emails
        ├── Read attachment metadata
        ├── Download attachments
        ├── Read folders
        └── Move processed emails
        │
        ▼
FastAPI Backend
        │
        ├── graph_service.py
        ├── classification / AI services
        ├── post-processing service
        ├── supplier / Supabase services
        ├── reference_data_service.py
        ├── validation_service.py
        ├── dashboard/worklist services
        └── main.py routes/orchestration
        │
        ▼
OCI Generative AI
        │
        ├── Classification
        ├── Structured extraction
        ├── AI intent
        ├── Business summary
        └── Recommended action
        │
        ▼
Supabase / PostgreSQL
        │
        ├── Email metadata
        ├── Attachments
        ├── AP documents
        ├── AI runs
        ├── Structured headers/lines
        ├── Suppliers
        ├── POC reference PO/GRN
        ├── Validation results
        ├── Exceptions
        ├── Approvals
        └── Audit/reporting
        │
        ▼
FastAPI Read APIs
        │
        ▼
Vamsi React UI
```

Long-term architecture may replace or supplement Supabase with Oracle ADW and use JDE AIS/Orchestrator or another enterprise integration. Business logic should therefore be separated from storage/provider-specific code.

---

# 5. Microsoft Graph and Outlook integration

## Shared mailbox

```text
POC-JDEAI-Document-Flow@pentafourgroup.com
```

## Authentication

App-only client credentials flow was validated.

Environment variables used:

```text
TENANT_ID
CLIENT_ID
CLIENT_SECRET
MAILBOX_EMAIL
```

The backend calls the Microsoft token endpoint with:

```text
scope=https://graph.microsoft.com/.default
grant_type=client_credentials
```

## Completed Graph work

- Entra application credentials connected to Python.
- `/token` successfully generated access tokens.
- Shared mailbox resolution validated.
- Email retrieval implemented.
- Retrieval corrected to Inbox-only rather than mailbox-wide.
- Attachment metadata retrieval implemented.
- Attachment `contentBytes` download implemented.
- Base64 attachment data decoded and saved locally.
- Folder listing implemented.
- Inbox child folder listing implemented.
- Move-email-to-folder implemented.
- Batch Inbox processing implemented.
- Skip and failed-status handling implemented.

## Permissions seen during the POC

Examples included:

```text
Mail.Read
Mail.ReadWrite
Mail.Send
User.Read
User-Mail.ReadWrite.All
```

Production permissions must be restricted to the minimum required.

## Critical idempotency rule

Microsoft Graph message `id` can change after folder movement. The canonical schema contains:

```text
internet_message_id
```

This RFC-5322 ID is stable across folder moves and should become the primary ingestion deduplication key.

Current code historically checks:

```python
get_email_by_external_id(message_id)
```

Codex should keep backward compatibility but prefer:

1. `internet_message_id`.
2. Graph `external_message_id` only as fallback.

---

# 6. Outlook folder routing

Current folder map:

```text
Invoice         → Invoice
Purchase Order  → Purchase Order
Acknowledgement → Acknowledgement
GRN             → GRN
Others          → Others
```

GRN support was added after the first classification implementation.

A processed-folder concept such as `Docflow Processed` was also discussed. The exact final movement strategy must be aligned with the UI/business flow. The database includes `processed_folder`.

The email should be moved only after required persistence succeeds. Failed AI/storage/validation must not be presented as successful processing.

---

# 7. Attachments and file readers

Confirmed attachment support:

- PDF.
- Excel `.xlsx`.
- Word `.docx`.

Blueprint scope also mentioned images, but current confirmed implementation centers on PDF/Excel/Word text extraction.

Functions/imports used include:

```python
read_excel_content
read_docx_content
read_pdf_content
```

## Completed work

- Read Graph attachment metadata.
- Download actual content using Graph.
- Decode Base64.
- Save physical files in `downloads`.
- Extract text from supported file types.
- Send attachment content to classification/extraction.
- Store filename, MIME type, size and path metadata.

## PDF debugging

Real invoice logs confirmed:

- File existed.
- File size was non-zero.
- PDF text was extracted.
- Extracted content was sent to OCI.
- OCI completed successfully.

## Current limitations

- POC code often processes the first attachment only.
- Production must support multiple attachments and potentially multiple business documents per email.
- Do not expose local filesystem paths directly to a browser.
- Use controlled preview/download endpoints or object-storage URLs.

## PDF preview decision

Simple generated PDFs were tested but rejected as too plain for Vamsi’s UI. Artificial PDF generation was parked. Preserve original attachment preview/download until the UI contract is finalized.

---

# 8. AI journey and OCI migration

## Earlier model path

- Gemini was tried but quota/availability created issues.
- Groq Llama 3.1 8B was then used successfully.
- A backup such as `ai_service_groq_backup.py` was retained.

## OCI GenAI work completed

- OCI API signing key pair generated.
- `.pem` private key configured locally.
- `~/.oci/config` created.
- User, tenancy, fingerprint, region and key path configured.
- Compartment OCID obtained.
- OCI Python SDK installed and validated.
- OCI inference client tested.
- Classification tested successfully.
- Extraction tested successfully.
- `ai_service.py` aligned to OCI by default.
- OCI-specific config/helper modules introduced.
- Primary/fallback model cascade added.
- OCI response parsing and token usage extraction added.
- AI output normalized into backend JSON structures.

The project working context used the Ashburn region. Codex must read current `oci_config.py` rather than guess exact values.

## Security rules

Never commit or expose:

- OCI private key.
- Microsoft client secret.
- Supabase service-role key.
- Raw access tokens.
- Sensitive cloud configuration.

Use `.env` and ignored local configuration.

---

# 9. Classification

Current core categories:

```text
Invoice
Purchase Order
Acknowledgement
GRN
Others
```

Broader future blueprint categories:

```text
Supplier Statement
Credit Memo
Payment Advice
Dispute
General Inquiry
```

## Classification inputs

- Subject.
- Body preview/body.
- Attachment filename.
- Attachment text.
- File/MIME type.

## Classification output concept

```json
{
  "document_type": "Invoice",
  "confidence_score": 0.98,
  "reason": "The attachment contains an invoice number, supplier and payable total.",
  "target_folder": "Invoice",
  "ai_status": "success"
}
```

## Important classification rules

- Acknowledgement overrides Purchase Order when both a PO number and `ORDER CONFIRMATION`-type wording are present.
- Ship-to must never be treated as supplier.
- GRN extraction focuses on receipt information and `received_quantity`.
- Do not force invoice totals onto GRNs.
- Invalid/unsupported content should go to Others rather than a forced core type.

---

# 10. Structured extraction

## Common output concept

```json
{
  "document_type": "Invoice",
  "confidence_score": 0.98,
  "extraction_status": "completed",
  "header": {},
  "line_items": [],
  "ai_intent": "",
  "business_summary": "",
  "recommended_action": "",
  "validation_ready_fields": {},
  "exception_review": {}
}
```

Exact keys must be confirmed in current `ai_service.py` and `post_processing_service.py`.

## Invoice header fields implemented/discussed

```text
invoice_number
customer_number
po_number
supplier_name
supplier_id
buyer_name
bill_to_name
ship_to_name
invoice_date
due_date
payment_terms
currency
subtotal
tax_amount
freight_amount
total_amount
remit_to / bank_account
incoterms
customer_po
order_number
grn_number
total_rolls
csr_name
csr_email
comments
```

Missing source fields should remain `null`.

## Invoice line fields

```text
line_number
item_code
description
quantity
quantity_uom / unit
unit_price
amount / line_amount
confidence
po_line_ref
grn_line_ref
```

Rules:

- Preserve source line order.
- Include valid business rows.
- Do not invent values.
- Zero is a valid value.
- Missing is not zero.

## PO concepts

Header:

```text
po_number
supplier
ship_to
po_date
currency
payment_terms
total_amount
status
warehouse
```

Lines:

```text
line_number
item_code
description
ordered_quantity
unit
unit_price
line_amount
warehouse
```

## GRN concepts

Header:

```text
grn_number
po_number
supplier
received_date
status
source_system
```

Lines:

```text
line_number
item_code
description
received_quantity
accepted_quantity
rejected_quantity
unit
reference_po_line_id
```

## Acknowledgement

No confirmed dedicated acknowledgement header/line tables exist in the canonical model. Full output is retained in `ai_runs.result`, with normalized document metadata in `ap_documents`.

---

# 11. Extraction validation against Vaishno

A formal comparison was created for BlueStar Invoice `10614771`.

Captured result:

- 15 comparable header fields.
- 15 aligned header fields.
- 12 line-item checks.
- 100% line-item alignment.
- Overall result: aligned and ready for review.
- `customer_number` was found missing from the initial common schema.
- `customer_number` was added to:
  - common extraction schema,
  - fallback structure,
  - storage mapping,
  - `invoice_headers`.

Conclusion:

- No major invoice extraction redesign was needed.
- OCI also provided workflow-oriented fields including AI intent, exception review, validation keys, lifecycle stage, duplicate key and supplier validation key.

PO, Acknowledgement and GRN were validated separately against original PDFs.

---

# 12. Post-processing

A post-processing layer runs after OCI extraction.

Purpose:

- Normalize document type.
- Normalize dates.
- Normalize number formats.
- Preserve nulls.
- Clean AI structure.
- Map output to Supabase.
- Prepare validation-ready values.

Document type mapping:

```text
Invoice         → invoice
Purchase Order  → purchase_order
Acknowledgement → acknowledgement
GRN             → grn
Anything else   → others
```

Date formats handled included:

```text
YYYY-MM-DD
YYYY/MM/DD
DD-Mon-YYYY
DD-Mon-YY
DD/MM/YYYY
MM/DD/YYYY
```

Codex should centralize normalization utilities rather than keep them nested inside route/orchestration functions.


---

# 13. Supabase evolution and early fixes

## Initial model

The first implementation used:

```text
email_messages
email_attachments
extracted_documents
work_items
```

These enabled initial ingestion and UI experiments.

## Early issues fixed

### RLS insert failure

Error:

```text
new row violates row-level security policy
```

Cause:

- Backend used publishable/anon key.

Fix:

- Backend switched to service-role/secret key in `.env`.
- This key must remain server-side.

### Mandatory `received_at`

Error:

```text
null value in column "received_at" violates not-null constraint
```

Fix:

- Included Graph `receivedDateTime`.

### Null invoice-line amount

A freight line with null `amount` hit a non-null constraint. Mapping was adjusted so legitimate zero-valued lines can be stored while truly missing values are handled deliberately.

### Duplicate PO/GRN errors

Earlier structured PO/GRN persistence hit unique constraints on reruns. Get-or-create and duplicate-prevention behavior was later implemented, especially in the POC reference-data flow.

## Retired legacy model

Do not build new functionality on:

```text
extracted_documents
work_items
```

Use:

```text
ap_documents
ai_runs
structured tables
validation_results
exception_cases
approval_requests
audit_events
```

The worklist is a query/view over active `ap_documents`, not a separate table.

---

# 14. Canonical Supabase model

```text
mailboxes
   └── email_messages
         ├── email_attachments
         └── ap_documents
                ├── ai_runs
                ├── invoice_headers
                │      └── invoice_lines
                ├── validation_results
                ├── exception_cases
                │      └── comments
                ├── approval_requests
                │      └── approval_actions
                ├── statement_headers
                │      └── statement_lines
                └── audit_events

ERP/reference:
suppliers
supplier_aliases
purchase_orders
purchase_order_lines
goods_receipts
goods_receipt_lines
tolerance_rules
workflow_rules
reporting_snapshots

POC-generated validation reference:
reference_purchase_orders
reference_purchase_order_lines
reference_goods_receipts
reference_goods_receipt_lines
```

## Email intake tables

### `mailboxes`

```text
id
email_address
display_name
provider
active
created_at
```

### `email_messages`

```text
id
mailbox_id
external_message_id
internet_message_id
from_name
from_email
subject
body_preview
body_full
received_at
has_attachments
category
classification_confidence
status
suggested_action
ai_intent
ai_understanding
processed_folder
created_at
```

### `email_attachments`

```text
id
email_id
filename
file_type
size_kb
storage_path
detected_type
created_at
```

## Central workflow table

### `ap_documents`

```text
id
email_id
attachment_id
document_type
supplier_id
stage
priority
ai_priority_reason
sla_due_at
sla_breached
owner
ai_confidence
posted_at
erp_voucher_ref
mock_posted
is_active
archived_at
archive_reason
source_batch
recon_summary
created_at
updated_at
```

Historical guidance suggested exposing `owner` as `assigned_to` in API/view output before any physical rename.

## AI run table

### `ai_runs`

Stores raw model output, metadata and audit information.

Expected run structures:

Classification:

```json
{
  "document_type": "Invoice",
  "confidence": 0.98,
  "reasoning": "..."
}
```

Mail intent:

```json
{
  "ai_intent": "...",
  "summary": "...",
  "suggested_action": "..."
}
```

Extraction:

```json
{
  "header": {},
  "line_items": [],
  "business_summary": "...",
  "validation_ready_fields": {},
  "exception_review": {}
}
```

Return human-readable model names to UI, not long OCI OCIDs.

## Invoice tables

```text
invoice_headers
invoice_lines
```

`invoice_headers` includes document link, supplier, invoice number/date, due date, PO/GRN references, currency, amounts, terms and related fields.

`invoice_lines` includes line number, description, quantity, unit, price, amount, PO/GRN references and confidence.

## Structured PO/GRN tables

The project also uses:

```text
purchase_orders
purchase_order_lines
goods_receipts
goods_receipt_lines
```

These have been used for structured extracted documents and/or ERP-replicated records depending on schema/code version. Codex must inspect migrations and current service calls before consolidating responsibilities.

## Supplier master

```text
suppliers
supplier_aliases
```

Recommended resolution order:

```text
exact vendor_code
→ exact canonical name
→ alias
→ unresolved/null
```

## Validation and workflow

```text
validation_results
exception_cases
comments
approval_requests
approval_actions
tolerance_rules
workflow_rules
audit_events
reporting_snapshots
```

## Statements

```text
statement_headers
statement_lines
```

Statement reconciliation is modeled but is not the current primary completed flow.

---

# 15. Status and stage standards

## `email_messages.status`

Historical/current values:

```text
new
processing
processed
failed
```

A broader desired list discussed:

```text
received
classified
extracted
review
approved
posted
failed
```

Codex should define one canonical state machine and migrate existing values.

## `ap_documents.stage`

Observed values:

```text
review
matching
exception
posted
```

Desired business list discussed:

```text
review
matching
exception
approval
approved
ready_for_posting
posted
rejected
```

An earlier canonical lifecycle also included:

```text
inbox
extraction
matching
review
approval
posted
```

Database, backend and UI must use one consistent set.

---

# 16. Current FastAPI structure

Confirmed files/modules include:

```text
main.py
graph_service.py
supabase_service.py
classification_service.py
ai_service.py
ai_service_oci.py or OCI helper modules
ai_service_groq_backup.py
post_processing_service.py
reference_data_service.py
validation_service.py
oci_config.py
```

Codex should locate the modules providing:

```text
get_document_queue_records
get_dashboard_kpis
get_dashboard_pipeline
get_exceptions_by_severity
```

## Refactor direction

`main.py` became large through iterative development. Refactor incrementally:

```text
app/
  main.py
  config.py
  dependencies.py
  api/
    routes_ingestion.py
    routes_processing.py
    routes_documents.py
    routes_dashboard.py
    routes_exceptions.py
    routes_approvals.py
  services/
    graph_service.py
    attachment_service.py
    ai_service.py
    post_processing_service.py
    supplier_service.py
    reference_data_service.py
    validation_service.py
    priority_service.py
    recommendation_service.py
  repositories/
    email_repository.py
    document_repository.py
    supplier_repository.py
    reference_repository.py
    validation_repository.py
  schemas/
    email.py
    document.py
    extraction.py
    validation.py
    dashboard.py
  tests/
```

Do not break existing endpoints during refactoring.

---

# 17. Existing endpoints

## Basic and Graph

```text
GET /
GET /token
GET /emails
GET /save-email
GET /attachments
GET /save-attachment
GET /download-attachment
GET /save-downloaded-attachment
GET /folders
GET /inbox-child-folders
```

## AI, extraction and movement

```text
GET /classify-email
GET /ai-classification
GET /ai-classify-and-move-all
GET /debug-ai-input
GET /read-downloaded-file
GET /move-email
GET /extract-latest
```

## Historical development endpoints

```text
GET /save-extracted-document-test
GET /create-work-item-test
```

These refer to the legacy model and should eventually be removed or clearly marked development-only.

## Processing

```text
GET /process-latest-email
GET /process-inbox-emails
```

`/process-inbox-emails` tracks:

```text
total_found
processed
skipped
failed
results
```

Later code also attempts to mark an existing email as `failed` if processing throws an exception.

## Worklist/dashboard APIs completed

```text
GET /api/document-queue
GET /api/dashboard/kpis
GET /api/dashboard/pipeline
GET /api/dashboard/exceptions-by-severity
```

Supported date filters:

```text
today
week
month
last100
custom
```

For custom, `startDate` and `endDate` are required.

## Tested dashboard snapshot

KPIs:

```text
activeInvoices.count = 1
pendingReview.count = 4
openExceptions.count = 0
```

Pipeline:

```text
totalIngested = 4
Ingested = 4
Extracted = 4
Matched = 0
Coded = 0
Approved = 0
Posted = 0
label = Latest Records
```

Exception severity:

```text
Critical = 0
High = 0
Medium = 0
Low = 0
```

The zero values were valid because no exception cases existed in that test set.

## Proposed consolidated UI APIs

```text
GET /api/ui/documents
GET /api/ui/documents/{document_id}
GET /api/ui/documents/{document_id}/attachment
```

These remain a good target so the UI does not need to understand many tables.

---

# 18. Vamsi UI requirements

Primary queue columns:

```text
Document Type
Supplier
PO Number
Invoice Number
Invoice Date
Amount
Confidence
Intent
Status
```

Additional concepts:

```text
Priority
AI Priority Reason
Recommended Action
Assigned To
SLA
Stage
Exception Count
Document Reference
Attachment Preview
Validation Details
```

## `display_reference`

Return a concise reference:

```text
Invoice number
PO number
Acknowledgement number
GRN number
```

## `assigned_to`

Expose database `owner` as `assigned_to` in API/view output before a physical rename.

## Views/query services

The backend may contain many normalized tables. UI views/services should join and expose only required columns. The frontend should not perform database joins itself.

---

# 19. Current end-to-end processing pipeline

Approximate implemented flow:

```text
1. Read Outlook Inbox email.
2. Check whether already processed.
3. Read attachment metadata.
4. Download first attachment.
5. Extract PDF/XLSX/DOCX text.
6. OCI classification.
7. Save email with processing status.
8. Save attachment metadata.
9. OCI structured extraction.
10. Post-process/normalize output.
11. Create ap_documents.
12. Save ai_runs.
13. Save structured header and line items.
14. Resolve/store supplier.
15. For invoice, create/reuse POC Reference PO.
16. Create/reuse POC Reference GRN.
17. Run supplier/2-way/3-way validation.
18. Save validation_results.
19. Update ap_documents.stage.
20. Save AI intent and recommended action.
21. Mark email processed.
22. Move email to target folder.
23. Return IDs and processing result.
```

Historical return fields include:

```text
subject
status
document_type
target_folder
extraction_status
email_id
attachment_id
ap_document_id
invoice_header_id
purchase_order_id
goods_receipt_id
folder_movement
```

Future response should also expose:

```text
match_type
validation_status
priority
ai_priority_reason
recommended_action
exception_count
```

---

# 20. Email duplicate prevention

Current code includes behavior similar to:

```python
existing_email = get_email_by_external_id(message_id)

if existing_email:
    return {
        "status": "skipped",
        ...
    }
```

Required improvement:

- Prefer stable `internet_message_id`.
- Add/confirm a unique partial index.
- Use transactional upsert behavior.
- Folder movement must not cause reprocessing.

---

# 21. Supplier validation

Supplier validation is functionally implemented for the POC.

Intended flow:

```text
Extracted supplier
→ normalize
→ exact code
→ exact name
→ alias
→ supplier_id
→ compare invoice supplier to PO/ERP supplier
```

Current reviewed function uses direct ID equality:

```python
passed = invoice_supplier_id == reference_supplier_id
```

It produces `supplier_match`.

## Correctness gap

`None == None` is true. Missing supplier IDs could therefore be incorrectly treated as matched.

Required handling:

```text
invoice supplier missing → unavailable/review/fail
reference supplier missing → unavailable/review/fail
both present → compare IDs
```

The business decision between failure and review should be configurable.

---

# 22. POC reference ERP tables

Four POC tables were added:

```text
reference_purchase_orders
reference_purchase_order_lines
reference_goods_receipts
reference_goods_receipt_lines
```

Verified snapshot after seven invoice tests:

```text
reference_purchase_orders       = 7
reference_purchase_order_lines  = 16
reference_goods_receipts        = 7
reference_goods_receipt_lines   = 16
```

## Critical limitation

Current reference data is generated from invoice extraction:

```text
Invoice
→ generated Reference PO
→ generated Reference GRN
→ compared back to Invoice
```

This validates orchestration/storage, but not independent ERP truth.

Production must use:

```text
Invoice
→ actual JDE/ERP PO
→ actual JDE/ERP GRN
→ comparison
```

Do not describe the current reference generation as live JDE integration.

---

# 23. Reference PO generation

Function:

```python
generate_reference_purchase_order(invoice_header_id)
```

Behavior:

1. Validate invoice header ID.
2. Read invoice header.
3. Read invoice lines.
4. Require PO number.
5. Look up reference PO by PO number.
6. Reuse existing header if found.
7. Otherwise create header.
8. Read existing reference PO lines.
9. Build existing line-number set.
10. Insert only missing lines.
11. Return combined result.

Header fields created:

```text
po_number
supplier_id
po_date = invoice_date
currency
total_amount
open_amount = total_amount
payment_terms
source_system = JDE
status = OPEN
match_type = 2_WAY
notes = AI Generated Reference PO
```

Duplicate prevention:

```text
header → get_reference_purchase_order_by_number(po_number)
lines  → skip existing line_number
```

When all lines exist:

```text
Reference Purchase Order and lines already exist.
```

## Static match-type issue

`match_type = 2_WAY` is metadata on the generated PO. It does not prove final validation type.

Required dynamic rule:

```text
No PO      → UNMATCHED/NON_PO
PO only    → 2_WAY
PO + GRN   → 3_WAY
```

---

# 24. Reference GRN generation

Function:

```python
generate_reference_goods_receipt(invoice_header_id)
```

Behavior:

1. Read invoice.
2. Require PO number.
3. Read reference PO.
4. Read reference PO lines.
5. Build deterministic number:

```text
GRN-{po_number}
```

6. Reuse existing GRN if found.
7. Otherwise create GRN.
8. Read existing GRN lines.
9. Prevent duplicate lines using:
   - line number,
   - reference PO line ID.
10. Insert only missing lines.

Header fields:

```text
grn_number
reference_po_id
supplier_id
received_date
status = FULLY_ACCEPTED
source_system = JDE
notes
grn_total_amount
```

Line fields:

```text
reference_grn_id
reference_po_line_id
line_number
item_code
description
received_quantity
accepted_quantity
rejected_quantity = 0
unit
```

Reruns are idempotent, which explains unchanged original `created_at` values.

---

# 25. Validation service structure

Reviewed `validation_service.py` contains:

```text
ValidationResult
ValidationSummary
invoice/PO/GRN lookups
supplier validation
2-way header matching
2-way line matching
3-way matching
tolerance rules
validation persistence
document-stage update
validate_document orchestration
```

## `ValidationResult`

```text
passed
check_type
matched_value
expected_value
confidence
deviation_pct
note
```

## `ValidationSummary`

- Collects results.
- `passed()` requires all results to pass.
- `overall_status()` returns `MATCHED` or `VARIANCE`.

## Lookups

PO:

```text
invoice_headers.po_number
→ reference_purchase_orders.po_number
```

GRN:

```text
reference_purchase_orders.id
→ reference_goods_receipts.reference_po_id
```


---

# 26. 2-way matching

Business meaning:

```text
Invoice ↔ Purchase Order
```

Question:

```text
Are we being billed according to what was ordered?
```

Current header checks:

```text
po_exists
supplier_match
currency_match
amount_match
payment_terms_match
```

Current line checks:

```text
po_line_exists
quantity_match
unit_price_match
line_amount_match
description_match
```

Line joining currently uses `line_number`.

Descriptions are compared using trimmed uppercase exact equality.

---

# 27. 3-way matching

Business meaning:

```text
Invoice ↔ Purchase Order ↔ Goods Receipt
```

Question:

```text
Are we being billed for goods that were ordered and actually received?
```

Current checks:

```text
three_way_line_exists
three_way_quantity_match
three_way_description_match
```

Quantity rule:

```text
invoice quantity == PO ordered quantity == GRN received quantity
```

Description rule:

```text
invoice description == PO description == GRN description
```

Correct availability rule:

```text
No PO:
    UNMATCHED / NON_PO / exception route

PO exists, GRN absent:
    2_WAY

PO exists, GRN exists:
    3_WAY
```

All seven final invoice POC tests had generated PO and GRN records, so they followed the 3-way path.

---

# 28. Current validation gaps Codex must preserve and fix deliberately

## Gap 1 — Missing values become zeros or empty strings

Current patterns include:

```python
float(value or 0)
```

This can produce:

```text
None → 0
0 == 0 → matched
```

Affected values include quantity, unit price, line amount and possibly header amounts.

String comparisons can produce:

```text
"" == "" → matched
```

for missing currency, payment terms or descriptions.

Correct approach:

- Preserve null.
- Use explicit status such as:
  - `NOT_AVAILABLE`,
  - `NOT_COMPARABLE`,
  - `NOT_APPLICABLE`,
  - `REVIEW_REQUIRED`.
- Do not claim a match when both values are absent.

## Gap 2 — Reference generation converts missing quantity to zero

Reference PO lines use quantity if present, otherwise zero. GRN then copies that ordered quantity into received and accepted quantity.

An unextracted invoice quantity can therefore become zero in all three documents and falsely pass.

## Gap 3 — Static match type

Reference PO stores `2_WAY` even when GRN exists. This does not drive current validation but can mislead API/UI consumers.

## Gap 4 — Missing GRN currently creates a failed summary result

Current orchestration:

1. Runs 2-way checks.
2. Looks up GRN.
3. Adds `grn_exists`.
4. If no GRN, `grn_exists` is false.
5. Overall summary becomes `VARIANCE`.
6. Stage becomes `exception`.

This means a legitimate successful 2-way path is not fully modeled.

Required design:

```text
match_strategy = 2_WAY
→ GRN absence is expected/not applicable

match_strategy = 3_WAY
→ GRN absence is a failure/exception
```

Match strategy may come from workflow rules, PO type, supplier policy or document type.

## Gap 5 — `deviation_pct` often stores absolute deviation

Current logic calculates:

```text
abs(invoice_amount - po_amount)
```

This is not a percentage.

A true percentage:

```text
abs(actual - expected) / abs(expected) * 100
```

with zero-denominator handling.

## Gap 6 — Hardcoded tolerance

Current default:

```text
amount_tolerance = 1.00
```

This is an absolute amount. Production should read `tolerance_rules` by supplier, currency, document type and check type.

## Gap 7 — Validation reruns can duplicate rows

`save_validation_results()` inserts results. Direct reruns may append duplicates.

Options:

- Validation run/version table.
- Delete/replace current results transactionally.
- Current flag/version.
- Unique key per document/run/check/line.

## Gap 8 — Line number only

Production matching should support:

```text
PO line reference
item code
normalized description
quantity/unit
amount
composite/fuzzy matching
split receipts
partial receipts
```

## Gap 9 — Exact description equality

Formatting differences can create false mismatches. Normalize whitespace/punctuation and use controlled similarity while preserving source text.

## Gap 10 — Missing supplier/currency/terms can self-match

Explicit unknown handling is required. `None == None` and empty-string equality are not valid business matches.

---

# 29. Validation persistence and stage

Current stored fields:

```text
document_id
check_type
passed
confidence
matched_value
expected_value
deviation_pct
note
```

A previous schema mismatch was fixed when code used nonexistent `deviation`; current code uses `deviation_pct`.

Current stage logic:

```text
all checks pass → matching
any check fails → exception
```

Final workflow should distinguish:

```text
matching completed
review
approval
ready_for_posting
posted
exception
```

Recommended validation response:

```json
{
  "match_type": "3_WAY",
  "overall_status": "MATCHED",
  "stage": "review",
  "checks": [],
  "exceptions": [],
  "requires_human_review": false
}
```

---

# 30. Completed invoice validation test

Seven invoices were processed through the validation pipeline.

Verified snapshot:

```text
invoice_headers                    = 52
invoice_lines                      = 92
reference_purchase_orders          = 7
reference_purchase_order_lines     = 16
reference_goods_receipts           = 7
reference_goods_receipt_lines      = 16
validation_results                 = 156
```

Interpretation:

- Seven reference PO headers and seven GRN headers correspond to final tests.
- Larger invoice/validation counts include historical test records.
- Old/bad records should be cleaned or batch-tagged before demos.
- Reference data is generated POC data, not live ERP.
- Duplicate prevention was confirmed through code and unchanged timestamps.

The supplier/reference/validation backbone is complete for the POC path, but not production-complete.

---

# 31. Priority and `ai_priority_reason`

`ap_documents` contains:

```text
priority
ai_priority_reason
```

Current placeholder:

```text
priority = medium
ai_priority_reason = Default priority assigned during AI document extraction.
```

This is a current priority work item.

## Purpose

`priority`:

```text
low
medium
high
critical
```

`ai_priority_reason` explains why.

Example:

```text
High priority because the invoice exceeds the PO amount beyond tolerance and the due date is within two days.
```

## Required design

Priority must use grounded facts:

```text
supplier status
PO availability
GRN availability
match type
amount variance
quantity variance
currency mismatch
duplicate risk
missing mandatory fields
extraction confidence
due date/SLA
exception severity
workflow rules
```

Recommended implementation:

1. Compute deterministic facts in code.
2. Determine a rule-based baseline priority.
3. Ask OCI only to summarize/explain those facts in strict JSON.
4. Validate the returned enum.
5. Fall back to deterministic output when OCI fails.
6. Store facts/model/run used.

OCI must not invent failures.

---

# 32. Recommended action / suggested action

This already exists conceptually and in the backend.

Database field:

```text
email_messages.suggested_action
```

Current code passes:

```python
extraction_result.get("recommended_action")
```

into an email AI-details update function.

The project therefore has a naming mismatch:

```text
AI/API concept → recommended_action
database column → suggested_action
```

Recommended canonical API name:

```text
recommended_action
```

Database mapping can remain temporarily for compatibility.

## Difference

```text
ai_priority_reason:
Why is this document urgent?

recommended_action:
What should the AP user do next?
```

Example:

```json
{
  "priority": "high",
  "ai_priority_reason": "The invoice amount is outside PO tolerance.",
  "recommended_action": "Review the amount variance and route the invoice to the exception queue."
}
```

Suggested grounded actions:

```text
Approve invoice
Route to AP specialist
Route to manager
Request supplier clarification
Request missing PO
Request missing GRN
Review amount variance
Review quantity variance
Resolve supplier
Escalate case
Reject invalid document
Retry extraction
Ready for ERP posting
```

---

# 33. Exceptions and severity

Blueprint exception categories:

```text
Duplicate Invoice
Missing Purchase Order
Missing Receipt / GRN
Amount Mismatch
Quantity Mismatch
Supplier Not Found
Currency Mismatch
Invalid Document
Unreadable Attachment
Missing Mandatory Fields
Low Confidence
```

Severity levels:

```text
Critical
High
Medium
Low
```

UI/SLA meaning discussed:

```text
Critical → action now
High     → within 4 hours
Medium   → within 1 day
Low      → within 2 days
```

Full automatic creation/resolution of `exception_cases` was not confirmed complete.

Required design:

```text
validation failure
→ deterministic exception type
→ deduplicated open exception case
→ severity/SLA
→ AI summary
→ UI/API
```

AI summarizes facts; it does not invent the exception.

---

# 34. Approval workflow

Schema exists:

```text
approval_requests
approval_actions
```

Business decisions:

- AI-assisted: AI captures/recommends, human verifies.
- Autonomous: workflow continues without human approval when policy allows.
- Posting/payment remains human or downstream ERP unless explicitly automated.
- UI should support approve, reject, send back and escalate.

Table existence does not mean approval APIs are complete.

---

# 35. Audit requirements

Audit important events:

```text
email received
attachment downloaded
classification completed
extraction completed
supplier resolved/unresolved
PO found/not found
GRN found/not found
validation completed
priority assigned
exception created/updated
approval requested/actioned
email moved
document archived
ERP posting attempted/completed/failed
```

Suggested audit data:

```text
document_id
event_type
actor_type
actor
timestamp
before
after
metadata
correlation_id
```

---

# 36. Work completed chronology

## Architecture/planning

- Designed Outlook-only AP integration blueprint.
- Documented current versus future flow.
- Defined AP/AR mailbox concepts.
- Created architecture/Figma/flow artifacts.
- Defined phased roadmap from ingestion to AI recommendation and human action.
- Defined React, FastAPI, OCI and database responsibilities.

## Outlook/Graph

- Validated mailbox and app-only access.
- Generated Graph token in Python.
- Retrieved Inbox emails.
- Retrieved attachment metadata.
- Downloaded and saved attachments.
- Listed folders and child folders.
- Moved classified emails.
- Added GRN folder.
- Added batch processing.
- Added duplicate skip and failure handling.

## Supabase

- Connected FastAPI.
- Fixed RLS with service role.
- Fixed required `received_at`.
- Stored emails and attachments.
- Stored classification and AI runs.
- Stored invoice/PO/GRN structures.
- Migrated toward `ap_documents` and canonical model.
- Added `ai_intent`.
- Added `attachment_id`.
- Added supplier and alias tables.
- Added validation, exception, approval, rule, audit, report and statement tables.
- Added worklist/dashboard query layer.
- Added four POC reference ERP tables.
- Verified reference duplicate prevention.

## AI

- Implemented Invoice/PO/Acknowledgement/Others classification.
- Added GRN.
- Implemented header/line extraction.
- Added intent and recommended action.
- Added post-processing.
- Migrated to OCI.
- Configured OCI and validated SDK.
- Added fallback behavior.
- Compared OCI to Vaishno output.
- Added `customer_number`.
- Confirmed invoice alignment.

## UI integration

- Set up Hima’s local package.
- Resolved Node/npm and port issues.
- Confirmed Vamsi as UI owner.
- Captured required fields.
- Created document queue API.
- Created KPI, pipeline and exception-severity APIs.
- Tested latest-four-record dashboard behavior.
- Drafted consolidated list/detail/attachment contract.
- Agreed backend should return joined data.

## Supplier/validation

- Added supplier master/alias model.
- Implemented supplier ID comparison.
- Implemented reference PO/lines.
- Implemented reference GRN/lines.
- Added duplicate prevention.
- Added deterministic GRN number.
- Implemented PO/GRN lookup.
- Implemented 2-way checks.
- Implemented 3-way checks.
- Added tolerance handling.
- Stored validation results.
- Updated document stage.
- Processed seven invoice samples.
- Verified reference counts and rerun behavior.

---

# 37. Known incomplete or parked work

## High priority

1. Grounded dynamic priority.
2. Meaningful `ai_priority_reason`.
3. Standardized `recommended_action`.
4. Missing-value-safe validation.
5. Correct 2-way path when GRN is not required.
6. Dynamic `match_type`.
7. Actual ERP/JDE reference provider.
8. Exception-case creation/resolution.
9. Consolidated document detail API.
10. Transactional/idempotent pipeline.

## Medium priority

1. Database-backed tolerance rules.
2. Duplicate invoice detection.
3. Validation-run versioning.
4. Multi-attachment/multi-document handling.
5. Better line matching.
6. SLA calculation.
7. Owner/assigned-to workflow.
8. Approval APIs.
9. Audit events.
10. Test-data cleanup/batch tagging.

## Parked

1. Polished generated PDF previews.
2. Full ERP posting/payment.
3. Full statement reconciliation.
4. SharePoint ingestion.
5. ADW migration.
6. Autonomous processing policy.

---

# 38. Recommended Codex completion plan

## Step 1 — Inventory before edits

Codex must:

1. Read all Python files.
2. Read Supabase migrations.
3. List exact endpoints.
4. List tables/views.
5. Identify legacy/dead code.
6. Identify environment variables.
7. Identify newest code versions.
8. Produce the `process_email_pipeline()` call graph.
9. Compare repository behavior with this document.

## Step 2 — Add tests

Fixtures:

```text
Invoice with PO and GRN
Invoice with PO, no GRN
Invoice with no PO
Supplier mismatch
Currency mismatch
Amount inside tolerance
Amount outside tolerance
Quantity missing
Quantity mismatch
Duplicate invoice
Acknowledgement
Purchase Order
GRN
Others
```

Unit tests:

```text
classification normalization
date normalization
supplier resolution
reference duplicate prevention
2-way strategy
3-way strategy
tolerance
priority
recommended action
API serialization
```

## Step 3 — Transactional/idempotent persistence

Transaction boundary:

```text
email
attachment
ap_document
ai_run
structured data
validation
exceptions
priority
audit
```

A failure must not leave email as processed.

Use unique constraints/upserts for:

```text
internet_message_id
document/attachment identity
invoice duplicate key
PO number
GRN number
reference PO/GRN
header-line uniqueness
```

## Step 4 — Correct validation model

Introduce:

```python
MatchType = NON_PO | UNMATCHED | TWO_WAY | THREE_WAY
CheckStatus = PASS | FAIL | NOT_AVAILABLE | NOT_APPLICABLE
```

Determine match type before checks.

## Step 5 — Real tolerance service

Read `tolerance_rules` and return:

```text
absolute deviation
percentage deviation
allowed threshold
rule used
```

## Step 6 — Priority/recommendation service

Grounded input and strict output:

```json
{
  "priority": "high",
  "ai_priority_reason": "...",
  "recommended_action": "...",
  "source": "rules+oci",
  "confidence": 0.95
}
```

## Step 7 — Exception creation

Map failed checks to deduplicated exception cases, severity and SLA.

## Step 8 — UI APIs

Implement stable Pydantic APIs:

```text
GET /api/ui/documents
GET /api/ui/documents/{id}
GET /api/ui/documents/{id}/attachment
GET /api/ui/documents/{id}/validation
GET /api/ui/documents/{id}/exceptions
```

Keep old endpoints until Vamsi migrates.

## Step 9 — Approval APIs

```text
POST /api/documents/{id}/submit-for-approval
POST /api/approvals/{id}/approve
POST /api/approvals/{id}/reject
POST /api/approvals/{id}/send-back
POST /api/approvals/{id}/escalate
```

## Step 10 — ERP adapter

Define:

```python
class ERPReferenceProvider:
    get_supplier(...)
    get_purchase_order(...)
    get_purchase_order_lines(...)
    get_goods_receipts(...)
    get_goods_receipt_lines(...)
```

Implement providers:

```text
POCGeneratedReferenceProvider
SupabaseReferenceProvider
JDEOrchestratorProvider (future)
FileImportReferenceProvider (optional)
```

Validation must depend on the interface, not hardcoded tables.


---

# 39. Recommended consolidated document API

```json
{
  "document_id": "uuid",
  "email": {
    "email_id": "uuid",
    "subject": "Invoice 90815741",
    "from_name": "Resolute",
    "from_email": "sender@example.com",
    "received_at": "2026-07-22T00:00:00Z",
    "status": "processed",
    "processed_folder": "Invoice"
  },
  "attachment": {
    "attachment_id": "uuid",
    "filename": "Resolute invoice5524488.pdf",
    "file_type": "application/pdf",
    "size_kb": 536,
    "preview_url": "/api/ui/documents/{id}/attachment"
  },
  "document": {
    "document_type": "invoice",
    "document_reference": "90815741",
    "supplier": {
      "supplier_id": "uuid",
      "vendor_code": "optional",
      "name": "RESOLUTE FP US Inc."
    },
    "po_number": "5524488",
    "invoice_number": "90815741",
    "invoice_date": "2024-03-17",
    "due_date": "2024-04-16",
    "currency": "USD",
    "amount": 34802.46,
    "confidence": 0.98,
    "stage": "review",
    "priority": "medium",
    "ai_priority_reason": "All matching checks passed and the invoice is not near its due date.",
    "recommended_action": "Review and approve the invoice.",
    "ai_intent": "Supplier submitted an invoice for payment processing.",
    "assigned_to": null,
    "sla": {
      "due_at": null,
      "breached": false,
      "status": "Not Configured"
    }
  },
  "extraction": {
    "header": {},
    "line_items": []
  },
  "validation": {
    "match_type": "3_WAY",
    "overall_status": "MATCHED",
    "checks": [],
    "exceptions": []
  }
}
```

---

# 40. Coding rules for Codex

1. Do not delete working code before tests exist.
2. Do not reintroduce `extracted_documents` or `work_items`.
3. Do not expose service-role keys or cloud secrets.
4. Do not use Graph message ID as the only idempotency key.
5. Do not convert missing values to zero without business justification.
6. Do not let `None == None` count as a supplier/currency/terms match.
7. Do not claim live JDE validation while using generated reference data.
8. Do not make the React UI join backend tables.
9. Do not expose raw OCI OCIDs as human-facing model names.
10. Do not create duplicate PO, GRN, line, validation or exception rows.
11. Do not hardcode all business rules inside route handlers.
12. Do not let AI invent validation facts.
13. Preserve raw AI JSON for audit and store normalized fields relationally.
14. Use Pydantic request/response models.
15. Use structured logging and correlation IDs.
16. Replace data-changing GET endpoints with POST/background processing gradually.
17. Keep backward compatibility for Vamsi during migration.
18. Use migrations for schema changes.
19. Add indexes for UI filters and joins.
20. Return safe errors without secrets or stack traces.

---

# 41. Immediate Codex starting prompt

Use the following prompt with Codex after attaching the repository:

> Inspect the complete Doc_Flow repository and Supabase migrations. Do not rewrite the project. First produce:
>
> 1. A file/module inventory.
> 2. The exact current `process_email_pipeline()` call graph.
> 3. The exact database writes in execution order.
> 4. The exact API list.
> 5. Legacy/dead code that can be removed later.
> 6. Differences between the repository and the attached project handoff.
> 7. A test-first implementation plan for:
>    - dynamic 2-way/3-way match type,
>    - missing-value-safe validation,
>    - grounded priority and `ai_priority_reason`,
>    - standardized recommended action,
>    - exception-case creation,
>    - consolidated UI document APIs.
>
> Preserve all currently working Outlook, OCI, Supabase, reference-data and validation behavior until regression tests pass.

---

# 42. Definition of end-to-end backend completion

The backend is end-to-end functional when:

- Outlook Inbox ingestion is idempotent.
- Supported attachments are stored and traceable.
- Classification is accurate and auditable.
- Extraction is normalized and persisted.
- Supplier resolution distinguishes matched, unresolved and ambiguous.
- Duplicate invoice detection works.
- PO/GRN come from an independent reference provider.
- Match type is dynamic.
- Passing and failing 2-way/3-way tests exist.
- Missing values cannot produce false matches.
- Tolerances are database-driven.
- Validation results are versioned/idempotent.
- Exceptions are automatically created and exposed.
- Priority is grounded and explained.
- Recommended action is grounded and actionable.
- UI APIs return stable joined payloads.
- Approval actions are auditable.
- Failed runs are retryable.
- Emails move only after safe completion.
- State transitions are consistent.
- Secrets remain secure.
- Unit, integration and API tests pass.
- Demo data is separated from production/reference data.
- Real ERP integration can replace the POC provider without rewriting validation.

---

# 43. Final current-state summary

## Completed and working for the POC

```text
Outlook connectivity
Graph token generation
Inbox email retrieval
Attachment retrieval/download
PDF/XLSX/DOCX text reading
OCI classification
OCI extraction
Post-processing
Supabase persistence
Invoice/PO/Acknowledgement/GRN handling
Folder routing
AI intent
Suggested/recommended action field path
Document queue API
Dashboard APIs
Supplier/reference matching foundation
Reference PO/GRN generation
Reference duplicate prevention
2-way matching checks
3-way matching checks
Validation result storage
Document-stage update
Seven-invoice test
Database verification
```

## Not production-complete

```text
Actual JDE/ERP lookup
True successful 2-way path when GRN is not required
Dynamic match type
Missing-value-safe validation
Database-driven tolerance
Independent reference data
Grounded priority and priority reason
Complete exception workflow
Complete approval workflow
Validation versioning
Multi-attachment support
Stable consolidated UI detail APIs
Full audit coverage
Production deployment/security/observability
```

Correct project position:

> The ingestion, AI extraction and POC validation backbone is working. The next stage is correctness hardening, workflow intelligence, stable UI APIs and replacement of generated reference records with a real ERP reference provider.

---

# 44. Source artifacts reviewed

This handoff consolidates information from:

- Full Doc_Flow project conversation history.
- Outlook/Graph blueprint and execution notes.
- Canonical database schema documentation/migrations context.
- Backend API contract for UI integration.
- Current and historical `main.py`.
- Current `reference_data_service.py`.
- Current `validation_service.py`.
- OCI setup and helper code.
- OCI versus Vaishno extraction comparison workbook.
- Dashboard/worklist endpoint code.
- Pipeline logs and Supabase exports.
- UI/business transcripts involving Vamsi and Vaishno.

Multiple pasted code versions exist. The repository is the final source of truth for exact imports and signatures; this document is the consolidated source of truth for context, intent, decisions, completed work and gaps.
