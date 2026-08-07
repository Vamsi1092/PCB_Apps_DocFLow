# DocFlow — Deployment Readiness Checklist

**Date:** 2026-07-29
**Scope:** `FrontEnd/` (React + Vite + TS, reads Supabase directly)

| # | Item | Confirmed | Version / Value |
|---|---|---|---|
| 1 | Package manager | ✅ | npm |
| 2 | Node.js version | ❌ Not pinned | Recommend 20 LTS |
| 3 | Install command | ✅ | `npm ci` |
| 4 | Build command | ✅ | `npm run build` |
| 5 | Build output folder | ✅ | `FrontEnd/dist/` |
| 6 | Test/lint commands | ❌ Broken | `npm run lint` (ESLint not installed); no test script |
| 7 | Frontend env vars | ✅ | `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY` |
| 8 | `.env.example` | ❌ Missing | — |
| 9 | Backend deployed separately | ❌ Not deployed | Not in frontend's runtime path today |
| 10 | Prod/staging API URLs | ❌ None | — |
| 11 | SPA fallback to `index.html` | ✅ Required | Needed at hosting layer (Netlify/Vercel/Nginx) |
| 12 | Build fails on TS/lint issues | ⚠️ Partial | TS: yes (`strict: true`). Lint: can't run (not installed) |
| 13 | Assets outside `FrontEnd/` | ✅ None | — |
| 14 | Cache busting / version display | ⚠️ Partial | Cache busting: yes (Vite hash). Version display: not implemented |

## Bottom line
Ready to deploy as-is on build/output/TS-strictness. Still need: Node version pin (#2), fix/remove lint (#6, #12), `.env.example` (#8), SPA fallback rewrite at host (#11). Backend has no deployment story (#9, #10).
