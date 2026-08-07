# DocFlow — How to Run

## Stack

- **Frontend**: React 18 + TypeScript + Vite 6 + Tailwind CSS, reads Supabase directly
- **Backend**: Python 3.11+ FastAPI (Uvicorn), Microsoft Graph + OCI GenAI + Supabase
- **Database**: Supabase (Postgres)

## Frontend

```powershell
cd Projects/Docflow/FrontEnd
npm install
npm run dev
```

Requires `FrontEnd/.env`:
```
VITE_SUPABASE_URL=<supabase project url>
VITE_SUPABASE_PUBLISHABLE_KEY=<supabase anon/publishable key>
```

Other commands: `npm run build`, `npm run preview`

## Backend

```powershell
cd Projects/Docflow/email-intake-backend
python -m venv venv
.\venv\Scripts\Activate.ps1
pip install -r requirements.txt
Copy-Item .env.example .env
python -m uvicorn app.main:app --reload
```

Requires `email-intake-backend/.env`:
```
TENANT_ID=
CLIENT_ID=
CLIENT_SECRET=
MAILBOX_EMAIL=
SUPABASE_URL=
SUPABASE_KEY=
COMPARTMENT_ID=
OCI_REGION=us-ashburn-1
```

Backend runs at `http://127.0.0.1:8000` (local dev only, not currently called by the frontend).
