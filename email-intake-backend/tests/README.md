# Test Suite

The suite contains isolated regression tests for grounded priority,
recommended-action selection, and their shared workflow decision contract.
These tests do not call Microsoft Graph, OCI, or Supabase.

The prioritized test matrix is in `docs/CODEX_BACKEND_AUDIT.md`, section 20.

Run:

```powershell
python -m pytest
```
