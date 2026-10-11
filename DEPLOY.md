# Deploying

Everything runs on free plans:

| Part     | Where                                                           |
| -------- | --------------------------------------------------------------- |
| Website  | [Vercel](https://vercel.com) (Hobby), at `animemangaclub.dev`   |
| API      | [Render](https://render.com) (Free), in Singapore               |
| Database | [Neon](https://neon.tech) (Free), in Singapore (ap-southeast-1) |
| Email    | [Brevo](https://www.brevo.com) (Free, 300 emails a day)         |
| Domain   | `animemangaclub.dev` at Name.com                                |

Browsers only ever talk to the website. It forwards `/api/*` to the API on Render, adding each visitor's IP and a shared secret (`WEB_PROXY_SECRET`), so the API's rate limits and sign-in emails name the visitor rather than Vercel's servers.

Never paste secrets into chat or into a file that gets committed: type them into each dashboard yourself.

## Before you start

1. **A fresh sign-in secret** for production (don't reuse the local one):
   ```bash
   node -e "console.log(require('node:crypto').randomBytes(32).toString('base64url'))"
   ```
2. **Delete the old Mail Sentry Google OAuth client** in Google Cloud Console, if it's still there.
3. Have the Neon connection strings ready (**Neon → Connect**): pooled for `DATABASE_URL`, direct (pooling off) for `DATABASE_URL_UNPOOLED`.

## 1. The API on Render

1. Sign up at Render with GitHub and let it see this repository.
2. **New → Blueprint**, pick the repository. Render reads [`render.yaml`](render.yaml): one free web service, `anime-manga-club-api`, built from [`apps/api/Dockerfile`](apps/api/Dockerfile) in Singapore.
3. Render asks for the values marked `sync: false`:

   | Setting                                    | Value                                                                      |
   | ------------------------------------------ | -------------------------------------------------------------------------- |
   | `DATABASE_URL`, `DATABASE_URL_UNPOOLED`    | Neon's pooled and direct connection strings                                |
   | `BETTER_AUTH_SECRET`                       | The fresh secret from "Before you start"                                   |
   | `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | The Anime Manga Club OAuth client                                          |
   | `BREVO_API_KEY`                            | Your Brevo API key                                                         |
   | `ALLOWED_EMAIL_DOMAINS`                    | The university's email domains, comma-separated (e.g. `uni.edu,uni.ac.in`) |

   The rest is already in `render.yaml` (the site's address, the sender, the time zone), and Render generates `WEB_PROXY_SECRET`.

4. Create it. The first build takes a few minutes. Each start applies any new database migrations first (`dist/scripts/serve.js`), because the free plan has no separate release step; a failed migration stops the start.
5. Check `https://anime-manga-club-api.onrender.com/api/health` (use your service's address if Render picked another): it should say `"status":"ok","database":"ok"`.
6. Open the service's **Environment** tab and copy `WEB_PROXY_SECRET` for the next step.

The free plan sleeps after 15 minutes without visitors; the next visitor waits about a minute. Step 4 below keeps it awake.

## 2. The website on Vercel

1. Sign up at Vercel with GitHub and **Add New → Project**, importing this repository.
2. Set **Root Directory** to `apps/web`. Vercel detects Next.js and installs the whole npm workspace.
3. Add two environment variables:

   | Setting            | Value                                                               |
   | ------------------ | ------------------------------------------------------------------- |
   | `API_ORIGIN`       | The API's address, e.g. `https://anime-manga-club-api.onrender.com` |
   | `WEB_PROXY_SECRET` | The same value as on Render                                         |

4. Deploy, then add the domain: **Settings → Domains**, add `animemangaclub.dev` and `www.animemangaclub.dev`, and redirect `www` to `animemangaclub.dev`.
5. Vercel shows the DNS records to add. At Name.com (**My Domains → animemangaclub.dev → Manage DNS Records**), add them next to the Brevo records. In the **Host** field leave it empty for `animemangaclub.dev` and type `www` for the other; Name.com adds the domain itself.
6. Vercel issues the HTTPS certificate itself (`.dev` addresses only work over HTTPS). If you ever add a CAA record, allow Let's Encrypt, or renewals fail.

Sign-in only works at `https://animemangaclub.dev` (the address in `render.yaml`), so share that, not the `.vercel.app` one.

## 3. Google sign-in

In Google Cloud Console, open the Anime Manga Club OAuth client and add:

- **Authorised JavaScript origin:** `https://animemangaclub.dev`
- **Authorised redirect URI:** `https://animemangaclub.dev/api/auth/callback/google`

Then **Google Auth Platform → Audience → Publish app**, so everyone can sign in, not just test users. With only the basic scopes (`openid`, `email`, `profile`) Google doesn't need to review the app. Anyone with a Google account can reach Google's screen, but the API only lets university addresses in.

## 4. Keep the API awake (optional)

At [cron-job.org](https://cron-job.org) (free), add a job that requests `https://anime-manga-club-api.onrender.com/api/health/live` every 10 minutes. Render's free 750 hours a month cover one service running all month.

Use `/api/health/live`, not `/api/health`: it doesn't touch the database, so Neon can still sleep when nobody's using the site (its free plan counts the hours it's awake).

## 5. Try it

1. Open `https://animemangaclub.dev`, sign up with a university email, confirm it, and sign in: the 6-digit code should arrive (check spam the first time).
2. Sign up with another address: it should say it's not a valid email for the club.
3. Club leads are set from your computer, with the production `DATABASE_URL` in `.env`: `npm run user:set-role --workspace @amc/api -- <email-or-username> admin` (or `user` to undo).

## Sending email from your own domain (Brevo)

Already set up for `animemangaclub.dev`. To redo it (for example on a new domain):

1. **API key.** In Brevo, open your name (top right) → **SMTP & API → API keys → Generate a new API key** (a regular key, not an MCP or SMTP key).
2. **Authenticate the domain.** **Senders, Domains & Dedicated IPs → Domains → Add a domain**. Brevo can add the DNS records at Name.com for you, or list them to add yourself (Host field: only the part before your domain).
3. **Add the sender.** **Senders → Add a sender**, e.g. `club@animemangaclub.dev` named "Anime Manga Club". On an authenticated domain no inbox is needed.
4. Set `EMAIL_FROM` to it (in `render.yaml`, and `.env` locally).

## Checked locally

- **Production start:** `node dist/scripts/serve.js` applied migrations ("Migrations are up to date") and served; `/api/health/live` and `/api/health` both answered `ok`.
- **Visitor IPs through the website:** with a shared secret set, sign-in attempts sent through the website as two visitors were rate-limited separately, and a forged secret was ignored.
- **The image:** an earlier Docker build was 407 MB with `node_modules` at 64 MB, only the API's production packages, no source code or `.env`, running as the non-root `node` user, and shut down cleanly on SIGTERM. To rebuild it from the repository root: `docker build -f apps/api/Dockerfile .`
