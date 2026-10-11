# Buildpair

A social, accountable to-do and goals app for builders. You keep your goals and to-dos in **spaces**; the people you invite to a space see it move, notice when it goes quiet, and talk about it in the space's chat.

One Expo app runs on iOS, Android and the web. The backend runs on Cloudflare: a Worker for the API, a Durable Object per space (its list, its chat and its live connections) and one per person, D1 for global data. See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## Status

Milestone 1 (foundations) and the landing page with sign-up: sign-in with an email code, spaces, invite links, live chat with reactions, items that post completion lines to the chat, offline changes that sync on reconnect, CI and deploy pipelines. Next: items in full (habits, goals, schedules, Today), then people and Discover.

## Layout

```
apps/app      Expo app (iOS, Android, web), served at app.buildpair.app
apps/site     Landing page and sign-up at buildpair.app (static pages + a small Worker)
apps/edge     Cloudflare Worker: API, SpaceRoom and UserHub Durable Objects, D1 schema
packages/protocol   Commands, events and socket messages (Zod), shared by app and server
packages/domain     The rules: one function decides what a change does, on the device and on the server
packages/sync       The app's sync engine: local copy, pending queue, reconnect catch-up
e2e           Browser test: two people sign in and chat
docs          Architecture, product record, design mockups, setup
```

## Run it locally

Requires Node 22.13+ and pnpm 10 (`corepack enable`).

```sh
pnpm install
cp apps/edge/.dev.vars.example apps/edge/.dev.vars     # then put long random strings in it
pnpm --filter @buildpair/edge db:migrate:local
pnpm --filter @buildpair/edge dev                       # API on http://localhost:8787
pnpm --filter @buildpair/app web                        # web app on http://localhost:8081
pnpm --filter @buildpair/site dev                       # landing page on http://localhost:8788
```

Sign-in codes print in the API's terminal locally (`EMAIL_PROVIDER=console`). For phones, run `pnpm --filter @buildpair/app start` and open the app in a development build; set `EXPO_PUBLIC_API_URL` to an address your phone can reach.

## Checks

```sh
pnpm check        # Biome lint, TypeScript, unit and Workers tests
pnpm --filter @buildpair/e2e smoke    # two people chat (needs the API with EMAIL_PROVIDER=test and the web app)
pnpm --filter @buildpair/e2e signup   # sign-up from the landing page (also needs the site)
```

Deploying needs a one-time setup of Cloudflare, Expo and GitHub: [docs/SETUP.md](docs/SETUP.md).

All rights reserved. The code is public for transparency; no license is granted yet.
