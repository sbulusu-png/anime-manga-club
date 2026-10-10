# Anime Manga Club API

The backend for the Anime Manga Club: reviews, watchlists, weekly club suggestions and explainable recommendations for anime and manga.

**Stack:** Node.js 24 · TypeScript · Hono · PostgreSQL 18 (Neon) · Drizzle ORM · Better Auth · Zod · Vitest

Interactive API docs are served at `/api/docs` (generated from the routes' own validation schemas).

## Running it

```bash
cp .env.example .env        # from the repo root, then fill it in
npm install
npm run db:migrate --workspace @amc/api
npm run db:seed --workspace @amc/api   # 50 popular anime + 50 manga from AniList
npm run dev                  # http://localhost:4000
```

Without `BREVO_API_KEY`, emails (sign-in codes, verification, password reset) are printed to the server log instead of sent. In development they're always printed too, so codes can be read there.

## Scripts (in `apps/api`)

| Script                                       | What it does                                                        |
| -------------------------------------------- | ------------------------------------------------------------------- |
| `dev` / `build` / `start`                    | Develop with reload / compile / run the build                       |
| `test`                                       | 230+ tests on an in-memory Postgres (PGlite)                        |
| `db:generate`                                | Create a migration from schema changes                              |
| `db:migrate`                                 | Apply migrations (uses the direct, unpooled connection)             |
| `db:seed`                                    | Load popular titles from AniList (safe to re-run)                   |
| `db:smoke`                                   | Check triggers, constraints and extensions on an **empty** database |
| `db:check-drift`                             | Fail if the schema and migrations are out of sync (CI)              |
| `user:set-role -- <email or username> admin` | Promote a club lead                                                 |

## How it's built

- **Auth:** Better Auth with email/password (email verification required, breached passwords rejected via Have I Been Pwned k-anonymity) and Google sign-in; httpOnly cookies checked against the database on every request, so sign-outs, resets and bans apply instantly.
- **Security:** CSRF origin checks, per-IP and per-member rate limits with proxy-aware client IPs, 64 KB body limit, strict CSP and `no-store` on every response, no account enumeration on sign-up or password reset.
- **Data integrity:** the database enforces the rules (one review per member per title, scores 1–10, Monday-dated suggestions); triggers keep like counts and club scores correct even through cascading account deletion.
- **Catalog:** titles are cached from AniList, searched with Postgres trigram indexes, imported on demand, and refreshed in the background, with a shared request budget so the API never floods AniList.
- **Recommendations:** a taste profile from scores and list statuses, collaborative "members with similar taste loved this", and franchise grouping; every suggestion says why.
- **Testing:** every test file loads a pre-migrated PGlite snapshot; a fake AniList answers the real GraphQL queries; CI also migrates and smoke-tests a real Postgres 18 and checks for schema drift.
