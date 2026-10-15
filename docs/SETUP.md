# One-time setup (owner)

Everything below is free at the start except Apple's developer program. CI checks run without any of it; deploy and preview workflows switch on when `DEPLOY_ENABLED` is set.

## 1. Cloudflare

1. In the Cloudflare dashboard for the account that holds `buildpair.app`, upgrade Workers to the **Paid plan ($5/month)** when you're ready for real users (Durable Objects and D1 work on the free plan for development).
2. Note your **Account ID** (Workers & Pages overview) and your **workers.dev subdomain** (Workers & Pages → your subdomain).
3. Create an **API token** with: Workers Scripts: Edit, D1: Edit, Workers Routes: Edit, Zone: Read (for `buildpair.app`), Account Settings: Read.
4. Create the databases and copy their IDs into `apps/edge/wrangler.jsonc` (replace `REPLACE_WITH_…`):
   ```sh
   pnpm --filter @buildpair/edge exec wrangler d1 create buildpair-staging
   pnpm --filter @buildpair/edge exec wrangler d1 create buildpair-production
   ```

## Domains

The deploy workflow attaches these custom domains automatically: `buildpair.app` (landing), `app.buildpair.app` (web app), `api.buildpair.app` (API), and the staging equivalents `staging.`, `app-staging.`, `api-staging.`.

## 2. Email

Sign-in codes go out through [Resend](https://resend.com) at first (free for 3,000 emails a month). Add the `buildpair.app` domain there and create the DNS records it shows (SPF, DKIM; also add a DMARC record `v=DMARC1; p=quarantine`). Create an API key. Cloudflare Email Sending can replace it later by switching `EMAIL_PROVIDER` to `cloudflare`.

## 3. Expo

Create an Expo account and project (`npx eas-cli@latest init` in `apps/app`), then an access token (expo.dev → Account settings → Access tokens).

## 4. GitHub (repository settings)

**Environments**: create `preview`, `staging` and `production`. On `production`, add yourself as a required reviewer.

**Variables** (Settings → Secrets and variables → Actions → Variables):

| Name | Value |
|---|---|
| `DEPLOY_ENABLED` | `true` once the steps above are done |
| `CLOUDFLARE_ACCOUNT_ID` | from step 1 |
| `CLOUDFLARE_WORKERS_SUBDOMAIN` | from step 1, without `.workers.dev` |
| `ALLOWED_EMAILS` | on the `staging` and `preview` environments only: comma-separated emails that may sign in there. Never set it on `production`. Removing it later doesn't remove it from the Worker; delete the secret in Cloudflare too. |

**Secrets** (on each environment, or repository-wide):

| Name | What |
|---|---|
| `CLOUDFLARE_API_TOKEN` | from step 1 |
| `BETTER_AUTH_SECRET` | a long random string (`openssl rand -base64 48`), different per environment |
| `TICKET_SECRET` | another long random string, different per environment |
| `RESEND_API_KEY` | from step 2 |
| `EXPO_TOKEN` | from step 3 |

Put the secrets on each environment (`preview`, `staging`, `production`). Every deploy copies them onto that environment's Worker, so nothing is set in Cloudflare by hand. `RESEND_API_KEY` is required for staging and production (one repository secret covers all environments) and optional for previews, which print sign-in codes to the logs without it.

Also turn on: branch protection for `main` (require the CI checks), secret scanning and push protection, and Dependabot alerts.

## 5. Google sign-in (when you add it)

Create OAuth credentials in Google Cloud Console (Web application) with the redirect URI `https://api.buildpair.app/api/auth/callback/google` (and the staging equivalent). Set `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` as Worker secrets. Before Google sign-in ships on iOS, add Sign in with Apple (App Store guideline 4.8).

## 6. App links

Universal Links and App Links need two files served from `https://buildpair.app/.well-known/` (`apple-app-site-association` and `assetlinks.json`), added once the app has its Apple Team ID and Android signing key.
