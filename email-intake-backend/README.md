# Doc_Flow Email Intake Backend

FastAPI backend for the Daiwa Accounts Payable document-flow POC. It reads a
shared Outlook Inbox through Microsoft Graph, extracts supported attachments,
uses OCI Generative AI for classification and structured extraction, persists
results to Supabase, and runs POC invoice/PO/GRN validation.

## Start here

- Model/contributor instructions: [`AGENTS.md`](AGENTS.md)
- Complete project context: [`docs/Doc_Flow_Complete_Project_Context_for_Codex.md`](docs/Doc_Flow_Complete_Project_Context_for_Codex.md)
- Evidence-based backend audit: [`docs/CODEX_BACKEND_AUDIT.md`](docs/CODEX_BACKEND_AUDIT.md)
- Historical code only: [`legacy/README.md`](legacy/README.md)

## Repository layout

```text
app/
  main.py                  FastAPI app, routes, and current pipeline
  integrations/            Microsoft Graph and OCI provider code
  repositories/            Supabase persistence/query code
  services/                AI, extraction, post-processing, reference, validation
docs/                      Project context and audit
legacy/                    Inactive Groq and historical snapshots
scripts/                   Environment and development-server helpers
tests/                     Test plan and future automated tests
downloads/                 Local runtime/sample attachments (not source code)
main.py                    Compatibility ASGI entrypoint
*_service.py               Compatibility imports; implementations are under app/
```

## Local setup

```powershell
python -m venv venv
.\venv\Scripts\Activate.ps1
python -m pip install -r requirements.txt
Copy-Item .env.example .env
python -m uvicorn app.main:app --reload
```

The previous command remains supported:

```powershell
python -m uvicorn main:app --reload
```

The required environment-variable names are documented in `.env.example`.
Never commit `.env`, OCI private keys, Supabase service-role keys, Microsoft
client secrets, or access tokens.

## Current implementation boundary

This restructure changes module organization, not business behavior. The
current pipeline remains single-attachment, non-transactional POC code. Its
generated reference PO/GRN records are derived from invoices and are not live
JDE/ERP data. Read the audit before changing validation, idempotency, priority,
exceptions, or UI contracts.
