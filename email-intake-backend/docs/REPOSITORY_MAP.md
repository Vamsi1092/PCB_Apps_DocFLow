# Repository Map

This organization was introduced without changing endpoint or pipeline
behavior. Root Python files are compatibility shims; authoritative
implementations are listed below.

| Previous path | Authoritative path | Layer |
|---|---|---|
| `main.py` | `app/main.py` | FastAPI routes and orchestration |
| `graph_service.py` | `app/integrations/graph_service.py` | Microsoft Graph |
| `oci_config.py` | `app/integrations/oci_config.py` | OCI configuration |
| `oci_genai.py` | `app/integrations/oci_genai.py` | OCI client |
| `supabase_service.py` | `app/repositories/supabase_service.py` | Persistence/query access |
| `ai_service.py` | `app/services/ai_service.py` | AI classification/extraction |
| `classification_service.py` | `app/services/classification_service.py` | File readers/legacy classifier |
| `generic_recovery_service.py` | `app/services/generic_recovery_service.py` | Line normalization |
| `post_processing_service.py` | `app/services/post_processing_service.py` | Extraction cleanup |
| `reference_data_service.py` | `app/services/reference_data_service.py` | POC reference generation |
| `validation_service.py` | `app/services/validation_service.py` | Matching and validation |
| `ai_service_groq_backup.py` | `legacy/ai_service_groq_backup.py` | Historical, inactive |
| `backup/` | `legacy/snapshots/` | Historical, inactive |
| project context/audit | `docs/` | Documentation |
| `start-work.*` | `scripts/start-work.*` | Local shell setup |

## Dependency direction

```text
app.main
  -> app.services
  -> app.integrations
  -> app.repositories

services.reference_data_service -> repositories.supabase_service
services.validation_service     -> repositories.supabase_service
services.ai_service             -> integrations.oci_genai
integrations.oci_genai          -> integrations.oci_config
```

Services currently call repositories/integrations directly because this was a
structural move, not a behavioral refactor. Future route extraction and
dependency injection should proceed only after regression tests exist.
