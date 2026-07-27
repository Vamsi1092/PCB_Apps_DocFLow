# Legacy Code

This folder contains inactive historical AI implementations and snapshots.

- `ai_service_groq_backup.py`: Groq/Llama backup.
- `snapshots/`: duplicate/older service snapshots from the former `backup/`
  directory.

Nothing under this folder is imported by the active `app/` package. Do not add
new runtime imports from `legacy/`; preserve these files only until regression
tests and archival approval exist.
