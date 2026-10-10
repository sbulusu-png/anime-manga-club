# Deploying the API to Fly.io

The API runs on Fly.io in Singapore (`sin`), next to the Neon database. The website (Vercel, later) forwards `/api/*` to it, so browsers never call Fly directly.

Files: [`Dockerfile`](Dockerfile), [`fly.toml`](fly.toml), and [`.dockerignore`](../../.dockerignore) at the repository root.

## Before the first deploy

1. **Rotate exposed secrets.** Create a new Neon database password, and delete the old Mail Sentry Google OAuth client. Then make a fresh `BETTER_AUTH_SECRET`:
   ```bash
   node -e "console.log(require('node:crypto').randomBytes(32).toString('base64url'))"
   ```
2. Install flyctl, sign in, and create the app without deploying (`fly launch --no-deploy --copy-config --config apps/api/fly.toml`). If the name `anime-manga-club-api` is taken, change `app` in `fly.toml`.
3. **Set the secrets.** Paste the values into your own terminal, never into chat or a file that gets committed:

   ```bash
   fly secrets set --config apps/api/fly.toml DATABASE_URL=... DATABASE_URL_UNPOOLED=... BETTER_AUTH_SECRET=... BETTER_AUTH_URL=... WEB_ORIGIN=... GOOGLE_CLIENT_ID=... GOOGLE_CLIENT_SECRET=... BREVO_API_KEY=... EMAIL_FROM=... ALLOWED_EMAIL_DOMAINS=...
   ```

   | Secret                                     | Value                                                                                             |
   | ------------------------------------------ | ------------------------------------------------------------------------------------------------- |
   | `DATABASE_URL`                             | Neon **pooled** connection string                                                                 |
   | `DATABASE_URL_UNPOOLED`                    | Neon **direct** connection string (used by migrations)                                            |
   | `BETTER_AUTH_SECRET`                       | The fresh value from step 1                                                                       |
   | `BETTER_AUTH_URL`, `WEB_ORIGIN`            | The public website URL, e.g. `https://your-site.vercel.app`                                       |
   | `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | Anime Manga Club OAuth client; add `https://<website>/api/auth/callback/google` as a redirect URI |
   | `BREVO_API_KEY`, `EMAIL_FROM`              | Required in production. `EMAIL_FROM` is a sender on a domain authenticated in Brevo (see below)   |
   | `ALLOWED_EMAIL_DOMAINS`                    | The university's email domains, comma-separated, e.g. `uni.edu,uni.ac.in`                         |

   `NODE_ENV`, `PORT`, `LOG_LEVEL` and `CLUB_TIMEZONE` are already set in `fly.toml`. Don't set `API_PORT` on Fly.

   Only addresses at `ALLOWED_EMAIL_DOMAINS` (and their subdomains) can join, and the API won't start in production without it. Every sign-in also needs a 6-digit code sent by email, so email must work before launch.

## Sending email from your own domain (Brevo)

Email goes through [Brevo](https://www.brevo.com) (free: 300 emails a day). University mail servers are strict, so send from a domain you've authenticated in Brevo, not from a Gmail address:

1. **API key.** In Brevo, open **SMTP & API → API keys → Generate a new API key**. Put it in `.env` as `BREVO_API_KEY` (and as a Fly secret). Never paste it into chat.
2. **Authenticate the domain.** Open **Senders, Domains & Dedicated IPs → Domains → Add a domain** and enter a subdomain, e.g. `mail.yourdomain.com`. A subdomain keeps the club's mail reputation separate from the main domain. Choose to add the records yourself.
3. **Add the DNS records** Brevo lists (a `brevo-code` TXT record, the DKIM records and a DMARC record) at your registrar. On Name.com: **My Domains → the domain → Manage DNS Records**. In the **Host** field type only the part before your domain (for `brevo1._domainkey.mail.yourdomain.com`, type `brevo1._domainkey.mail`), because Name.com adds the domain itself.
4. Back in Brevo, click **Authenticate this email domain**. It usually takes minutes, sometimes a few hours.
5. **Add the sender.** Under **Senders → Add a sender**, add e.g. `club@mail.yourdomain.com` with the name "Anime Manga Club". On an authenticated domain no inbox is needed.
6. Set `EMAIL_FROM="Anime Manga Club <club@mail.yourdomain.com>"` (`.env` and Fly secret).
7. Sign in with a university address and check the code lands in the inbox, not spam.

## Google sign-in for everyone

In Google Cloud Console → **Google Auth Platform → Audience**, the app starts in **Testing**, where only the listed test users can sign in. Click **Publish app** to allow everyone. With only the basic scopes (`openid`, `email`, `profile`) Google doesn't need to review the app. Anyone with a Google account can then reach Google's screen, but the API only lets university addresses in.

## Deploy

From the repository root:

```bash
fly deploy . --config apps/api/fly.toml
```

The release step runs `node dist/scripts/migrate.js` before new machines start, and a failed migration stops the deploy. Check `https://<app>.fly.dev/api/health`: it should return `{"status":"ok","database":"ok",...}`.

## Still to do with the Vercel step

- Point the website's API URL at `https://<app>.fly.dev`.
- **Client IPs for rate limits.** Fly's own proxy uses private addresses, which `DEFAULT_TRUSTED_PROXIES` already trusts. But requests will reach Fly through Vercel's servers, which have public, changing IPs. So until that hop is trusted (for example, a shared-secret header the website adds and the API checks), every visitor would share Vercel's IP for rate limiting. Solve this before launch.

## Checked locally

Built with Docker Desktop and run against Neon:

- **Image:** 407 MB, with `node_modules` at 64 MB. It holds only the API's production packages (no Next.js, TypeScript or test tools), no source code and no `.env`, and runs as the non-root `node` user. Installed versions match the lockfile.
- **Release command:** `node dist/scripts/migrate.js` ran and reported "Migrations are up to date".
- **Server:** `/api/health` returned `ok` with the database connected. Media, reviews, club picks, the session check and the OpenAPI spec returned 200, and a wrong-password sign-in returned 401.
- **Shutdown:** `docker stop` (SIGTERM) shut it down cleanly with exit code 0.

To repeat the build locally from the repository root:

```bash
docker build -f apps/api/Dockerfile -t amc-api:local .
```
