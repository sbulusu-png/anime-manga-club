# Anime Manga Club: Build Plan

An anime review and recommendation site for the club, built as a portfolio-quality full-stack project.

## Stack (latest stable versions, checked on npm 2026-09-23)

| Layer              | Choice                                              | Version     |
| ------------------ | --------------------------------------------------- | ----------- |
| Runtime            | Node.js LTS                                         | 24          |
| Monorepo           | npm workspaces (`apps/api`, later `apps/web`)       | npm 11      |
| Language           | TypeScript (6.0 until typescript-eslint supports 7) | 6.0         |
| API server         | Hono on Node                                        | 4.13        |
| Database           | PostgreSQL on Neon (Singapore region)               | 18          |
| ORM and migrations | Drizzle ORM + drizzle-kit                           | 0.45        |
| Auth               | Better Auth (email/password + Google OAuth)         | 1.7         |
| Validation         | Zod, with schemas shared by the API and the web app | 4.6         |
| Tests              | Vitest + Playwright                                 | 5.0         |
| Web app            | Next.js (App Router) + React                        | 16.3 / 19.3 |
| Styling            | Tailwind CSS                                        | 4.3         |
| Animation          | GSAP + @gsap/react (timelines, ScrollTrigger)       | 3.15        |
| 3D toggle          | three (plain, tree-shaken; glTF + meshopt loaders)  | 0.186       |
| Anime data         | AniList GraphQL API (titles, covers, characters)    | n/a         |

Installed Claude plugins used: **gsap-skills** (all frontend motion), **graphify** (a knowledge graph of the codebase for architecture docs and the README).

---

## Phase 1: Backend

### 1.1 Foundation ✅

- Monorepo scaffold, strict TS config, ESLint and Prettier, `.env.example`, git init
- Hono app with health route, CORS for the web origin, structured logging, central error handler
- All API routes live under `/api`; in development and production the web app (port 3000) forwards `/api/*` to the API (port 4000), so auth cookies stay on one site
- Vitest setup and CI (GitHub Actions: lint, typecheck, test)

### 1.2 Database ✅

- Drizzle schema: Better Auth tables (`users`, `sessions`, `accounts`, `verifications`), `media` (anime **and** manga, cached from AniList), `reviews`, `review_likes`, `list_entries` (the watchlist/reading list), `follows`, `club_suggestions`
- Rules enforced by the database itself: one review per user per title, a verdict stored as 1–4 (updated in 2.5), no self-follows, suggestions dated on a Monday, cascading deletes
- Migrations with drizzle-kit (direct connection); seed script loads the 50 most popular anime and 50 manga from AniList
- Tests run the real migrations in PGlite (in-memory Postgres); a test keeps the auth tables in sync with Better Auth
- Scripts: `npm run db:generate`, `db:migrate`, `db:seed`, `db:studio` (in `apps/api`)

### 1.3 Authentication ✅

- Better Auth at `/api/auth/*`: email/password sign-up and sign-in, Google sign-in, sign-out, httpOnly `SameSite=Lax` session cookies (30 days, 5-minute cookie cache)
- Usernames (3–20 letters, numbers, `_` or `.`, case-insensitive): chosen at sign-up, or afterwards for Google accounts; `GET /api/me` reports `needsUsername`
- Guards: `requireAuth`, `requireUsername`, `requireRole(auth, "admin")` (always re-reads the role from the database)
- Security: CSRF origin checks on in every environment, callback URLs limited to our own site, Google accounts only merged into verified emails (blocks account pre-hijacking), sign-in/sign-up limited to 3 tries per 10 seconds per client IP, which is resolved from the socket and trusted proxies only
- `npm run user:set-role -- <email|username> admin` promotes a club lead (and signs them out everywhere)
- Development-only `GET /api/dev/google` starts Google sign-in from a plain link until the web app exists
- Later: password reset and email verification need an email provider (e.g. Resend); planned for 1.7

### 1.4 Anime and manga catalog ✅

- `GET /api/media`: filter by type, genres (all must match), tags, season, year, format, status; search titles in English, romaji or Japanese; sort by popularity, score, newest or title; cursor pagination (no gaps or repeats while titles are added)
- `GET /api/media/:id`: full title with synopsis, tags and characters (from AniList, cached for a day; the page still loads if AniList is down); titles older than 7 days refresh from AniList in the background
- `GET /api/media/discover?q=`: searches AniList for titles the club doesn't have yet and imports them (10-minute cache)
- `GET /api/media/anilist/:id`: find or import a title by its AniList id; `GET /api/media/genres` for filter menus
- Title search uses Postgres trigram (`pg_trgm`) indexes; adult titles are excluded everywhere
- AniList protection: a shared budget of 25 requests a minute, 10 lookups a minute per visitor, 8-second timeouts, and clear `CATALOG_BUSY` / `CATALOG_UNAVAILABLE` errors
- Tests use a fake AniList that answers the real GraphQL queries from fixtures

### 1.5 Reviews ✅

- `POST /api/reviews`, `PATCH /api/reviews/:id`, `DELETE /api/reviews/:id`: a verdict (Skip / Timepass / Go for it / Perfection; 1–10 scores until 2.5), text (10–10,000 characters, cleaned of control/invisible characters), spoiler flag; one review per member per title; only the author edits; the author or an admin deletes
- `PUT` / `DELETE /api/reviews/:id/like`: idempotent likes, no liking your own review
- `GET /api/reviews`: one feed for everything, filtered by title (`mediaId`) or author (`user`), sorted `recent` or `top` (most liked) over a week, month, year or all time; `GET /api/reviews/mine?mediaId=` for the member's own review
- Club verdict (members' average rounded to a verdict, plus review count; a numeric score until 2.5) on every title, and `sort=club` for titles
- Like counts and club scores are maintained by database triggers, so they stay right even when accounts are deleted
- Review writes are limited to 30 a minute per member; cursors use microsecond-exact timestamps so no review is ever skipped

### 1.6 Suggestions ✅

- **Lists** (`/api/list`): current (watching/reading), completed, paused, dropped (plan to watch was removed later, migration 0006), with progress; progress can't pass the known episode/chapter count and "completed" fills it in; lists are public by username (`?user=`), like on AniList
- **Club suggestions** (`/api/club/suggestions`): admins pick titles per week (Monday in the club's timezone, `CLUB_TIMEZONE`, default Asia/Kolkata) with an optional note; `/current` for this week, plus a paged archive; suggestions outlive their author
- **For you** (`GET /api/recommendations`): taste profile from verdicts and list statuses (genre and tag affinities), blended with "members with similar taste loved this", quality and the club verdict; sequels and adaptations of loved series say so; at most one title per franchise; new members get popular, highly rated picks; every item explains why
- **Similar titles** (`GET /api/media/:id/similar`): "members who loved X also loved Y", falling back to shared genres and tags; same type, other franchises only
- Tests: 217, using a pre-migrated database snapshot shared by all test files and half the CPU cores (stable on a 16 GB laptop)

### 1.7 Hardening ✅

- Email: verification (required for email/password members), password reset (1-hour links, signs out every device), and a heads-up to the owner when someone signs up with their email; Resend in production, printed to the log in development
- No account enumeration: sign-up with a taken email and reset requests for unknown emails look identical to real ones
- Breached passwords rejected (Have I Been Pwned, k-anonymity; fails closed)
- Sessions checked against the database on every request, so sign-out, reset, bans and deletion apply instantly (found and fixed: the 5-minute cookie cache kept revoked sessions alive)
- Members can delete their account; everything they made goes with it
- 64 KB body limit, 300 requests/minute per visitor, 30-second timeout, strict CSP, `no-store` on every response, crash logging
- OpenAPI spec at `/api/openapi.json` and interactive docs at `/api/docs` (plus Better Auth's schema), generated from the validation schemas
- An end-to-end member journey test; CI migrates and smoke-tests a real Postgres 18 and fails on schema drift
- `apps/api/README.md`

## Phase 2: Frontend

### 2.1 Shell and design system ✅

- Next.js 16 app in `apps/web`; `/api/*` is proxied to the API so the whole site is one origin; `npm run dev` starts both (the API uses `API_PORT`)
- Tailwind 4 design tokens for light and dark themes, measured at WCAG AA contrast (separate `accent` fill and `accent-text` colours, because no single red works for both in dark mode); Bangers and Inter fonts
- Sticky header with the signed-in member's avatar, desktop navigation from 1024 px and an accessible mobile menu below that (Escape closes it and returns focus; it closes after navigating); footer; skip link; Credits page; 404 and error pages
- **Anya Forger theme toggle**: the 3D model (476 KB) loads separately from the page, frames her full body, spins, turns half a turn per click, and stays still for reduced motion
- Lint: Next.js, React Hooks, `@eslint-react` and `jsx-a11y-x` (the modern plugins that support ESLint 10); typed routes

### 2.2 Landing page ✅

- The animated banner (GSAP timeline via `useGSAP`) directly under the header, as designed: five character panels, no names, hover to widen
- Live sections from the API: this week's club suggestions (with notes), most popular anime and manga (AniList scores and club verdicts), latest reviews (spoilers blurred until revealed)
- Cards fade and lift in as they scroll into view (`ScrollTrigger.batch`, once, skipped for reduced motion)
- Each section shows a friendly empty state, and the page still loads if the API is down; data is cached for 30 seconds to 10 minutes

### 2.3 Auth UI ✅

- Sign up (username, email, password, or Google) → "check your inbox" with a rate-limited resend → confirmation link signs the member in
- Sign in with email or username; unconfirmed members get a fresh link automatically; friendly messages for wrong passwords, rate limits, bans and Google errors
- "New sign-in" email after every sign-in (time, device, IP, method) with "Change my password" (or "Secure my Google account" for Google sign-ins); skipped for brand-new accounts and failed attempts
- Forgot/reset password; reset links stay usable if the new password is rejected as breached (a Better Auth ordering issue, fixed in an auth hook and covered by a test)
- Google members without a username pick one on `/welcome` (suggested from their name, checked live for availability); a header nudge reminds them until they do
- Protected pages (`requireMember`) send guests to sign-in and bring them back via a sanitised `?next=` that can't redirect off-site; signed-in members skip the auth pages

### 2.4 Browse and detail ✅

- `/browse`: search as you type, anime/manga toggle, genre chips, format/status/season/year, five sorts; all kept in the URL (shareable, back button works, bad values dropped)
- Server-rendered first page, then infinite scroll (IntersectionObserver plus a "Load more" button for keyboards) with de-duplicated pages
- "Search AniList for …" imports titles the club doesn't have yet (rate-limited per visitor)
- `/media/[id]`: banner, cover, club verdict and AniList score, facts, genres (link to filtered browse), collapsible synopsis, tags, characters, the club's top reviews and "If you like this"
- Similar titles now weight AniList's most relevant tags over genres and prefer the same format, with reasons like "Also has Revenge and Military"

### 2.5 Reviews and profiles ✅

- Verdicts replace 1–10 scores: Skip, Timepass, Go for it, Perfection (each with its own colour dot, matching the gauge) (stored 1–4; migration 0005 converts old scores). The club verdict comes with an evaluation gauge (a semicircle, Skip on the left round to Perfection on the right, each arc sized by votes, the verdict in the middle, counts and percentages below); profiles show one for the verdicts a member has given; suggestions weigh verdicts
- Review editor on title pages: pick a verdict, write, mark spoilers; edit and delete; likes with instant feedback (not on your own review)
- List control on title pages: plan / watching / completed / paused / dropped, episode or chapter progress (reaching the end marks it completed)
- `/reviews` feed (newest, or most liked this week / month / year / all time) with "more"
- Profiles at `/u/[username]`: verdicts given, likes received, episodes and chapters, favourite genres, reviews and anime/manga lists by status (`GET /api/users/:username`; never shows real names or emails)
- `/settings`: change username, change password (signs out other devices), sign out everywhere else, delete account (username + password; Google-only accounts need a sign-in from the last day, enforced by the API)
- Privacy: public reviews and suggestions no longer include members' real names
- A member's change updates the club verdict, feeds and their profile at once (tagged caches cleared by a server action); deleting an account refreshes every title page too
- Sign-up stays reachable from the sign-in page ("Create an account"); the separate "Join the club" buttons were removed on request

### 2.6 Recommendations ✅

- `/for-you`: up to 24 personal picks (everything / anime / manga), each with its reasons ("More Attack on Titan, which you loved", "Because you like Revenge and Military stories", "Club favourite: the club says Perfection"); new members get popular picks and a nudge to rate titles
- Suggestions now weigh a title's most relevant themes above genres and prefer the formats a member enjoys (TV vs movie); club favourites work with verdicts again (the 1–10 threshold had made them unreachable)
- `/club`: this week's picks, then past weeks grouped by week, with "Older weeks" paging
- `/admin` (club leads only; 404 for everyone else): move between weeks, search the catalog (or AniList) for a title, add it with a note, edit notes, remove picks; changes show on the home page and archive at once
- Weeks planned ahead stay private: the archive stops at this week and only admins can open upcoming weeks (API-enforced, tested)
- Signed-in members are no longer sent to sign-in when the API briefly can't be reached; they get "Try again" instead

### 2.7 Polish and ship ✅

- Private-repo prep: proprietary `LICENSE` ("All rights reserved"), packages marked `UNLICENSED`, no browser source maps in production, secret scan of everything that would be committed (clean)
- Playwright + axe end-to-end suite in `apps/e2e` (`npm run test:e2e`): 24 tests covering guests, sign-up/sign-in, reviews, lists, likes, profiles, the club lead panel, the phone menu and WCAG 2.2 AA scans of every page; throwaway `e2e-...@example.com` accounts are deleted afterwards; runs in CI against Postgres 18
- Fixes the tests found: likes survive leaving the page straight away (`keepalive`), the spoiler checkbox label, a review-card link below the 24px tap-target size, credits links that were told apart by colour only, card grids overflowing on phones
- Lighthouse (production build): accessibility, best practices and SEO 100 on every page, phone and desktop; performance 99–100 on desktop, about 68–76 on a simulated slow phone (home was 46). Added a site icon, screen-reader headings for results lists, and Anya now loads once the page is idle
- Anya is drawn with plain three.js (no `@react-three/fiber` or `drei`): the 3D download fell from 961 KB to 629 KB
- The API no longer crashes when Neon drops an idle connection (pool errors are logged and the pool reconnects; tested)
- Credits page and `CREDITS.md`; README with a Mermaid architecture diagram built from the graphify graph
- Fly.io deploy prep for the API: multi-stage `Dockerfile`, `fly.toml` (Singapore, health checks, migrations as the release step via `dist/scripts/migrate.js`), `.dockerignore`, and `apps/api/DEPLOY.md` with the secrets checklist. Built and run with Docker against Neon: a 407 MB image (API production packages only, non-root), the migration release step, working endpoints and a clean shutdown
- Anime backdrop behind every page, in both themes: colour glows (sakura and sky by day, crimson and violet neon at night), manga speed lines and halftone dots, and drifting sakura petals (hidden for reduced motion). CSS only, no images or JavaScript; strengths measured so text stays at 4.5:1 or better
- List simplified to four statuses (Watching, Completed, Paused, Dropped) shown as a 2×2 button grid instead of a dropdown; tap the selected one again to remove the title. "Plan to watch" removed (migration 0006). The statuses still feed suggestions as taste signals
- Checks: 264 API tests, 24 e2e tests, lint, format and types clean; both apps build

Later (only when asked):

- Push to a private GitHub repo
- Deploy the API to Fly.io and the website to Vercel; trust the Vercel → Fly hop so rate limits see real client IPs; custom domain
- Before launch: rotate the Neon password and the old Mail Sentry Google OAuth client
