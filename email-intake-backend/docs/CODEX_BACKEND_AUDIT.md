# Doc_Flow Backend Audit

> **Post-audit organization note (2026-07-22):** After this audit was
> completed, active implementations were moved under `app/`, documentation
> under `docs/`, historical copies under `legacy/`, and helpers under
> `scripts/`. Thin root compatibility modules preserve the original imports
> and `uvicorn main:app`. The behavioral findings remain applicable; use
> `docs/REPOSITORY_MAP.md` to translate the original paths.

Audit date: 2026-07-22  
Repository root: `C:\Users\Shaik Basha\email-intake-backend`  
Audit scope: read-only inspection; no runtime code, schema, environment, dependency, or external-system changes were made.

## Audit basis and limitations

- The complete 2,696-line `Doc_Flow_Complete_Project_Context_for_Codex.md` was read. It is treated as the source of truth for business intent, history, and intended architecture.
- The current repository is treated as the source of truth for implementation.
- Fifteen Python files, two startup scripts, the context file, and `.env` key names only were reviewed: 19 important repository files in total. Secret values were neither reported nor copied.
- The 34 files under `downloads/` were inventoried as sample/runtime artifacts (25 PDF, 8 DOCX, 1 XLSX); their business contents were not needed to determine the backend implementation.
- No `AGENTS.md`, README, dependency manifest, tests, SQL file, Supabase directory, migration, database view definition, `.gitignore`, or application server launcher exists in this folder.
- Consequently, deployed PostgreSQL primary keys, foreign keys, unique constraints, indexes, checks/enums, views, and RLS policies cannot be verified from this repository. Relationships described below are either evidenced by application payloads/lookups or stated as intended by the handoff; they are not claimed as deployed constraints.
- A read-only Python AST parse was attempted, but the checked-in virtual environment points to an inaccessible base interpreter. No tests were run because none exist, and the available application endpoints can mutate Outlook, local files, or Supabase.

## 1. PROJECT UNDERSTANDING

Doc_Flow is an Accounts Payable intake and review backend for AP staff and a React UI maintained by Vamsi. Its business goal is to replace manual mailbox triage and re-keying with a traceable flow: read a shared Outlook Inbox through Microsoft Graph, download a document, classify and extract it with OCI Generative AI, normalize the result, persist workflow and structured records in Supabase, resolve a supplier, compare invoices with purchase-order and receipt reference data, and expose a review worklist/dashboard for human action.

The intended lifecycle is:

```text
Supplier email
  -> Outlook shared Inbox
  -> Microsoft Graph retrieval/download
  -> FastAPI orchestration
  -> OCI classification
  -> email + attachment persistence
  -> OCI structured extraction
  -> deterministic post-processing
  -> AP document + AI run + structured data persistence
  -> supplier resolution
  -> PO/GRN reference lookup
  -> 2-way or 3-way validation
  -> priority/recommendation/exceptions
  -> joined UI APIs
  -> human approval/rejection/escalation
  -> future ERP posting and audit
```

The current reference flow is a POC harness, not JDE validation. It copies an extracted invoice into `reference_purchase_orders` and then copies that PO into `reference_goods_receipts`. Comparing the invoice back to those records proves that orchestration and persistence work, but does not compare against independent ERP truth. A future JDE integration must retrieve suppliers, POs, lines, receipts, and receipt lines through a provider interface; validation should not know whether the provider is POC data, Supabase replicated ERP data, file import, or JDE AIS/Orchestrator.

## 2. REPOSITORY INVENTORY

| File | Purpose and main symbols | Called/imported by | Assessment |
|---|---|---|---|
| `main.py` | Creates `app = FastAPI()`, defines 27 active endpoints and `process_email_pipeline()` | ASGI server would import `main:app`; imports every active service | Active monolithic entry point; includes development, broken legacy, and state-changing GET routes |
| `graph_service.py` | Graph client-credentials token, Inbox reads, attachment list/download, folder list, move, paginated Inbox read | `main.py` | Active; no timeouts/status checks; static folder IDs; local file writes |
| `classification_service.py` | Keyword `classify_email()` and PDF/XLSX/DOCX readers | `main.py` | Readers active; heuristic classifier used only by older endpoints, incomplete and order-sensitive |
| `ai_service.py` | OCI prompts, JSON/JSON-repair parsing for `classify_document()` and `extract_document_data()` | `main.py` | Active OCI service; output shape is not validated; hardcoded display model name |
| `oci_config.py` | OCI region/endpoint, primary and fallback model constants, default OCI config loader | `oci_genai.py` | Active; fallback constant is unused |
| `oci_genai.py` | Lazy OCI inference client and `get_chat_response()` | `ai_service.py` | Active; only primary model is called; SDK default retry is enabled; token usage is not captured |
| `post_processing_service.py` | Regex/business-specific cleanup, document-number correction, type-specific processors, status/intent generation | `main.py` | Active; very large and sample/vendor-specific; mutates trusted AI dictionaries directly |
| `generic_recovery_service.py` | Numeric conversion, calculated line recovery, line-number normalization, valid invoice-line filtering | `post_processing_service.py`, `main.py` | Active in part; `invoice_needs_recovery()` is unused |
| `supabase_service.py` | Global Supabase client, inserts/lookups/updates, legacy writes, document queue and dashboard query/format logic | `main.py`, reference and validation services | Active data-access layer; no repository abstraction/transaction; contains legacy functions and demo limits |
| `reference_data_service.py` | `generate_reference_purchase_order()` and `generate_reference_goods_receipt()` | `main.py` and two test POST routes | Active POC generator; application-level duplicate checks; invoice-derived, not ERP-derived |
| `validation_service.py` | Plain Python validation result classes, PO/GRN lookups, 2-way/3-way checks, tolerance, persistence, stage update | `main.py` | Active POC validation; known false-match and idempotency defects |
| `ai_service_groq_backup.py` | Older Groq classification/extraction with Llama 3.1 8B | Nothing imports it | Legacy backup; exact duplicate of `backup/ai_service.py` |
| `backup/ai_service.py` | Duplicate of Groq backup | Unused | Duplicate legacy file |
| `backup/oci_config.py` | Byte-identical copy of current OCI config | `backup/oci_genai.py` imports root module name, not explicitly this copy | Duplicate backup |
| `backup/oci_genai.py` | Older OCI helper with 4,000-token limit | Unused | Duplicate legacy file; current helper uses 12,000 tokens and logs finish reason |
| `start-work.ps1` | Creates/activates local `venv`; prints Python/pip versions | Manual developer use | Development helper; does not install dependencies or start FastAPI |
| `start-work.cmd` | Opens an activated command shell | Manual developer use | Development helper; does not start FastAPI |
| `Doc_Flow_Complete_Project_Context_for_Codex.md` | Business/architecture/history handoff | Human/Codex reference | Context source, not runtime code |
| `.env` | Local environment configuration | `python-dotenv` in active/legacy modules | Contains the names `TENANT_ID`, `CLIENT_ID`, `CLIENT_SECRET`, `MAILBOX_EMAIL`, `SUPABASE_URL`, `SUPABASE_KEY`, `COMPARTMENT_ID`, `OCI_REGION`, and legacy `GROQ_API_KEY`; values were not exposed. No `.gitignore` is present |
| `downloads/` | 34 original/sample downloaded artifacts | Graph download and file readers | Runtime/sample data mixed into source root; filenames can be overwritten and are not protected by a download API |

Third-party imports imply FastAPI, python-dotenv, requests, PyMuPDF (`fitz`), openpyxl, python-docx, Supabase Python, OCI SDK, json-repair, and legacy Groq. There is no reproducible dependency declaration or pinned version set.

## 3. CURRENT APPLICATION ENTRY POINT

- Entry point: `main.py`, global `app = FastAPI()`.
- Probable manual start command: `uvicorn main:app --reload`; no repository file documents or executes it.
- Routers: none. All routes are attached directly to `app`.
- Startup/shutdown/lifespan: none.
- CORS: none. A separately hosted React application will require same-origin proxying or CORS configuration.
- Dependency injection: none. Global Supabase and lazy global OCI clients are imported directly; Graph configuration is module-global.
- Configuration: every relevant module calls `load_dotenv()`. Graph and Supabase values are loaded at import time. OCI reads `COMPARTMENT_ID`/`OCI_REGION` from environment and credentials from the default OCI config file.
- Authentication/authorization: none at the FastAPI layer.
- Request/response models: none. There are no Pydantic domain/API schemas.
- Error semantics: many handlers catch exceptions and return an error object with HTTP 200; several expose `str(error)`.

## 4. COMPLETE API INVENTORY

There are 27 active routes. The older decorator at line 621 is inside a triple-quoted block and is not registered.

| Method/path | Handler; parameters | Main behavior/response | Writes/external calls | Status |
|---|---|---|---|---|
| `GET /` | `home`; none | `{message}` health-like response | None | POC only; not a readiness check |
| `GET /token` | `generate_token`; none | Returns raw Microsoft token endpoint JSON | Microsoft identity POST | Security-critical development endpoint; exposes access token |
| `GET /emails` | `read_emails`; none | Raw latest 10 Inbox messages | Microsoft identity + Graph GET | Development/raw provider response |
| `GET /save-email` | `save_first_email`; none | Saves first message with attachment, else first message | Graph reads; inserts `email_messages` | Mutating GET; no empty-list guard/dedup |
| `GET /attachments` | `read_attachments`; none | Clean attachment metadata for first email with attachments | Graph reads | Development endpoint |
| `GET /save-attachment` | `save_first_attachment`; none | Saves first attachment metadata for an already saved email | Graph reads; reads `email_messages`; inserts `email_attachments` | Mutating GET; first attachment only |
| `GET /download-attachment` | `download_first_attachment`; none | Returns local path string | Graph reads; writes `downloads/<name>` | Mutating GET/local path exposure |
| `GET /save-downloaded-attachment` | `save_downloaded_attachment`; none | Intended to decode/save an attachment | Graph/local write | Broken: treats returned path string as a dictionary |
| `GET /folders` | `read_folders`; none | Simplified mailbox folder list | Microsoft identity + Graph GET | Development; no pagination |
| `GET /inbox-child-folders` | `read_inbox_child_folders`; none | Raw Inbox child folders | Microsoft identity + Graph GET | Development; no pagination |
| `GET /classify-email` | `classify_email_with_attachment`; none | Keyword classification of first candidate; reads local XLSX only | Graph reads; local read | Legacy heuristic; no GRN rule and acknowledgement is checked after PO |
| `GET /read-downloaded-file` | `read_downloaded_file`; none | Reads a hardcoded XLSX sample | Local read | Hardcoded development endpoint |
| `GET /move-email` | `move_classified_email`; none | Keyword-classifies then moves first candidate | Graph reads and move POST | Mutating GET; heuristic can misroute |
| `GET /save-extracted-document-test` | `save_extracted_document_test`; none | Intended legacy test insert | Graph/read DB; intended `extracted_documents` insert | Broken: `save_extracted_document` is not imported; retired model |
| `GET /create-work-item-test` | `create_work_item_test`; none | Intended legacy test insert | Graph/read DB; intended `work_items` insert | Broken: `save_work_item` is not imported; retired model |
| `GET /ai-classification` | `ai_classification`; none | OCI classification of first email; only local XLSX text is read | Graph, local read, OCI | Development; PDF/DOCX content omitted |
| `GET /ai-classify-and-move-all` | `ai_classify_and_move_all`; none | Classifies latest 10, inserts each email, moves each | Graph download/move, OCI, `email_messages` inserts | Mutating GET; no dedup; PDF content reduced to filename |
| `GET /debug-ai-input` | `debug_ai_input`; none | Returns attachment text previews and OCI results | Graph download/local write, OCI | Development/data-exposure endpoint |
| `GET /extract-latest` | `extract_latest`; none | Intended OCI extraction plus legacy insert | Graph download/local write, OCI; intended legacy DB write | Broken: undefined `save_extracted_document`; PDF content omitted |
| `GET /process-latest-email` | `process_latest_email`; none | Runs `process_email_pipeline()` for newest Inbox email | Graph, local file, OCI, Supabase, Graph move | Mutating GET; no outer failure/status handling |
| `GET /process-inbox-emails` | `process_inbox_emails`; none | Paginated batch; returns total/processed/skipped/failed/results | Graph, local file, OCI, Supabase, Graph move | Main batch POC; mutating GET; sequential and non-transactional |
| `GET /api/document-queue` | `get_document_queue`; none | `{success,total_records,documents}` | Supabase reads | UI POC; latest four active docs only |
| `GET /api/dashboard/kpis` | `dashboard_kpis`; query `dateFilter`, `startDate`, `endDate` | KPI wrapper | Supabase reads | Demo-only; validates but ignores date range; latest four |
| `GET /api/dashboard/pipeline` | `dashboard_pipeline`; same query | Pipeline counts | Supabase reads | Demo-only; matched/coded/approved/posted fixed at zero |
| `GET /api/dashboard/exceptions-by-severity` | `dashboard_exceptions_by_severity`; same query | Static severity counts | None | Contract stub; all counts fixed at zero |
| `POST /api/reference-po/{invoice_header_id}` | `create_reference_po`; path UUID/string | POC reference PO and lines | Supabase reads/inserts | Temporary testing; not authenticated; not transactional |
| `POST /api/reference-grn/{invoice_header_id}` | `create_reference_grn`; path UUID/string | POC reference GRN and lines | Supabase reads/inserts | Temporary testing; not authenticated; not transactional |

All request inputs are query/path values; no endpoint accepts a modeled JSON body. There are no document detail, attachment preview/download, validation detail, exception workflow, approval, posting, retry, or audit APIs.

## 5. EXACT PROCESSING PIPELINE CALL GRAPH

### Entrypoints

```text
GET /process-latest-email
  -> graph_service.get_emails() (latest 10, first selected)
  -> process_email_pipeline(email)

GET /process-inbox-emails
  -> graph_service.get_all_inbox_emails() (follows @odata.nextLink)
  -> for each email: process_email_pipeline(email)
  -> on exception: lookup by external_message_id and set email status=failed
```

### Exact current flow and writes

| Order | Function/file | Inputs -> outputs | Table or external state | Failure and idempotency |
|---:|---|---|---|---|
| 1 | `process_email_pipeline()` / `main.py` | Graph email -> message fields | None | Reads both IDs but only uses Graph `id` for dedup |
| 2 | `get_email_by_external_id()` / `supabase_service.py` | Graph message ID -> first email row or null | Reads `email_messages` | Any existing status is skipped; failed/incomplete rows cannot retry |
| 3 | `get_attachments()` / `graph_service.py` | message ID -> raw attachment list | Graph GET | First attachment only; no attachment pagination/status check |
| 4 | `download_attachment()` / `graph_service.py` | message/attachment IDs -> local path | Graph GET; overwrites `downloads/<filename>` | Happens before any DB row; filename is not sanitized; not idempotently identified |
| 5 | file reader / `classification_service.py` | local path -> text | Local file read | XLSX, DOCX, PDF by suffix; unsupported type becomes filename text |
| 6 | `classify_document()` / `ai_service.py` | subject/body preview/text -> classification dict | OCI call | Prompt-only schema; failure returns `Others` fallback instead of raising |
| 7 | `save_email()` / `supabase_service.py` | metadata/status `processing` -> row | Inserts `email_messages` | No upsert/transaction; stores `internet_message_id` but does not query it |
| 8 | `save_attachment()` / `supabase_service.py` | first attachment metadata/local path -> row | Inserts `email_attachments` | No dedup; skipped when no attachment |
| 9 | `extract_document_data()` / `ai_service.py` | subject/body preview/text -> extraction dict | OCI call | Failure returns a review-shaped `Others` object and pipeline continues |
| 10 | `post_process_extraction()` / `post_processing_service.py` | AI dict/text -> mutated normalized dict | None | Vendor/sample-specific regexes; no Pydantic validation |
| 11 | `get_supplier_id_by_alias()` / `supabase_service.py` | extracted name -> first alias supplier ID/null | Reads `supplier_aliases` | Alias-only, no ambiguity result, creation, canonical-name, or vendor-code lookup |
| 12 | `save_ap_document()` / `supabase_service.py` | normalized type, supplier, defaults -> ID | Inserts `ap_documents` | Always `priority=medium`, initial `stage=review`; no document dedup |
| 13 | `save_ai_run()` / `supabase_service.py` | full extraction result -> row | Inserts `ai_runs` | Stores extraction only; reruns duplicate; classification run is not stored |
| 14a | Invoice branch / `main.py` | header -> invoice ID | Inserts `invoice_headers` | Unknown invoice number becomes literal `UNKNOWN-INVOICE`; no duplicate check |
| 14b | `get_valid_invoice_lines()` then `save_invoice_lines()` | only lines with a non-null amount -> rows | Inserts `invoice_lines` | Missing-amount business lines are silently dropped; no dedup |
| 15 | `generate_reference_purchase_order()` / `reference_data_service.py` | invoice ID -> reference PO/lines | Reads invoice/ref tables; conditionally inserts reference PO and missing lines | Reuses header by PO number and lines by line number; app-level/non-atomic; missing quantity/price becomes zero |
| 16 | `generate_reference_goods_receipt()` / `reference_data_service.py` | invoice ID -> reference GRN/lines | Reads ref tables; conditionally inserts deterministic `GRN-{po}` and missing lines | Requires supplier/date; app-level/non-atomic; missing quantity becomes zero |
| 17 | `validate_document()` / `validation_service.py` | invoice ID -> summary/reference objects | Reads invoice/ref lines; inserts `validation_results`; updates `ap_documents.stage` | Static sequence always attempts GRN; rows duplicate on rerun; missing PO early return is not persisted |
| 18a | PO branch / `main.py` | extracted header/lines -> IDs | Inserts `purchase_orders`, `purchase_order_lines` | No get-or-create; missing received quantity becomes zero |
| 18b | GRN branch / `main.py` | extracted header/lines -> IDs | Reads `purchase_orders`; inserts `goods_receipts`, `goods_receipt_lines` | No duplicate prevention; accepted/rejected quantities are not mapped |
| 18c | Acknowledgement/Others branch | extraction -> no dedicated structured row | Only prior `ap_documents`/`ai_runs` | Full result is retained only in AI run |
| 19 | `update_email_ai_details()` / `supabase_service.py` | intent, entire extraction, recommended action | Updates `email_messages` | Maps API `recommended_action` to DB `suggested_action` |
| 20 | `update_email_status()` / `supabase_service.py` | email ID -> `processed` | Updates `email_messages` | Occurs before mailbox move |
| 21 | `move_email_to_folder()` / `graph_service.py` | message ID/final type folder -> Graph JSON | Graph POST move | Only classification `ai_status` gates move; Graph error response is not checked; DB `processed_folder` is not updated |
| 22 | `process_email_pipeline()` | IDs/type/status -> response | None | Reports `folder_movement=completed` whenever classification succeeded, even if Graph move returned an error |

For the batch endpoint, a thrown error after email insertion causes a best-effort status change to `failed`. Earlier rows and local files remain. The dedup rule then blocks automatic retry of that failed row. The latest-email endpoint lacks this outer recovery. `EmailPipelineError` exists but is never raised or caught.

## 6. DATABASE AND SUPABASE MAP

### Repository-evidenced tables

The code directly references 18 table names and zero views.

| Table | Evidenced important columns/relationships | Usage/status |
|---|---|---|
| `email_messages` | `id`, `external_message_id`, `internet_message_id`, sender/body/received fields, category/confidence, status, `suggested_action`, `ai_intent`, `ai_understanding` | Active inserts/reads/updates; no mailbox ID is written |
| `email_attachments` | `id`, `email_id`, filename/type/size/path/detected type; legacy endpoint also sends `graph_attachment_id` | Active first-attachment insert |
| `supplier_aliases` | `alias`, `supplier_id` | Active read only |
| `ap_documents` | `id`, email/attachment/supplier IDs, type, stage, priority/reason, confidence, active, recon summary, created time | Active central workflow insert/read/update |
| `ai_runs` | document/email IDs, run type, model, confidence, result, mock mode, created time | Active extraction audit/read |
| `invoice_headers` | document/supplier IDs, invoice/customer/PO/GRN refs, dates, currency, totals, terms, bank account, notes | Active invoice insert/read |
| `invoice_lines` | invoice ID, line number, description, quantity/unit/price/amount, PO/GRN refs, confidence | Active invoice insert/read |
| `purchase_orders` | ID, PO number, supplier/date/currency/amount/open amount/status/notes | Active extracted-PO insert/read |
| `purchase_order_lines` | PO ID, line number, item/description/quantity/unit/price/amount/received qty | Active extracted-PO insert |
| `goods_receipts` | ID, GRN number, PO/supplier IDs, received date, receiver/warehouse/status/notes | Active extracted-GRN insert/read |
| `goods_receipt_lines` | GRN/PO-line IDs, line/item/description/quantity/unit | Active extracted-GRN insert |
| `reference_purchase_orders` | ID, PO number, supplier/date/currency/amount/open amount/terms/source/status/match type/notes | Active POC generation/validation |
| `reference_purchase_order_lines` | ID, reference PO ID, line/item/description/ordered qty/unit/price/amount/currency/status | Active POC generation/validation |
| `reference_goods_receipts` | ID, GRN number, reference PO/supplier IDs, date/status/source/notes/total | Active POC generation/validation |
| `reference_goods_receipt_lines` | ID, reference GRN/PO-line IDs, line/item/description/received/accepted/rejected qty/unit | Active POC generation/validation |
| `validation_results` | document ID, check type, passed, confidence, matched/expected, `deviation_pct`, note | Active append-only insert |
| `extracted_documents` | legacy extraction fields | Retired function remains; current routes that call it are broken |
| `work_items` | legacy email/type/priority/status/review/action fields | Retired function remains; current route that calls it is broken |

### Context-only or unconfirmed tables

The handoff describes `mailboxes`, `suppliers`, `exception_cases`, `comments`, `approval_requests`, `approval_actions`, `tolerance_rules`, `workflow_rules`, `audit_events`, `reporting_snapshots`, `statement_headers`, and `statement_lines`. No current repository query, write, migration, or schema file confirms them. `supplier_id` values imply a supplier table may exist remotely, but the backend never queries it.

Across repository evidence plus the handoff there are 30 distinct table names: 28 intended canonical tables and 2 retired legacy tables. Only 18 are referenced by current code.

### Constraints, indexes, views, and RLS

- IDs are treated as row identifiers; relationships such as `email_attachments.email_id -> email_messages.id`, `invoice_headers.document_id -> ap_documents.id`, and line-to-header IDs are inferred from code. Enforcement cannot be verified.
- No unique constraint can be confirmed for `internet_message_id`, invoice duplicate keys, PO/GRN numbers, or line identities.
- No index, enum, check constraint, or view is defined locally.
- Application-level duplicate checks exist only for generated reference PO/GRN headers and lines.
- The handoff says the server uses a Supabase service-role key after an RLS failure. The local variable is generically named `SUPABASE_KEY`; key type and deployed RLS cannot be verified without exposing/using credentials.

## 7. MICROSOFT GRAPH AND OUTLOOK IMPLEMENTATION

- Authentication is OAuth 2.0 client credentials against the tenant v2 token endpoint with Graph `.default` scope.
- Mailbox selection is the `MAILBOX_EMAIL` environment variable.
- Both message readers correctly use `mailFolders/inbox/messages`; `get_emails()` returns the newest 10 and `get_all_inbox_emails()` starts at 25 and follows `@odata.nextLink`.
- Attachments are listed through `/messages/{message_id}/attachments`; an individual file attachment is fetched and decoded from `contentBytes` into `downloads/`.
- Root folders and Inbox child folders can be listed. Movement posts to `/messages/{id}/move` with hardcoded destination IDs for five categories.
- Pagination exists only for the batch Inbox reader. Attachment and folder lists do not paginate.
- No request sets a timeout, calls `raise_for_status()`, interprets non-2xx responses, handles throttling explicitly, or refreshes/retries at the application layer. OCI has SDK retries; Graph does not.
- Every operation requests a new token; there is no token cache.
- The download filename is provider-controlled and joined directly to `downloads`, allowing collisions and potentially unsafe path components.
- No email is marked with `processed_folder`; a move response is not validated.
- The pipeline stores `internetMessageId` but deduplicates exclusively with `get_email_by_external_id(message_id)`. Moving a message can change its Graph ID, so the current canonical duplicate key is incorrect.

## 8. OCI AI IMPLEMENTATION

- OCI configuration comes from the default OCI config file; region defaults to `us-ashburn-1`, and the service endpoint is derived from it.
- Primary model: `google.gemini-2.5-pro`.
- Configured fallback: `xai.grok-4.20-reasoning`, but no code ever calls it. There is no model cascade despite the handoff claiming one.
- Client creation is lazy and uses OCI's default retry strategy.
- Classification prompts require one of Invoice, Purchase Order, Acknowledgement, GRN, or Others and a JSON object with type, confidence, reason, folder, and status.
- Extraction prompts allow the five core categories plus Credit Memo, Supplier Statement, and Payment Follow-up; they request a broad header, line items, intent, summary, action, lifecycle, exception review, and validation-ready keys.
- Classification strips fences and repairs malformed JSON. Extraction extracts a brace block/fence and repairs malformed JSON.
- The code does not validate enums, required keys, numeric ranges, nested shapes, or types with Pydantic. Parsed dictionaries are trusted and mutated.
- `ai_model_used` is hardcoded to `OCI Gemini 2.5 Pro`, rather than derived from the actual serving response. OCI OCIDs are not exposed, but fallback attribution would be wrong if fallback were added without changing this.
- Token usage, latency, request IDs, finish status persistence, and classification AI-run persistence are absent. Finish reason is only printed.
- Exceptions are returned in API/AI result dictionaries. Full input and output document text is printed, creating confidentiality/log-volume risk.
- `ai_service_groq_backup.py` and `backup/ai_service.py` are identical legacy Groq/Llama implementations. No standalone Gemini legacy file exists; Gemini is now accessed through OCI.

## 9. DOCUMENT CLASSIFICATION AND EXTRACTION

| Type | Active classification/extraction | Structured destination | Routing and mapping gaps |
|---|---|---|---|
| Invoice | OCI plus substantial invoice/vendor regex correction | `ap_documents`, `ai_runs`, `invoice_headers`, filtered `invoice_lines`, then generated references/validation | `item_code` and line currency are not persisted; no duplicate invoice check; missing-number fallback is `UNKNOWN-INVOICE`; missing-amount lines are dropped |
| Purchase Order | OCI plus CNG/Jealous Devil-oriented corrections | `ap_documents`, `ai_runs`, `purchase_orders`, `purchase_order_lines` | No PO dedup; date uses `document_date`; `quantity_uom` is mapped but alternate unit names may be lost; received qty defaults to zero |
| Acknowledgement | OCI plus hardcoded order-confirmation corrections | `ap_documents`, `ai_runs` only | No dedicated header/line table; one correction hardcodes buyer, supplier, and payment terms for a sample family |
| GRN | OCI plus receipt quantity fallback | `ap_documents`, `ai_runs`, `goods_receipts`, `goods_receipt_lines` | No GRN dedup; accepted/rejected/ordered quantities are not persisted; PO line link always null |
| Others | OCI fallback/general result | `ap_documents`, `ai_runs` | Unsupported files can still be recorded as processed; no invalid-document exception |

The active final folder map supports all five categories. The older keyword classifier has no GRN path, checks Purchase Order before Acknowledgement, and can therefore violate the acknowledgement override rule. Only the first attachment is processed. Credit Memo, Supplier Statement, and Payment Follow-up can be returned by extraction, but normalize to `others` and have no dedicated workflow.

## 10. SUPPLIER VALIDATION

Actual flow:

```text
header.supplier_name or top-level supplier_name
  -> trim string
  -> supplier_aliases.ilike(alias, supplied name).limit(1)
  -> supplier_id or null
  -> store on ap_documents/invoice or extracted PO/GRN
  -> generated reference PO copies the same supplier_id
  -> generated GRN copies it again
  -> validation compares IDs directly
```

There is no vendor-code lookup, canonical `suppliers.name` lookup, explicit normalization beyond trim/case-insensitive query, supplier creation, unresolved/ambiguous state, candidate list, or confidence. The first alias match wins.

`validate_supplier()` performs `invoice_supplier_id == reference_supplier_id`. Therefore `None == None` passes. For invoice-generated references, any non-null supplier also necessarily matches because it was copied from the invoice. Currency and payment terms have the same self-copy/self-match problem.

## 11. REFERENCE PO/GRN GENERATION

`generate_reference_purchase_order(invoice_header_id)` reads the invoice header and lines, requires a PO number, reuses the first reference PO with that number or inserts one, reads existing reference lines, and inserts only invoice line numbers not already present. It marks the source as `JDE`, status `OPEN`, notes as AI-generated, and always sets `match_type = 2_WAY`. Because these values originate from the invoice, `source_system = JDE` is misleading.

Header duplicate prevention is a pre-read by PO number. Line prevention is a pre-read/set by non-null line number. It is not transaction-safe and cannot prevent concurrent duplicates without an unverified DB unique constraint. Lines with a null line number are not included in the existing-number set and can be duplicated. Existing headers are not reconciled when invoice values change.

Missing ordered quantity and unit price are converted to zero. That zero is then copied into validation reference data.

`generate_reference_goods_receipt(invoice_header_id)` reads the same invoice and reference PO, requires a supplier, creates/reuses deterministic `GRN-{po_number}`, and creates only lines whose line number and PO-line ID are both absent. It detects zero/null ordered quantities only to annotate notes, then converts null to zero and copies ordered quantity into both received and accepted quantities. Rejected quantity is always zero. Header and line checks are also non-atomic.

Reruns are usually idempotent in a single-threaded happy path, but correctness relies on application reads, exact PO/line identity, and remote constraints that cannot be verified. These are POC-generated records, not independent live JDE records.

## 12. 2-WAY AND 3-WAY VALIDATION

`validate_document()` reads an invoice, looks up reference PO by exact PO number, performs header and line checks, always looks for a reference GRN, performs 3-way checks if found, applies a hardcoded absolute amount tolerance, inserts results, and updates stage.

Implemented checks:

- PO: `po_exists`.
- 2-way header: supplier ID, exact currency, exact total amount before tolerance, normalized exact payment terms.
- 2-way line: reference line lookup by exact `line_number`; exact quantity, unit price, line amount before tolerance, and trimmed uppercase description.
- GRN: `grn_exists`.
- 3-way line: both PO and GRN lines by exact `line_number`; exact three-document quantity and description.

Confirmed defects/limitations:

- `None == None` passes supplier and currency; missing terms/descriptions normalize to `"" == ""` and pass.
- Missing numeric values become `0.0`; missing invoice, PO, and GRN quantities/prices/amounts can falsely pass.
- Generated reference values are copied from the invoice, so most matches are circular.
- Match type is not determined or returned. Generated PO metadata is statically `2_WAY` even though the pipeline immediately generates a GRN and runs 3-way checks.
- A missing GRN adds a failed `grn_exists`, making the summary `VARIANCE` and stage `exception`; there is no legitimate successful 2-way strategy.
- `deviation_pct` stores absolute differences, not percentages.
- `amount_tolerance=1.00` is hardcoded and absolute. `tolerance_rules` is never queried.
- Validation inserts are append-only and unversioned; reruns duplicate rows.
- Line matching uses line number only. It ignores item code, explicit PO references, UOM, partial/split receipts, and extra reference lines.
- Description comparison is exact after trim/uppercase only.
- Found lines do not receive a positive `po_line_exists`/`three_way_line_exists` result; those checks are recorded only on failure.
- A missing PO returns a `ValidationSummary` object early without saving the failure or updating document stage. In the main pipeline, reference generation usually raises first, leaving partial records.
- `ValidationSummary` is a plain class, not a serializable Pydantic schema. Normal success returns a dictionary containing that object, but the main response omits validation entirely.
- Passing results set stage to `matching`, while failed results set `exception`; no review/approval/ready-for-posting transition is modeled.

## 13. PRIORITY AND RECOMMENDED ACTION

- `ap_documents.priority` is always inserted as `medium`.
- `ap_documents.ai_priority_reason` is always `Default priority assigned during AI document extraction.` It is not AI- or rules-derived.
- The queue changes that placeholder at read time to a demo-friendly sentence claiming an AI assessment, returns it as `priority_reason`, and omits the actual `priority` field. This obscures its placeholder origin.
- Initial `email_messages.suggested_action` is `Move to <folder> Folder`.
- Later, `extraction_result.recommended_action` is written into the same `suggested_action` column.
- The queue/dashboard do not expose recommended/suggested action.
- `ai_intent` begins as classification reasoning, then is overwritten with a deterministic post-processing narrative. `ai_understanding` begins as classification JSON, then is overwritten with the complete extraction JSON.
- No SLA due date, breach calculation, severity-to-SLA rule, duplicate risk, validation fact, amount threshold, confidence threshold, or workflow rule influences priority.
- There is no standardized action enum or grounded priority/recommendation service.

## 14. UI AND DASHBOARD API SUPPORT

`/api/document-queue` returns only the latest four active documents. It joins the latest extraction AI run and selected normalized tables, returning document/display IDs, formatted type, supplier, document reference, formatted PO number, amount/currency, stage, confidence, a renamed priority reason, static exception count, and static SLA.

Current UI-field coverage:

| UI need | Current status |
|---|---|
| Document type, supplier, PO, document reference, amount, confidence, stage | Available in queue with caveats |
| Invoice number | Available only as generic `document_reference` |
| Invoice date | Missing |
| Email status/subject/sender/received time | Missing |
| Intent | Missing |
| Priority | Missing; only formatted reason is returned |
| `ai_priority_reason` | Renamed to `priority_reason` and may be fabricated from placeholder |
| Recommended action | Missing |
| Assigned to/owner | Missing |
| SLA | Static `Not Configured`; no breach field |
| Exception count/details | Count hardcoded zero; no details |
| Validation details/match type | Missing |
| Attachment metadata/preview/download | Missing |
| Header and line detail | Missing |

Dashboard date filters are syntactically checked but not applied. KPI and pipeline services always inspect the latest four active documents. Most KPI/stage values are hardcoded zero. Exception severity is entirely static; its Low SLA label says three days, while the handoff says two days.

The proposed `/api/ui/documents`, detail, attachment, validation, and exceptions endpoints are absent. There is no controlled attachment response; older routes expose local paths.

## 15. IDEMPOTENCY AND TRANSACTION SAFETY

| Entity | Current prevention | Finding |
|---|---|---|
| Email | Pre-read by Graph `external_message_id` | Wrong stable key; race-prone; moved messages can duplicate; failed rows cannot retry |
| Attachment | None | First attachment reinserted whenever a new email row is created |
| AP document | None | No email/attachment/type identity guard |
| AI run | None | No run version/idempotency key |
| Invoice header/lines | None | Duplicate invoice and rerun protection absent |
| Extracted PO/GRN and lines | None | Direct inserts can violate remote uniqueness or duplicate |
| Reference PO header | Pre-read by PO number | POC-level only; race-prone; conflates all invoices with same PO |
| Reference PO lines | Existing line-number set | Null/race/change limitations |
| Reference GRN header | Deterministic number plus pre-read | POC-level only; race-prone |
| Reference GRN lines | Existing line number or PO-line ID | POC-level only; race-prone |
| Validation results | None | Append-only duplicates; no run/version/current marker |
| Exception cases | No implementation | Cannot deduplicate or resolve cases |

There is no transaction boundary across any stage. Representative partial failures include: local file downloaded but no DB record; email inserted but attachment insert fails; AP document inserted but AI run/header fails; invoice stored but unresolved supplier prevents GRN; reference PO header stored but line insertion fails; validation rows stored but stage update fails; email marked processed but Graph move fails. There is no compensation or atomic RPC, and the next batch will skip any existing email regardless of incomplete state.

## 16. LEGACY, DUPLICATED AND DEAD CODE

- `ai_service_groq_backup.py` and `backup/ai_service.py` are byte-identical Groq backups.
- `backup/oci_config.py` duplicates current config; `backup/oci_genai.py` is an older helper.
- The first `ai_classify_and_move_all()` implementation is preserved inside a triple-quoted string immediately before the active implementation.
- `classification_service.classify_email()` powers older endpoints but is not the main pipeline classifier and lacks GRN/override correctness.
- `/save-extracted-document-test`, `/create-work-item-test`, and `/extract-latest` reference legacy save functions that are not imported, so they fail at runtime.
- `save_work_item()` and `save_extracted_document()` still write retired tables.
- `EmailPipelineError` is defined but unused.
- `oci_config.FALLBACK_MODEL_ID` is unused.
- `generic_recovery_service.invoice_needs_recovery()` is unused.
- `post_processing_service` imports `invoice_needs_recovery` and `get_valid_invoice_lines` but does not use them.
- `ai_service.py` imports `os` and calls `load_dotenv()` without reading environment variables directly.
- `supabase_service.py` repeats imports of `Optional` and places imports mid-file.
- `process_email_pipeline()` defines normalization helpers inside the route/orchestration module.
- Duplicate debug prints, broad `except`, raw `print`, hardcoded sample paths, sample-vendor rules, and multiple overlapping classification/processing endpoints should be retired only after tests and UI migration.

## 17. CONTEXT FILE VERSUS REPOSITORY DIFFERENCES

| Topic | Context File Says | Repository Actually Does | Impact | Recommended Resolution |
|---|---|---|---|---|
| Supabase migrations | Inspect canonical migrations | No migrations/SQL/schema files exist | Constraints/deployed model cannot be audited | Export/version current schema before code changes |
| Canonical mailbox relation | `mailboxes -> email_messages` | Pipeline never looks up/writes `mailbox_id` | Multi-mailbox ownership unmodeled | Add repository lookup and migration-backed FK after schema capture |
| Stable email idempotency | Prefer `internet_message_id` | Stores it, queries only Graph ID | Duplicates after move | Unique partial index plus stable-key upsert/fallback |
| Transactional behavior | Required end-to-end safety | Independent REST writes | Partial data and blocked retries | Transactional DB RPC/unit-of-work and resumable states |
| Multi-attachment | Known production need | First attachment only | Documents lost | Attachment/document fan-out with identities |
| OCI fallback | Primary/fallback cascade completed | Fallback constant unused | OCI primary outage returns failure object | Implement tested cascade and actual model attribution |
| OCI usage metadata | Token extraction added | No token usage stored | Cost/audit gap | Capture response usage/request metadata |
| AI audit | Classification and extraction runs | Only extraction `ai_runs` row | Classification not auditable | Persist separate classified/extract runs |
| AI output validation | Use Pydantic | Raw repaired dicts trusted | Invalid types/enums can reach DB/moves | Strict schemas and safe fallback |
| Supplier resolution | Code/name/alias/unresolved | Alias-only first match | False unresolved/ambiguous results | Dedicated resolver with outcome enum |
| POC reference source | Explicitly generated, not live ERP | Generated rows claim `source_system=JDE` | Demo can overstate integration | Label provider/source as POC-generated |
| Reference idempotency | Duplicate prevention confirmed | Application pre-checks only | Concurrency and null-line gaps | Verify/add unique constraints and upserts |
| Match type | Dynamic no-PO/2-way/3-way needed | Static PO metadata; no result field | Incorrect UI/business route | Determine strategy before checks |
| 2-way success | Valid when GRN not required | Missing GRN always fails | Legitimate invoices become exceptions | `NOT_APPLICABLE` GRN under 2-way policy |
| Missing values | Preserve null, no self-match | Numeric/string/ID self-matches | False approvals | Typed check statuses and explicit comparability |
| Deviation | True percent and absolute | Absolute stored in `deviation_pct` | Misleading validation | Store both with zero-denominator handling |
| Tolerance | Database-driven | Hardcoded absolute 1.00 | Wrong business decisions | Versioned tolerance service/table lookup |
| Validation idempotency | Version/current model needed | Append-only inserts | Duplicate check history | Validation run/version table or atomic replace |
| Exceptions | Auto-create/dedupe/expose | Static zero API; no table access | No exception workflow | Deterministic mapper plus case repository/APIs |
| Priority | Grounded and explained | Constant medium/default | Queue prioritization meaningless | Rules baseline plus constrained OCI explanation |
| Recommended action | Standardized canonical API field | AI string stored as `suggested_action`; not exposed | Naming/UI gap | Canonical enum/code + display text mapping |
| UI APIs | Stable joined list/detail/attachment | Limited latest-four queue and stubs | Frontend cannot build required screens | Add versioned Pydantic UI API while retaining old route |
| Dashboard filters | today/week/month/last100/custom | Values validated but ignored; limit four | Misleading dashboard | Apply timestamps/ranges and remove demo limit |
| Approval workflow | Schema exists, APIs needed | No repository/API use; schema unconfirmed | Cannot approve/reject/audit | Confirm schema and implement policy endpoints |
| Audit events | Full audit trail needed | Raw prints only | No traceability/correlation | Structured logging and `audit_events` writer |
| Email movement | After safe success, store folder | Marks processed first; ignores move errors | DB/mailbox divergence | Validate move, persist destination/new ID, retry safely |
| File readers | PDF/XLSX/DOCX supported | Main pipeline supports them; older OCI endpoints omit PDF | Inconsistent behavior | One attachment extraction service for every route |
| Status state machine | Canonicalize statuses/stages | `new`, `processing`, `processed`, `failed`, `AI Classified`; stage review/matching/exception | UI/state ambiguity | Versioned transition service and migration |
| Dependency/repo hygiene | Secure ignored config and repeatable build | `.env` present; no `.gitignore` or manifest | Secret/reproducibility risk | Add ignore rules, rotate if ever shared, pin dependencies |
| Tests | Regression/integration/API tests required | No tests | Changes are unsafe | Build isolated fakes/fixtures before fixes |

## 18. COMPLETED WORK CONFIRMATION

| Capability | Evidence-based classification | Notes |
|---|---|---|
| Graph client-credentials token request | Implemented but not production-safe | Raw token endpoint exposed; no status/timeout/cache |
| Inbox-only message retrieval | Complete for POC | Batch pagination exists |
| Attachment metadata/download | Complete for single file attachment POC | First-only pipeline, local overwrite/path concerns |
| PDF/XLSX/DOCX text readers | Complete for text-based POC files | XLSX limited to active sheet/first 20 rows; no OCR/images |
| OCI classification | Implemented but not production-safe | JSON repair, no schema validation/fallback audit |
| OCI extraction | Implemented but not production-safe | Broad schema, no typed validation/usage metrics |
| Post-processing | Partially complete | Strong sample-specific correction; monolithic and calculates values |
| Email/attachment/AP/AI persistence | Implemented but not production-safe | Non-transactional and weak idempotency |
| Invoice structured persistence | Partially complete | Filters lines; no dedup; missing fields/mappings |
| PO and GRN structured persistence | Partially complete | Direct inserts, mapping gaps, no dedup |
| Acknowledgement handling | Partially complete | Raw AI result only; hardcoded sample corrections |
| Folder routing | Implemented but not production-safe | Static IDs, move response ignored, folder not stored |
| Supplier resolution | Partially complete | Exact-ish alias only; no ambiguity/unresolved model |
| Reference PO/GRN generation | Complete for narrow POC path | Circular invoice-derived data; non-atomic |
| Reference duplicate prevention | Partially complete | Happy-path app checks; constraints/races unverified |
| 2-way and 3-way checks | Implemented but not production-safe | False matches and no true 2-way strategy |
| Validation result persistence/stage update | Partially complete | Duplicate rows; early-return gap; simplistic stage |
| Document queue | Partially complete | Latest four; required fields missing |
| Dashboard APIs | Development/demo only | Filters ignored and values hardcoded |
| Duplicate invoice detection | Planned but not implemented | AI emits a key but backend does not use it |
| Exception workflow | Planned/unconfirmed schema | No code/table access |
| Approval workflow | Planned/unconfirmed schema | No code/table access |
| Audit trail | Planned/unconfirmed schema | No audit events/correlation IDs |
| Real JDE/ERP integration | Planned but not implemented | No provider/adapter |
| Statement reconciliation | Planned/unconfirmed schema | No runtime flow |
| Legacy `extracted_documents`/`work_items` | Legacy/retired | Functions and broken routes remain |

## 19. RISKS AND GAPS

### Critical correctness risks

- Circular invoice-derived PO/GRN matching can present copied data as validation.
- Missing values can pass as zero/empty/null equality.
- Failed/incomplete emails are permanently skipped, while moved messages can be reprocessed under a new Graph ID.
- Email status can be `processed` when OCI extraction returned failure or Graph movement failed.
- No genuine 2-way path exists.

### Data-integrity risks

- No cross-table transactions or compensation.
- No invoice/AP-document/AI-run/validation idempotency.
- Reference duplicate prevention is non-atomic; remote constraints are unknown.
- PO/GRN direct inserts can duplicate or fail midway.
- Local attachments overwrite by filename and are not linked by content identity.

### Security risks

- Unauthenticated `/token` returns a raw access token.
- All mutating and debug routes are unauthenticated.
- `.env` is in the project root with no `.gitignore`; tracking history cannot be checked here.
- Raw document content, AI response, IDs, and exception strings are printed/returned.
- Graph download filenames are unsanitized.
- Supabase service-role use, broad Graph permissions, and OCI config require server-only handling and least privilege.

### AI-quality risks

- Prompt output is not structurally validated.
- No fallback despite configured model; model name is hardcoded.
- Vendor-specific regexes and hardcoded acknowledgement facts can overwrite model output incorrectly.
- Calculated line amounts/prices conflict with prompt language that says financial values must not be inferred.
- Classification and extraction can disagree; extraction controls final route without a reconciliation policy.

### Validation/business-logic risks

- Static match metadata, hardcoded tolerance, wrong deviation semantics, exact line/description matching, no UOM/partial receipt logic.
- Supplier, currency, terms, quantity, price, amount, and description can self-match while absent.
- Missing PO/GRN paths are not modeled with PASS/FAIL/NOT_AVAILABLE/NOT_APPLICABLE.
- No duplicate invoice, tax, date, payment, closed-PO, overbilling, or receipt allocation rules.

### API/UI integration gaps

- Missing stable list/detail/attachment/validation/exception APIs and required queue fields.
- Dashboard filters are misleading; errors generally return HTTP 200.
- No response models/versioning/authentication/CORS.
- Local storage paths are exposed by development routes.

### Maintainability problems

- 1,709-line `main.py`, 1,577-line post-processor, direct globals, duplicate backups, unused code, overlapping flows, broad exceptions, and prints.
- No dependency manifest, README, tests, lint/type config, or schema source.
- Storage/provider/business logic are tightly coupled.

### Production-readiness gaps

- No observability/correlation IDs, health/readiness checks, background queue, rate limiting, retry/dead-letter flow, deployment config, retention policy, migrations, secret-rotation evidence, backups, or operational runbook.

## 20. TEST COVERAGE

No test file or test framework configuration exists. No local regression, unit, integration, contract, or API test is evidenced. Historical seven-invoice results in the handoff are not reproducible tests in this repository.

Minimum proposed cases:

| Case | Required assertions |
|---|---|
| Invoice with PO and GRN | Selects 3-way, all comparable checks pass, one validation run, review/next stage |
| Invoice with PO but no GRN | Policy selects 2-way; GRN is NOT_APPLICABLE, not failed |
| Invoice with no PO | NON_PO/UNMATCHED route, deterministic exception, no generated fake PO |
| Missing supplier | Never passes supplier check; unresolved outcome/exception |
| Supplier mismatch | Fails with both IDs/names safely represented |
| Currency mismatch | Fails; absent/absent is NOT_AVAILABLE, not PASS |
| Missing quantity | NOT_AVAILABLE/REVIEW_REQUIRED; never coerced to zero |
| Quantity mismatch | Absolute/percentage deviation and exception are correct |
| Amount within tolerance | Passes with rule ID and both deviation measures |
| Amount outside tolerance | Fails with severity/action |
| Duplicate email | Stable `internet_message_id` upsert skips across Graph ID changes |
| Duplicate invoice | Policy key catches supplier+invoice number and handles credit/reissue rules |
| Pipeline rerun | No duplicate attachment/document/AI/current validation/exception rows |
| Partial DB failure | Transaction rolls back or state remains resumable; no processed/move |
| OCI primary failure/fallback | Fallback used, model attribution/usage stored; total failure routes review |
| Unsupported attachment | No false processed success; invalid/unreadable exception |
| Purchase Order | Header/lines/type/folder mappings and duplicate behavior |
| Acknowledgement | Override beats PO; facts are source-derived, not hardcoded |
| GRN | Received/accepted/rejected quantities and PO linkage preserved |
| Others | No forced structured financial data; safe routing |

Also add unit tests for normalization/date/line identity, supplier ambiguity, tolerance zero denominator, priority/action facts, state transitions, Graph pagination/throttling, filename sanitization, Pydantic serialization, dashboard filters, and authorization.

## 21. PRIORITIZED IMPLEMENTATION PLAN

| # | Task | Likely files | DB impact | API impact | Required tests | Risk/dependencies |
|---:|---|---|---|---|---|---|
| 1 | Freeze current behavior with fakes | New `tests/`, fixtures; existing services unchanged | None | Contract snapshots for 27 routes | Current pipeline, all five types, dashboard, reference and validation behavior | Medium; needs dependency manifest and mock Graph/OCI/Supabase |
| 2 | Capture/version deployed schema | New `supabase/migrations/` or schema dump | Establish PK/FK/unique/index/RLS source | None initially | Migration smoke/constraint tests | High; requires safe Supabase schema export and owner review |
| 3 | Stable email idempotency | `supabase_service.py`, `main.py`, email repository | Unique partial `internet_message_id`; fallback external ID; processing-attempt state | Existing routes compatible; return stable skip/retry reason | Same RFC ID with changed Graph ID, races, failed retry | High; depends on schema capture |
| 4 | Transactional/resumable pipeline | Split `main.py`, repositories, DB RPC/unit of work | Transaction/RPC, attempt/error fields, uniqueness | Prefer POST job/start/status while preserving GET temporarily | Failure injection at every write/move boundary | High; depends on 1-3 |
| 5 | Missing-value-safe validation | `validation_service.py`, new schemas | Check status/availability columns or JSON; migrate booleans safely | Validation response gains status/reason | Null/null for every field; zero remains valid | High; depends on regression tests/schema |
| 6 | Dynamic match strategy and valid 2-way | Validation/workflow service, reference provider | Store `match_type`/strategy and rule source | Expose NON_PO/2_WAY/3_WAY | PO+GRN, PO-only, no-PO, required-GRN-missing | High; requires business policy |
| 7 | Correct deviation model | Validation/tolerance service | Add absolute and percentage deviations; deprecate misleading field | Include both measures | zero expected value, signs, rounding | Medium; depends on task 5 |
| 8 | Database-driven tolerances | Tolerance repository/service | Confirm/version/index `tolerance_rules` by scope/effective date | Return applied rule/threshold | supplier/currency/type precedence and default | High; needs business thresholds/schema |
| 9 | Independent ERP provider interface | New `erp_reference_provider.py`; ref/validation refactor | Label POC source accurately; no invoice-copy provider in production | Optional provider/source metadata | Contract tests for POC, Supabase, file/JDE fake | High; depends on business/JDE access design |
| 10 | Grounded priority/reason | New priority service; `main.py`; workflow rules | Store facts, rule/version, final priority/reason | Queue/detail expose canonical fields | Every exception/due/confidence combination; OCI failure fallback | Medium-high; depends on validation, SLA rules |
| 11 | Standardized recommended action | New recommendation service/schemas | Canonical action code; compatibility mapping to `suggested_action` | Return `recommended_action` consistently | Action mapping, invalid AI enum fallback | Medium; depends on facts/priority/business actions |
| 12 | Exception-case generation | Exception service/repository | Confirm tables; unique open case key, resolution/audit fields, indexes | List/detail/resolve/comment endpoints | One case per failed fact; rerun/update/resolve/reopen | High; depends on validation/priority/SLA rules |
| 13 | Consolidated UI APIs | Routers, Pydantic schemas, document query repository | Read indexes/views/RPC as needed | `/api/ui/documents`, detail, attachment, validation, exceptions; retain old queue | Filtering/pagination/serialization/auth/404 | Medium-high; depends on canonical outputs |
| 14 | Approval workflow | Approval service/routes/schemas | Confirm request/action constraints and audit linkage | Submit/approve/reject/send-back/escalate POSTs | State/role/concurrency/idempotency | High; business thresholds/identity required |
| 15 | Audit logging and observability | Audit service, structured logging, middleware | `audit_events` indexes/retention; correlation IDs | Correlation header; safe errors/health endpoints | Event sequence, redaction, retry/move failures | Medium-high; spans all services |
| 16 | Cleanup and hardening | Move routers/services/repos; delete only after approval | Remove legacy dependencies/tables in later migration | Deprecate mutating GET/debug/token routes; configure CORS/auth | Full regression/security/load tests | Medium; only after UI migration and prior tasks |

The first implementation change should be tests and schema capture, not refactoring. Old endpoints should remain behind deprecation controls until Vamsi migrates.

## 22. QUESTIONS THAT REQUIRE BUSINESS CONFIRMATION

1. Which invoice/PO types, suppliers, or value bands legitimately use 2-way matching, and what makes GRN absence expected versus exceptional?
2. What are the effective absolute and percentage tolerances by supplier, currency, document/check type, and date, including precedence and rounding?
3. What constitutes a duplicate invoice (supplier, invoice number, amount/date, credit/rebill handling), and should duplicates block, warn, or require approval?
4. What are the priority, severity, SLA, escalation, and breach rules, including the correct Low-priority SLA (two versus three days)?
5. What approval thresholds, roles, segregation-of-duties rules, and autonomous-processing limits apply?
6. Which lifecycle/status vocabulary is authoritative for emails, documents, validation, approval, posting, rejection, retry, and archive?
7. Which recommended-action codes and user-visible labels are approved, and which actions may the backend execute automatically?
8. Which real JDE integration mechanism is approved (AIS, Orchestrator, replicated tables, file import), and what consistency/freshness guarantees apply?
9. Where should original attachments be retained in production, for how long, and who may preview/download them?
10. Should the POC-generated reference provider remain available only in isolated demo/test mode, and how must demo data be labeled and separated?

## Final audit conclusion

The current repository contains a functioning single-attachment POC backbone for Inbox retrieval, OCI classification/extraction, structured Supabase writes, generated reference records, and basic matching. It is not yet an end-to-end production backend. The most urgent work is to make the existing behavior reproducible with tests, capture the actual database schema, replace mutable-ID/non-transactional ingestion, eliminate missing-value false matches, model real 2-way/3-way strategy, and stop treating invoice-derived reference copies as independent ERP validation.
