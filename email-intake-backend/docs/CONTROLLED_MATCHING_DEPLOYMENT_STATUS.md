# Controlled 2-Way / 3-Way Demo Deployment Status

Last updated: 2026-07-24

## Current status

The controlled matching deployment is complete on Supabase project
`ylfyrftkfgvvklfzsuoq`.

Applied migrations:

- `20260724154836_real_chain_document_match_records`
- `20260724155152_allow_unmatched_validation_match_type`
- `20260724160529_restrict_controlled_matching_views_to_read_only`

The compatibility migration preserves historical `NON_PO` validation values
and allows the current runtime value `UNMATCHED`. The access migration removes
inherited anonymous DML grants from the three controlled matching views while
retaining anonymous `SELECT`.

The seven controlled scenarios have current real-chain match records. Six PO
PDFs and three GRN PDFs are linked to private Supabase Storage objects. All
seven current AI explanations have `ai_decision_source = 'oci'`.

Final verification:

```text
python -m scripts.verify_controlled_match_scenarios  -> passed
python -m compileall -q app scripts                  -> passed
python -m pytest                                     -> 59 passed
```

## Required deployed results

| Code | Scenario | Match type | Outcome | AI source |
|---|---|---|---|---|
| S01 | No PO | `UNMATCHED` | `UNMATCHED` | `oci` |
| S02 | Invoice and PO match | `2_WAY` | `MATCHED` | `oci` |
| S03 | Invoice/PO amount difference | `2_WAY` | `VARIANCE` | `oci` |
| S04 | Invoice/PO quantity difference | `2_WAY` | `VARIANCE` | `oci` |
| S05 | Invoice, PO, and GRN match | `3_WAY` | `MATCHED` | `oci` |
| S06 | Three-way amount difference | `3_WAY` | `VARIANCE` | `oci` |
| S07 | GRN quantity difference | `3_WAY` | `VARIANCE` | `oci` |

## Verification checklist

- [x] Seven current rows exist in `document_match_records`, one for each
  scenario.
- [x] Every stored actual match type/outcome equals its expected value.
- [x] S01 has only an invoice; S02-S04 have invoice + PO; S05-S07 have invoice +
  PO + GRN.
- [x] Six PO PDFs and three GRN PDFs exist in Supabase Storage and are
  previewable through short-lived signed URLs.
- [x] Invoice, PO, and GRN attachment metadata point to the correct storage
  objects.
- [x] Every current controlled record has `ai_decision_source = 'oci'`.
- [x] OCI generated the explanation/recommended action; deterministic code only
  determined the factual match outcome.
- [x] `current_match_results`, `document_ui_view`, and
  `invoice_match_review_view` return consistent current data.
- [x] Anonymous frontend reads work through the intended policies/views, and
  anonymous insert/update/delete privileges are absent.
- [x] Previous clone-based validation rows are not current and are not used by
  the runtime matching path.
- [x] The generated PDFs contain source facts only. They do not contain match
  type, validation status, variance result, or fake JDE/ERP claims.

## Local artifacts

- Migration:
  `supabase/migrations/20260724111500_real_chain_document_match_records.sql`
- Compatibility migration:
  `supabase/migrations/20260724160000_allow_unmatched_validation_match_type.sql`
- Read-only ACL migration:
  `supabase/migrations/20260724170000_restrict_controlled_matching_views_to_read_only.sql`
- Scenario definitions:
  `scripts/controlled_match_scenarios.py`
- Backfill:
  `scripts/backfill_controlled_match_scenarios.py`
- Verification:
  `scripts/verify_controlled_match_scenarios.py`
- PDF generator:
  `scripts/generate_controlled_match_pdfs.py`
- Generated previews:
  `output/pdf/controlled_match_scenarios/`

Use module invocation for the deployment scripts:

```powershell
python -m scripts.backfill_controlled_match_scenarios
python -m scripts.verify_controlled_match_scenarios
```
