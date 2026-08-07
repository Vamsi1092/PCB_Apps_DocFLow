# DocFlow — Deployment Q&A

Talking points for answering questions about deployment readiness. Companion
to `deployment-readiness.md` (the checklist table); this is the "what do I
say if someone asks" version.

---

**Q: What Node.js version does this need?**
Not pinned anywhere in the repo — no `.nvmrc`, no `.node-version`, no
`engines` field in `package.json`. My dev machine has Node v24.14.0 / npm
11.9.0 installed, but that's just what happens to be there, not something the
repo enforces. Recommended answer: **Node 20 LTS** — but that needs to
actually be added to the repo (`.nvmrc` + `engines`) to be a real guarantee
rather than a convention.

---

**Q: Why is `.env.example` empty?**
Two different files, two different states — don't conflate them:
- `email-intake-backend/.env.example` **exists**, and its values are
  intentionally blank (`TENANT_ID=`, `SUPABASE_URL=`, etc.). That's the whole
  point of an example file — it lists required variable *names* without real
  secrets, to be copied to `.env` and filled in. Not a bug.
- `FrontEnd/.env.example` **doesn't exist at all** — never created, even
  though `FrontEnd/.gitignore` has a rule implying one was meant to be
  checked in. This is the actual gap to fix.

---

**Q: Is the backend deployed separately?**
**No, it isn't deployed anywhere today.** No Dockerfile, no CI/CD config, no
hosting-platform config (Render/Railway/Fly/Vercel/etc.) anywhere in the
repo — it only runs locally via `venv` + `uvicorn --reload`. Also worth
flagging: the frontend doesn't even call this backend at runtime right now
(it reads Supabase directly), so before deploying it, confirm whether it's
still meant to be in the live path at all.

---

**Q: What are the production/staging API URLs for the FastAPI backend?**
**They don't exist yet.** The only URL anywhere in the docs is
`http://127.0.0.1:8000`, explicitly local-dev only. No `CORS_ORIGINS`,
`PORT`, or prod/staging config for the backend exists. Honest answer: "Not
defined — that's undecided, and moot right now since the frontend isn't
calling the backend in the first place."

---

**Q: What are the test/lint commands?**
**Lint is defined but broken; there are no tests.** `package.json` has
`"lint": "eslint ."`, but ESLint isn't installed (missing from
`devDependencies`, no binary in `node_modules/.bin`, no
`eslint.config.js`/`.eslintrc*` anywhere) — running it today fails with
"eslint not found," not a clean/dirty report. There's also **no `test`
script at all** — no Jest/Vitest/anything wired up, zero automated coverage.

---

**Q: Does the build fail on TS/lint issues?**
**TypeScript — yes. Lint — can't, because it's broken.**
`tsconfig.app.json` has `strict: true` (plus `noUnusedLocals`,
`noUnusedParameters`, `noFallthroughCasesInSwitch`), and the build script is
`tsc -b && vite build` — a real type error stops the build cold, no
override. ESLint can't gate anything because it isn't installed/configured
(see above) — "fails on lint issues" isn't a real policy today, it's a no-op
until ESLint is fixed.

---

**Q: What about cache busting / version display?**
**Cache busting is automatic; there's no visible version number.** Vite's
production build hashes every asset filename (`app-a1b2c3.js`,
`style-d4e5f6.css`), so browsers never serve stale JS/CSS after a deploy —
free, no extra config. But there's **no version/build indicator shown
anywhere in the app** (no footer string, no about page) — so if a user
reports a bug, there's no way to tell which build they're on.
`package.json` has a `version` field (`0.0.1`) that could be surfaced (e.g.
in `SettingsPage`) if wanted, but nobody's wired it up yet.
