# Codex and Contributor Guide

## Source-of-truth order

1. The current implementation under `app/` is authoritative for runtime
   signatures and behavior.
2. `docs/Doc_Flow_Complete_Project_Context_for_Codex.md` is authoritative for
   business intent, history, decisions, and desired architecture.
3. `docs/CODEX_BACKEND_AUDIT.md` records the verified gaps between intent and
   the implementation as of 2026-07-22.

When these sources differ, report the difference. Do not silently implement
the handoff's intended behavior as though it already exists.

## Code map

- `app/main.py`: FastAPI application, all current routes, and
  `process_email_pipeline()` orchestration.
- `app/integrations/graph_service.py`: Microsoft identity/Graph calls and local
  attachment download.
- `app/integrations/oci_config.py` and `oci_genai.py`: OCI configuration/client.
- `app/repositories/supabase_service.py`: all current Supabase reads/writes and
  queue/dashboard queries.
- `app/services/ai_service.py`: OCI classification/extraction prompts/parsing.
- `app/services/classification_service.py`: file readers and old keyword
  classifier.
- `app/services/post_processing_service.py`: deterministic extraction cleanup.
- `app/services/generic_recovery_service.py`: numeric/line normalization helpers.
- `app/services/reference_data_service.py`: POC-generated reference PO/GRN.
- `app/services/validation_service.py`: current 2-way/3-way checks and storage.
- Root Python modules are compatibility shims. Make implementation changes in
  `app/`, not in the shims.
- `legacy/` is inactive historical evidence. Do not import it into new runtime
  code.

## Current pipeline

```text
Graph Inbox -> external-ID duplicate check -> first attachment download/read
-> OCI classification -> email/attachment insert -> OCI extraction
-> post-processing -> supplier alias lookup -> AP document + AI run
-> type-specific header/lines -> generated reference PO + GRN for invoices
-> validation rows + stage -> email AI fields/status -> Graph folder move
```

This flow is not transactional. It stores `internet_message_id` but currently
deduplicates on mutable Graph message ID. Generated references copy invoice
facts and must never be described as independent JDE validation.

## Change rules

- Preserve `uvicorn main:app` and existing endpoint paths until callers migrate.
- Add regression tests before changing pipeline sequencing or validation.
- Never build new behavior on `extracted_documents` or `work_items`.
- Do not treat `None == None`, empty strings, or coerced zeroes as business
  matches.
- Do not create invoice-derived PO/GRN records in a production ERP provider.
- Keep Graph, OCI, persistence, and business rules in their existing boundaries;
  move routes out of `app/main.py` incrementally only with tests.
- Prefer Pydantic request/response schemas for new APIs.
- Use migrations for schema changes. This repository currently has no migration
  history, so capture the deployed schema before the first DB change.
- Do not expose local paths, raw provider errors, tokens, prompts, document text,
  or secrets in new API responses/logs.
- Do not run state-changing Outlook/Supabase routes as tests.

## Verification commands

```powershell
python -m compileall -q app
python -m pytest
python -m uvicorn app.main:app --reload
```

The first two commands are safe only after a working interpreter/dependencies
and isolated tests are available. External providers should be faked in tests.

## Environment names

Active runtime configuration uses `TENANT_ID`, `CLIENT_ID`, `CLIENT_SECRET`,
`MAILBOX_EMAIL`, `SUPABASE_URL`, `SUPABASE_KEY`, `COMPARTMENT_ID`, and
`OCI_REGION`. `GROQ_API_KEY` belongs only to the legacy backup.
