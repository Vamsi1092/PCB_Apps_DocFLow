# Vamsi UI Guide: Seven Verified Matching Scenarios

**Audience:** Vamsi and the DocFlow frontend team  
**Last verified:** 2026-07-24  
**Supabase project:** `ylfyrftkfgvvklfzsuoq`  
**Purpose:** Show only the seven controlled, verified invoice-matching
scenarios in the UI demo.

## 1. Handover decision

Use only the seven scenario codes listed in this guide.

Do not use unfiltered historical documents for the matching demo. Historical
data contains incomplete extraction values, duplicate documents, incomplete
chains and records that have not received a current matching run.

The seven controlled invoice scenarios are verified against their defined POC
facts:

- Every actual match type and outcome equals the expected result.
- Every invoice has its required source-document preview.
- Every variance or unmatched result has a deterministic exception summary.
- Every scenario has an OCI-generated match explanation and recommended match
  action.
- Every current match explanation has `match_reason_source = 'oci'`.

These are controlled POC scenarios. They are not evidence of an independent
JDE/ERP lookup.

## 2. Use this Supabase view

Use:

```text
invoice_match_review_view
```

This view returns one row per current controlled invoice match and contains:

- Invoice, PO and GRN preview information
- Overall match type and status
- Two-way and three-way status
- Exception count and deterministic exception summary
- OCI match explanation
- OCI recommended match action
- Scenario code and name

Do not select the controlled PO or GRN rows directly from
`document_ui_view` for these four matching cards. PO and GRN source documents
do not own a matching run; the linked invoice owns the result.

## 3. Exact seven-record filter

Use this exact allowlist:

```ts
export const DEMO_SCENARIO_CODES = [
  'S01_NO_PO_UNMATCHED',
  'S02_TWO_WAY_MATCHED',
  'S03_TWO_WAY_AMOUNT_VARIANCE',
  'S04_TWO_WAY_QUANTITY_VARIANCE',
  'S05_THREE_WAY_MATCHED',
  'S06_THREE_WAY_AMOUNT_VARIANCE',
  'S07_THREE_WAY_GRN_QUANTITY_VARIANCE',
] as const
```

Do not replace this allowlist with an unfiltered query.

## 4. Exact frontend query

```ts
const { data: demoMatches, error } = await supabase
  .from('invoice_match_review_view')
  .select(`
    document_id,
    invoice_header_id,
    invoice_number,
    po_number,
    grn_number,
    scenario_code,
    scenario_name,
    match_type,
    match_status,
    two_way_status,
    three_way_status,
    exception_count,
    exception_summary,
    match_status_invoice_po,
    match_status_invoice_grn,
    match_status_po_grn,
    ai_match_reason,
    ai_recommended_action,
    match_reason_source,
    invoice_filename,
    invoice_storage_bucket,
    invoice_storage_path,
    invoice_document_exists,
    po_filename,
    po_storage_bucket,
    po_storage_path,
    po_document_exists,
    grn_filename,
    grn_storage_bucket,
    grn_storage_path,
    grn_document_exists
  `)
  .in('scenario_code', DEMO_SCENARIO_CODES)
  .order('scenario_code')

if (error) throw error

if (!demoMatches || demoMatches.length !== 7) {
  throw new Error(
    `Expected 7 controlled scenarios, received ${
      demoMatches?.length ?? 0
    }`,
  )
}
```

## 5. The four matching cards

Use these exact fields:

| UI card | Supabase field | Rendering rule |
|---|---|---|
| Match Status | `match_status` | Show `MATCHED`, `VARIANCE` or `UNMATCHED` |
| Exception Summary | `exception_count`, `exception_summary` | Show the persisted summary; for a matched row show “No matching exceptions.” |
| AI Match Explanation | `ai_match_reason` | Display the OCI explanation without recalculating it |
| Recommended Action | `ai_recommended_action` | Display the OCI match action, not the general document action |

### Required UI correction

Change the screenshot card label:

```text
AI PRIORITY
```

to:

```text
AI MATCH EXPLANATION
```

The matching demo must not use these general document fields:

```text
priority
ai_priority_reason
recommended_action
```

Those fields belong to the broader document workflow and may contain older
historical priority context. For this demo, use:

```text
ai_match_reason
ai_recommended_action
```

## 6. Safe display helper

This helper only formats persisted backend results. It does not calculate
matching in the frontend.

```ts
function toMatchCards(row: {
  match_status: 'MATCHED' | 'VARIANCE' | 'UNMATCHED'
  exception_count: number | null
  exception_summary: string | null
  ai_match_reason: string | null
  ai_recommended_action: string | null
  match_reason_source: string | null
}) {
  if (row.match_reason_source !== 'oci') {
    throw new Error('Controlled demo explanation is not OCI-sourced')
  }

  return {
    matchStatus: row.match_status,
    exceptionCount: row.exception_count ?? 0,
    exceptionSummary:
      row.exception_summary ?? 'No matching exceptions.',
    aiMatchExplanation:
      row.ai_match_reason ?? 'Explanation unavailable.',
    recommendedAction:
      row.ai_recommended_action ?? 'Action unavailable.',
  }
}
```

For the seven controlled rows, the unavailable fallbacks above should never be
needed.

## 7. Verified expected results

| Scenario | Documents | Match type | Match status | Exceptions | What the UI must explain |
|---|---|---|---|---:|---|
| `S01_NO_PO_UNMATCHED` | Invoice only | `UNMATCHED` | `UNMATCHED` | 1 | PO `5524488` was not found |
| `S02_TWO_WAY_MATCHED` | Invoice + PO | `2_WAY` | `MATCHED` | 0 | Invoice and PO matched with no discrepancy |
| `S03_TWO_WAY_AMOUNT_VARIANCE` | Invoice + PO | `2_WAY` | `VARIANCE` | 1 | Invoice USD 967.30 vs PO USD 1,067.30; USD 100.00 delta |
| `S04_TWO_WAY_QUANTITY_VARIANCE` | Invoice + PO | `2_WAY` | `VARIANCE` | 2 | Invoice quantity 2 vs PO quantity 3 |
| `S05_THREE_WAY_MATCHED` | Invoice + PO + GRN | `3_WAY` | `MATCHED` | 0 | Invoice, PO and GRN matched |
| `S06_THREE_WAY_AMOUNT_VARIANCE` | Invoice + PO + GRN | `3_WAY` | `VARIANCE` | 1 | Invoice USD 7,573.06 vs PO USD 8,073.06; USD 500.00 delta |
| `S07_THREE_WAY_GRN_QUANTITY_VARIANCE` | Invoice + PO + GRN | `3_WAY` | `VARIANCE` | 2 | Invoice/PO quantity 130,903 vs received quantity 125,000; 5,903-unit difference |

## 8. Status colors

The frontend may map persisted statuses to presentation colors:

```ts
const MATCH_STATUS_STYLE = {
  MATCHED: 'success',
  VARIANCE: 'warning',
  UNMATCHED: 'danger',
} as const
```

Do not infer or change a status based on color, exception count, filenames,
amounts or frontend calculations.

## 9. Preview behavior

The Storage bucket is private. Create short-lived signed URLs from the
persisted bucket/path fields.

```ts
async function createPreviewUrl(
  bucket: string | null,
  path: string | null,
  exists: boolean | null,
) {
  if (!bucket || !path || exists !== true) return null

  const { data, error } = await supabase.storage
    .from(bucket)
    .createSignedUrl(path, 60 * 10)

  if (error) throw error
  return data.signedUrl
}
```

Create separate URLs for:

- `invoice_storage_bucket` + `invoice_storage_path`
- `po_storage_bucket` + `po_storage_path`
- `grn_storage_bucket` + `grn_storage_path`

Expected previews:

- S01: invoice only
- S02-S04: invoice and PO
- S05-S07: invoice, PO and GRN

Do not show a missing PO/GRN preview button when its corresponding
`*_document_exists` field is not `true`.

## 10. Required validation before rendering

```ts
for (const row of demoMatches) {
  if (!row.scenario_code) {
    throw new Error('Scenario code is missing')
  }

  if (!row.match_status || !row.match_type) {
    throw new Error(
      `${row.scenario_code}: match result is incomplete`,
    )
  }

  if (!row.ai_match_reason || !row.ai_recommended_action) {
    throw new Error(
      `${row.scenario_code}: OCI explanation/action is incomplete`,
    )
  }

  if (row.match_reason_source !== 'oci') {
    throw new Error(
      `${row.scenario_code}: expected OCI explanation`,
    )
  }

  if (
    row.match_status !== 'MATCHED' &&
    !row.exception_summary
  ) {
    throw new Error(
      `${row.scenario_code}: exception summary is missing`,
    )
  }
}
```

## 11. Do not do these things

- Do not load every historical invoice for the controlled demo.
- Do not show controlled PO/GRN rows as separate matching results.
- Do not display `Not evaluated` for these seven invoice rows.
- Do not calculate 2-way/3-way status in the frontend.
- Do not compare amounts or quantities in the frontend.
- Do not generate a frontend explanation for a variance.
- Do not use the general `recommended_action` field for the matching card.
- Do not label general workflow priority text as the match explanation.
- Do not claim the controlled PO/GRN documents came from JDE/ERP.
- Do not expose the Supabase service-role key.

## 12. Final verification evidence

The deployed backend was verified with:

- Seven current controlled match records
- Seven distinct controlled scenario codes
- Zero expected-versus-actual outcome mismatches
- Zero non-OCI current match explanations
- Zero inconsistencies across `current_match_results`,
  `document_ui_view` and `invoice_match_review_view`
- Six PO and three GRN controlled Storage objects
- Anonymous read access with anonymous insert/update/delete denied
- Successful backend compilation
- `59 passed` in the regression suite

## 13. Definition of done for Vamsi

The UI demo is complete when:

- Exactly seven scenario rows are loaded.
- Each row shows its persisted match status.
- Variance/unmatched rows show the exact backend exception summary.
- Every row shows the OCI match explanation.
- Every row shows the OCI match-specific recommended action.
- Matched rows show zero exceptions and “No matching exceptions.”
- The correct invoice/PO/GRN previews are available.
- No historical or standalone controlled source-document row appears in this
  seven-scenario matching demo.

