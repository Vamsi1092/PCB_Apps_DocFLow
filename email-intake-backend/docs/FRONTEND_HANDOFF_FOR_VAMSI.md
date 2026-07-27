# DocFlow Frontend Integration Handoff

**From:** Backend / Supabase  
**To:** Vamsi and the DocFlow frontend team  
**Last updated:** 2026-07-24  
**Purpose:** Provide the exact backend contract needed to replace frontend
placeholders and client-side business-rule derivation with current Supabase data.

## 1. Executive summary

The backend work requested in `backend-requirements.md` has been implemented
where trustworthy source data was available.

The frontend should now use these read-only Supabase views:

| View | Primary use |
|---|---|
| `document_ui_view` | Inbox, Worklist, Document Review, Dashboard and Reporting |
| `document_lifecycle_view` | Four-stage PO → Acknowledgement → GRN → Invoice lifecycle |
| `current_match_results` | Current 2-way/3-way matching summary |
| `invoice_match_review_view` | Document Review previews, separate match statuses and exception summary |

The frontend may continue reading `approval_requests`, `exception_cases` and
other existing tables where appropriate. Do not recompute matching, canonical
supplier names, pipeline stage, SLA breach or lifecycle status in the frontend.

### Matching coverage at handover

The complete matching contract is deployed, but the current data backfill is
intentionally limited to seven controlled invoice scenarios:

- 58 invoice documents exist.
- 7 invoice documents have a current match record and OCI explanation.
- 51 invoice documents have no current match record.
- A `null` match type/status means **Not evaluated**. It must not be displayed
  as `UNMATCHED`, `VARIANCE` or `MATCHED`.
- Purchase-order, GRN and acknowledgement rows do not carry their own match
  result. The result belongs to the linked invoice.

The seven controlled rows demonstrate the complete UI behavior. Historical
coverage must not be inferred from old validation rows or invoice-derived
reference records.

The current POC frontend uses the Supabase anonymous key. Anonymous access to
the new contract is explicitly **read-only**:

- `SELECT` is allowed on the UI views and required supporting tables.
- Anonymous insert, update and delete privileges are revoked on the newly
  exposed chain, validation and reference tables.
- Existing write interactions must not be added until an authenticated write
  model is agreed.

## 2. Verified live-data snapshot

These counts were verified after the backend migration and backfill:

| Item | Count |
|---|---:|
| AP documents | 122 |
| UI document rows | 122 |
| Transaction chains | 24 |
| Lifecycle view rows | 96 |
| Documents linked to a chain | 102 |
| Chains containing more than one document type | 9 |
| Invoice documents | 58 |
| Invoices with a current match | 7 |
| Invoices not yet evaluated | 51 |
| Current matching results | 7 |
| Reference POs | 7 |
| Reference GRNs | 7 |
| Fetchable attachments | 118 of 118 |
| Pending approvals | 1 |
| Documents with complete OCI decision fields | 113 |

These are live POC counts, not fixed application assumptions.

## 3. Supabase client setup

Continue using the existing anonymous publishable key. Never place the
service-role key in the frontend.

```text
VITE_SUPABASE_URL=https://ylfyrftkfgvvklfzsuoq.supabase.co
```

```ts
import { createClient } from '@supabase/supabase-js'

export const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY,
)
```

If the frontend uses Next.js, use the equivalent public environment-variable
names already established in that project.

## 4. Main document contract: `document_ui_view`

Use this view as the default frontend read model for document lists and document
review. It already joins the current canonical supplier, primary attachment,
transaction chain and current match summary.

### 4.1 Columns

| Column | Type/values | Frontend purpose |
|---|---|---|
| `document_id` | UUID | Stable AP document identifier |
| `document_type` | Canonical text enum | Document label/filter |
| `document_chain_id` | UUID or `null` | Load lifecycle stages |
| `transaction_key` | Text or `null` | Normalized PO/transaction reference |
| `pipeline_stage` | Pipeline enum | Dashboard/worklist stage |
| `extraction_status` | Extraction enum | Extraction badge/lifecycle stage |
| `received_at` | Timestamp | Inbox/lifecycle received time |
| `priority` | `low`, `medium`, `high`, `critical` | AI priority badge |
| `ai_priority_reason` | Text | OCI-generated explanation |
| `recommended_action` | Text | OCI-generated user guidance |
| `recommended_action_code` | Canonical action code | UI routing/icon logic |
| `ai_decision_source` | Normally `oci` | Provenance badge/audit |
| `sla_due_at` | Timestamp | SLA deadline |
| `sla_breached` | Boolean | Live SLA indicator |
| `supplier_id` | UUID or `null` | Canonical supplier identifier |
| `vendor_code` | Text or `null` | Stable vendor code |
| `supplier_name` | Text or `null` | Canonical display name |
| `attachment_id` | UUID or `null` | Primary email attachment |
| `filename` | Text or `null` | Attachment display name |
| `file_type` | Text or `null` | MIME/file-type hint |
| `storage_bucket` | Text or `null` | Supabase Storage bucket |
| `storage_path` | Text or `null` | Object path for signed URL |
| `storage_object_exists` | Boolean | Whether preview/download is possible |
| `match_type` | Match enum or `null` | `2_WAY`, `3_WAY`, `UNMATCHED` |
| `match_status` | Outcome enum or `null` | `MATCHED`, `VARIANCE`, `UNMATCHED` |
| `failed_check_count` | Integer or `null` | Current failed validations |
| `unavailable_check_count` | Integer or `null` | Checks lacking usable data |
| `match_status_invoice_po` | Pairwise enum or `null` | Invoice-to-PO result |
| `match_status_invoice_grn` | Pairwise enum or `null` | Invoice-to-GRN result |
| `match_status_po_grn` | Pairwise enum or `null` | PO-to-GRN result |
| `match_exception_summary` | Text or `null` | Deterministic discrepancy summary |
| `ai_match_reason` | Text or `null` | OCI explanation of the persisted result |
| `match_recommended_action` | Text or `null` | OCI-recommended AP action |
| `match_reason_source` | `oci` or fallback source | Explanation provenance |
| `scenario_code` | Text or `null` | Controlled-demo scenario identifier |
| `scenario_name` | Text or `null` | Controlled-demo display label |

### 4.2 Canonical document types

The backend normalized historical values to:

- `invoice`
- `purchase_order`
- `acknowledgement`
- `grn`
- `credit_memo`
- `supplier_statement`
- `other`

Do not branch on old values such as `Invoice`, `PO Acknowledgement` or
`Delivery / GRN Evidence`.

### 4.3 Pipeline stages

`pipeline_stage` is one of:

- `ingested`
- `extracted`
- `matched`
- `exception`
- `approved`
- `posted`

Use this field for pipeline/dashboard stage counts. Do not infer it from the
shape of `email_messages.ai_understanding`.

### 4.4 Example list query

```ts
const { data, error } = await supabase
  .from('document_ui_view')
  .select('*')
  .order('received_at', { ascending: false })

if (error) throw error
```

### 4.5 Example document-review query

```ts
const { data: document, error } = await supabase
  .from('document_ui_view')
  .select('*')
  .eq('document_id', documentId)
  .single()

if (error) throw error
```

## 5. Attachment preview and download

The attachment bucket is private:

```text
ap-email-attachments
```

The anonymous role has read access to objects in this bucket, allowing the
frontend to request signed URLs without exposing a permanent public URL.

### 5.1 Required frontend flow

1. Read `storage_bucket`, `storage_path` and `storage_object_exists` from
   `document_ui_view` or `document_lifecycle_view`.
2. If `storage_object_exists !== true`, show **File unavailable** and keep the
   preview/download control disabled.
3. Otherwise create a short-lived signed URL.

```ts
async function getAttachmentUrl(
  bucket: string | null,
  path: string | null,
  exists: boolean,
) {
  if (!bucket || !path || !exists) return null

  const { data, error } = await supabase.storage
    .from(bucket)
    .createSignedUrl(path, 60 * 10)

  if (error) throw error
  return data.signedUrl
}
```

Use the signed URL for the PDF/image iframe, object/embed element or download
link. DOCX/XLSX files may require download or an appropriate viewer rather than
an iframe.

### 5.2 Attachment coverage

All 118 `email_attachments` rows now have a corresponding object in Supabase
Storage, including the four repeated rows for `854552 -A.pdf` that were
previously unavailable.

The seven current validated invoice rows have the documents required by their
controlled scenarios:

- S01: invoice only
- S02-S04: invoice and PO
- S05-S07: invoice, PO and GRN

The six PO and three GRN PDFs are controlled POC source documents. They are not
evidence of an independent JDE/ERP lookup.

New-email ingestion now creates an `email_attachments` row and uploads a
Storage object for every Graph attachment returned for the email. The first
attachment remains the primary document used by the current
classification/extraction flow; the remaining attachments are retained for
preview and download instead of being discarded.

### 5.3 Listing every attachment for an email

Use the email UUID already associated with the inbox/document record:

```ts
const { data: attachments, error } = await supabase
  .from('email_attachments')
  .select(`
    id,
    email_id,
    filename,
    file_type,
    size_kb,
    storage_bucket,
    storage_path
  `)
  .eq('email_id', emailId)
  .order('created_at')

if (error) throw error
```

Create the preview URL from each row's `storage_bucket` and `storage_path`
using the signed-URL helper in section 5.1.

## 6. Matching contract

The frontend must not derive matching by comparing invoice, PO and GRN values.
The backend owns matching and tolerance rules.

### 6.1 Current selection rules

- Referenced PO not found → `UNMATCHED`
- PO found, GRN absent → `2_WAY`
- PO and GRN found → `3_WAY`

Important: PO found with no GRN is currently a 2-way strategy. It is not
automatically `UNMATCHED`. A future supplier/document policy is required if
some invoices must require a GRN and treat its absence as an exception.

The current engine compares:

- Supplier
- Currency
- Invoice total against PO total
- Summed invoice quantity against summed PO quantity
- Line quantity, unit price, line amount and description
- For 3-way matching, GRN existence and received quantities
- Database-driven amount/quantity tolerance rules

Missing values are never treated as matching values or coerced to zero.

### 6.2 Current outcomes

- `MATCHED`
- `VARIANCE`
- `UNMATCHED`

Do not introduce a frontend-only `n/a` or default every document to
`unmatched`. A `null` match result means that document has not received a
current backend validation run. Display it as **Not evaluated** and do not show
an OCI match explanation or recommended match action for that row.

### 6.3 Document Review contract

For the Document Review screen, use `invoice_match_review_view`. It provides
one read model containing:

- Invoice filename, bucket, path and availability
- Generated reference PO filename, bucket, path and availability
- Generated reference GRN filename, bucket, path and availability
- Separate `two_way_status` and `three_way_status`
- Overall `match_status`
- `exception_count` and `exception_summary`
- Pairwise invoice/PO, invoice/GRN and PO/GRN statuses
- OCI match reason, recommended action, model, confidence and provenance
- Controlled scenario code, name and expected result
- Fact snapshots in `invoice_data`, `po_data` and `grn_data`

```ts
const { data: review, error } = await supabase
  .from('invoice_match_review_view')
  .select('*')
  .eq('document_id', documentId)
  .single()
```

Create signed URLs for the invoice, PO and GRN using their respective bucket
and path columns. Check each `*_document_exists` field first.

The generated reference PO/GRN PDFs are explicitly marked as POC-generated
documents and must not be presented as independent ERP/JDE source files.

### 6.4 `current_match_results` columns

| Column | Meaning |
|---|---|
| `document_id` | AP document |
| `validation_run_id` | Current versioned execution |
| `match_type` | `2_WAY`, `3_WAY` or `UNMATCHED` |
| `match_status` | `MATCHED`, `VARIANCE` or `UNMATCHED` |
| `engine_version` | Matching-engine version |
| `matched_at` | Execution timestamp |
| `failed_check_count` | Failed current checks |
| `unavailable_check_count` | Current checks missing usable values |
| `match_status_invoice_po` | Invoice-to-PO pairwise result |
| `match_status_invoice_grn` | Invoice-to-GRN pairwise result |
| `match_status_po_grn` | PO-to-GRN pairwise result |
| `exception_summary` | Deterministic discrepancy summary |
| `ai_match_reason` | OCI-generated explanation |
| `ai_recommended_action` | OCI-generated AP action |
| `match_reason_source` | Explanation provenance; `oci` for all seven controlled rows |
| `scenario_code` | Controlled scenario identifier |
| `scenario_name` | Controlled scenario display name |

### 6.5 Verified controlled scenarios

| Scenario | Documents | Match type | Outcome | AI source |
|---|---|---|---|---|
| `S01_NO_PO_UNMATCHED` | Invoice | `UNMATCHED` | `UNMATCHED` | `oci` |
| `S02_TWO_WAY_MATCHED` | Invoice + PO | `2_WAY` | `MATCHED` | `oci` |
| `S03_TWO_WAY_AMOUNT_VARIANCE` | Invoice + PO | `2_WAY` | `VARIANCE` | `oci` |
| `S04_TWO_WAY_QUANTITY_VARIANCE` | Invoice + PO | `2_WAY` | `VARIANCE` | `oci` |
| `S05_THREE_WAY_MATCHED` | Invoice + PO + GRN | `3_WAY` | `MATCHED` | `oci` |
| `S06_THREE_WAY_AMOUNT_VARIANCE` | Invoice + PO + GRN | `3_WAY` | `VARIANCE` | `oci` |
| `S07_THREE_WAY_GRN_QUANTITY_VARIANCE` | Invoice + PO + GRN | `3_WAY` | `VARIANCE` | `oci` |

```ts
const { data: match, error } = await supabase
  .from('current_match_results')
  .select('*')
  .eq('document_id', documentId)
  .maybeSingle()
```

For the detailed check list, read `validation_results` using the returned
`validation_run_id` and `is_current = true`.

```ts
const { data: checks, error } = await supabase
  .from('validation_results')
  .select(`
    check_type,
    check_status,
    passed,
    matched_value,
    expected_value,
    deviation_abs,
    deviation_pct,
    tolerance_threshold_pct,
    tolerance_threshold_amt,
    note
  `)
  .eq('validation_run_id', match.validation_run_id)
  .eq('is_current', true)
```

## 7. Lifecycle contract: `document_lifecycle_view`

This view returns four ordered stage rows for every transaction chain:

1. `purchase_order`
2. `acknowledgement`
3. `grn`
4. `invoice`

Missing stages are represented explicitly with:

- `document_id = null`
- `extraction_status = not_received`

This allows the lifecycle popup to render all four stages without mock data.

### 7.1 Columns

| Column | Meaning |
|---|---|
| `document_chain_id` | Chain identifier |
| `transaction_key` | Normalized shared transaction/PO key |
| `stage_name` | Canonical lifecycle stage |
| `stage_order` | Display order, 1–4 |
| `document_id` | Linked document or `null` |
| `extraction_status` | Real extraction state |
| `received_at` | Stage document received timestamp |
| `filename` | Linked stage attachment |
| `storage_bucket` | Attachment bucket |
| `storage_path` | Attachment object path |
| `storage_object_exists` | Preview availability |
| `match_type` | Current match type when applicable |
| `match_status` | Current match outcome when applicable |

### 7.2 Extraction status enum

- `not_received`
- `received_pending`
- `extracted`
- `extraction_failed`

Historical rows were backfilled from persisted extraction evidence. Future
documents receive these fields directly from the backend workflow.

### 7.3 Example lifecycle query

```ts
const { data: lifecycle, error } = await supabase
  .from('document_lifecycle_view')
  .select('*')
  .eq('document_chain_id', documentChainId)
  .order('stage_order')

if (error) throw error
```

If `document_chain_id` is `null`, show that no reliable transaction linkage is
available. Do not fabricate a chain from filenames or supplier names.

## 8. Supplier and vendor display

Use only these canonical fields from `document_ui_view`:

- `supplier_id`
- `supplier_name`
- `vendor_code`

Do not use free-text values from `email_messages.ai_understanding.header` for
supplier display, grouping, reporting or worklist ID generation.

If `supplier_id` is `null`, display **Unresolved supplier**. Do not collapse an
unresolved name into an existing supplier using client-side fuzzy matching.

Historical supplier aliases were applied where there was an exact normalized
alias match. Sixty-three documents still have no trustworthy supplier mapping.
That is a real data-quality state.

## 9. OCI priority and recommendation

All 113 original inbox documents have the following fields directly on
`ap_documents` and in `document_ui_view`:

- `priority`
- `ai_priority_reason`
- `recommended_action`
- `recommended_action_code`
- `ai_decision_source`

The current historical backfill was generated by OCI, with provenance stored in
`ai_runs`. The UI should display the fields directly and may show an
**OCI-generated** badge only when `ai_decision_source === 'oci'`.

Do not replace these fields with frontend-calculated fallback text.

## 10. Approvals

At least one real document currently has a pending approval request.

```ts
const { data: approvals, error } = await supabase
  .from('approval_requests')
  .select('*')
  .eq('status', 'pending')
  .order('created_at', { ascending: false })
```

Use `approval_requests.document_id` to load its `document_ui_view` row:

```ts
const documentIds = approvals.map((item) => item.document_id)

const { data: approvalDocuments, error } = await supabase
  .from('document_ui_view')
  .select('*')
  .in('document_id', documentIds)
```

The anonymous frontend contract is read-only. Approve/return/assign actions must
remain disabled or routed through a future authenticated backend/API. Do not
attempt direct anonymous writes.

## 11. Exceptions

Continue reading `exception_cases` for explicit exception-case records.
For match-derived status and counts, use `document_ui_view.match_status`,
`failed_check_count` and `unavailable_check_count`.

Sparse `exception_cases` data is real. Do not create client-side exception rows
just to fill the table.

## 12. Dashboard and reporting

Use `document_ui_view` for:

- Documents by `pipeline_stage`
- Documents by canonical `supplier_name`
- Priority distribution
- SLA compliance using `sla_breached`
- Match distribution using `match_status`
- Extraction distribution using `extraction_status`

Current canonical pipeline stages are suitable for grouping without additional
frontend rules.

`posted` means `posted_at` exists. Do not treat `mock_posted` alone as genuine
posting evidence.

## 13. RLS and security contract

The current arrangement is intentional for the POC:

- The anonymous frontend can read the approved views and supporting read models.
- The new chain, validation-run and reference tables have only anonymous
  `SELECT` RLS policies.
- Anonymous DML privileges on those tables are explicitly revoked.
- The attachment bucket remains private; the frontend creates short-lived signed
  URLs.
- The service-role key remains backend-only.

This is not the final production authentication model. Before enabling assignment,
approval or posting writes, introduce authenticated users/team members and
server-side authorization.

## 14. Known limitations and non-frontend blockers

These items cannot be truthfully completed from the currently available source
data:

1. **Incomplete supplier resolution**  
   Sixty-three documents lack a trustworthy canonical supplier match.

2. **Incomplete transaction chains**  
   One hundred two documents have a normalized chain key, but only nine chains
   currently contain multiple document types. Missing PO/Ack/GRN documents must
   remain `not_received`.

3. **Matching coverage**  
   Seven of 58 invoice documents have current validated matching runs. The
   remaining 51 should display **Not evaluated** rather than a fabricated
   result. Of those 51, 43 have invoice headers and eight do not. Historical
   PO/GRN linkage has not been approved as independent matching evidence for a
   bulk backfill.

4. **No real JDE/ERP integration**  
   The current reference PO/GRN records support the POC matching demonstration.
   They must not be presented as independently fetched JDE records.

5. **No production posting workflow**  
   Posting metrics can only use genuine `posted_at` records.

7. **No authenticated team-member model**  
   Assignment and approval writes remain future authenticated work.

## 15. Frontend migration checklist

- [ ] Replace document-list joins/JSON inference with `document_ui_view`.
- [ ] Replace supplier free-text display with `supplier_name`/`vendor_code`.
- [ ] Replace client-side match defaults with `match_type`/`match_status`.
- [ ] Build validation details from the current `validation_run_id`.
- [ ] Replace lifecycle mock stages with `document_lifecycle_view`.
- [ ] Use `stage_order` to render PO → Ack → GRN → Invoice.
- [ ] Show missing lifecycle documents as `not_received`.
- [ ] Generate signed attachment URLs from bucket/path.
- [ ] Disable preview when `storage_object_exists` is false.
- [ ] Display OCI reason/action directly from the UI view.
- [ ] Use `pipeline_stage`, `extraction_status` and `sla_breached` for metrics.
- [ ] Replace sample approval cards with `approval_requests.status = 'pending'`.
- [ ] Keep approval/assignment/posting writes disabled under anonymous access.
- [ ] Remove frontend mock match pills and lifecycle values.

## 16. Backend implementation references

The main migrations are:

- `20260723135011_upgrade_validation_strategy_and_tolerance_evidence.sql`
- `20260723141139_version_validation_runs.sql`
- `20260723143201_add_ap_document_ai_decision_fields.sql`
- `20260723145226_ui_backend_contract.sql`
- `20260723150004_document_workflow_defaults.sql`
- `20260723150507_enable_poc_ui_read_contract.sql`
- `20260723150637_restrict_poc_ui_contract_to_read_only.sql`
- `20260724111500_real_chain_document_match_records.sql`
- `20260724160000_allow_unmatched_validation_match_type.sql`
- `20260724170000_restrict_controlled_matching_views_to_read_only.sql`

The current backend regression suite passes:

```text
59 passed
```

If the frontend discovers a missing field, report the exact screen, intended
meaning and existing source field. Do not add a client-side business rule before
confirming whether the backend should own it.
