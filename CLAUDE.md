# Buildpair: working notes for agents

Start with [BACKLOG.md](BACKLOG.md) (where work stands, what's next) and update it when something finishes. Read [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) before changing structure, and [docs/PRODUCT.md](docs/PRODUCT.md) for what the product is. Design mockups: `docs/design/`.

## Map

| Path | Owns |
|---|---|
| `packages/protocol` | Zod schemas for commands, events, socket messages. Clients read server messages with `parseServerMessage`, which skips single events they don't know. Adding an event type that changes space state: bump `PROTOCOL_VERSION` and raise `MIN_PROTOCOL_VERSION` to it, so older clients are told to update instead of silently missing it. |
| `packages/domain` | `decide(state, command, actor)` and `applyEvent(state, event)`: the rules, pure functions, used by both app and server. All rule changes go here, with tests. |
| `packages/sync` | `SpaceSync`: optimistic updates, persisted pending queue, sequence cursor, gap catch-up. |
| `apps/edge/src/space-room.ts` | One Durable Object per space: the only writer, numbers every event, stores the log in its SQLite, runs sockets. |
| `apps/edge/src/user-hub.ts` | One Durable Object per person: inbox socket, pokes from spaces. |
| `apps/edge/src/app.ts` | Hono routes: auth, spaces, tickets, commands, invites. |
| `apps/edge/src/account.ts` | Deleting an account: removes owned spaces and erases the person from spaces they joined (`member.erased`, and their events are deleted from each log). |
| `apps/edge/src/db/schema.ts` | D1 schema (Drizzle). Change it, then `pnpm --filter @buildpair/edge db:generate`. |
| `apps/site` | Landing page and sign-up (`public/`), plus a Worker for per-environment config and invite redirects. |
| `apps/app/src/app` | Expo Router screens: Today (`index`), Spaces (`spaces/index`), a space (`spaces/[id]`), sign-in, invite join. |
| `apps/app/src/components` | `shell.tsx` (sidebar on wide screens, tab bar on phones), `kit.tsx` (avatars, tiles, item rows, sheets, chips), `item-sheet.tsx` (an item's details, goal steps, done / skip / won't do / update), `ui.tsx` (buttons, fields). |
| `apps/app/src/lib` | API client, auth, socket transport, local storage, `spaces.ts` (your spaces list and live views of several spaces), `format.ts` (dates and names). |

## Domains

`buildpair.app` landing and sign-up, `app.buildpair.app` the web app, `api.buildpair.app` the API (staging: `staging.`, `app-staging.`, `api-staging.`). Sessions are cookies shared across `buildpair.app` subdomains. Invite links are `buildpair.app/join/<token>`.

## Rules

- Every change to a space is a command handled by `decide`; never write space data any other way.
- Durable Objects: no `setTimeout`/`setInterval` (use alarms) so rooms can hibernate; schema changes bump `SCHEMA_VERSION` in `space-room.ts` and migrate on wake.
- D1 migrations must be backward compatible (add now, remove in a later release).
- Events about "only visible to me" items go to their owner only (`canSee`). Test privacy for every new event type.
- Never log message text, item titles or emails in production code paths.
- Errors shown to people say what happened and what to do, in plain words.
- Expo: read `apps/app/AGENTS.md`; use `npx expo install` for Expo packages.

## Commands

- `pnpm check`: lint, typecheck, all tests. Run before every commit.
- `pnpm format`: apply Biome formatting.
- Workers tests run in the real runtime (`@cloudflare/vitest-plugin`).
