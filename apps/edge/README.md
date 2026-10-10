# @buildpair/edge

The Cloudflare Worker: Hono API (`src/app.ts`), the `SpaceRoom` and `UserHub` Durable Objects, Better Auth on D1.

## Configuration

Set in `wrangler.jsonc` (`vars`) per environment: `ENVIRONMENT`, `APP_ORIGINS` (comma-separated origins allowed to call the API), `BETTER_AUTH_URL`, `EMAIL_PROVIDER` (`console`, `resend`, `cloudflare`; `test` only in automated tests), `EMAIL_FROM`.

Secrets (`.dev.vars` locally, `wrangler secret put` when deployed): `BETTER_AUTH_SECRET`, `TICKET_SECRET`, and `RESEND_API_KEY` or `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET` when used. The Worker refuses to start with a clear error if any are missing.

## Commands

- `pnpm dev`: local API with local D1 and Durable Objects.
- `pnpm test`: integration tests in the Workers runtime.
- `pnpm db:generate`: new migration after changing `src/db/schema.ts`.
