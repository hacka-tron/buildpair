# Backlog

Where the work stands, what's next, and what's still open. Update it whenever something finishes or comes up.

## > RESUME HERE (as of 2026-10-15)

**Done and pushed to `main`:** milestone 1 (foundations) and the landing page with sign-up. CI is green: lint, typecheck, 28 unit/integration tests, two browser tests (sign-up on desktop and mobile; two people chatting live), secret scan and CodeQL. Deploys are written but switched off until the one-time setup below.

**Pick it up locally:** follow "Run it locally" in [README.md](README.md). A fresh clone was checked on 2026-10-14: install, local database, `pnpm check`, and all three servers (API on 8787, web app on 8081, landing page on 8788) start and work; sign-in codes print in the API's terminal.

**Next, in order:**
1. **Owner: one-time setup** in [docs/SETUP.md](docs/SETUP.md): Cloudflare token, account ID and two D1 databases (paste their IDs into `apps/edge/wrangler.jsonc`), Resend with DNS records for `buildpair.app`, an Expo account and token, GitHub environments and secrets, then set `DEPLOY_ENABLED=true`. After that, merges deploy to staging and published releases deploy to production (with your approval).
2. **Owner: try it on a phone.** Make a development build (`npx eas-cli@latest build --profile development` in `apps/app`) and point `EXPO_PUBLIC_API_URL` at your laptop's local network address. The phone apps haven't been run on a real device yet.
3. **Build: milestone 3, items in full.** Habits (weekly progress), goals with steps, schedules and repeats, natural-language adding ("dentist friday 3pm"), the Today view across spaces, Skip / Won't do / Update from the item itself (the action bar and menu from the designs), reminders (UserHub alarms) and push notifications.

## What exists now

| Area | State |
|---|---|
| Sign-up and sign-in | Email codes (Better Auth on D1). Landing-page sign-up sets the account name and drops you into the app. Google sign-in is wired but hidden until keys are set (`GOOGLE_ENABLED`). |
| Spaces | Create (name + what it's for), list, invite by link (`buildpair.app/join/<token>`), join as a supporter. |
| Chat | Live messages, stacked reactions, presence ("here now"), completion and skip lines written by the room. Offline messages queue and send on reconnect; no duplicates; gaps catch up. |
| Items | To-dos can be added and ticked from the space's side panel. Habits, goals and the rest are rules-ready in `packages/domain` but have no screens yet. |
| Privacy | "Only visible to me" items never reach other members (enforced on the server, tested). |
| Landing page | `apps/site`: mobile and desktop, Margin Notes design, plain-language privacy page, invite-link redirects. |
| Pipeline | CI on every push and PR; per-PR preview environments; staging on merge; production on approved release; Dependabot. Previews and deploys are untested until the setup is done. |

## Known gaps (not bugs, just not built yet)

- **App Store requirements before any store release:** in-app account deletion, report and block, Sign in with Apple (needed once Google sign-in ships on iOS).
- **App icons and splash** are still Expo's template images; replace them with the Buildpair mark.
- **Universal Links / App Links** need `apple-app-site-association` and `assetlinks.json` served from `buildpair.app/.well-known/` once the Apple Team ID and Android signing key exist.
- **Invites** let anyone with the link join right away; the design calls for the owner to approve each request.
- **The app doesn't use the UserHub inbox socket yet**, so spaces you don't have open don't update live (they catch up when opened).
- **SpaceRoom rebuilds its state by replaying the whole log on wake.** Add snapshots before spaces get long histories.
- **The list of your spaces lives in D1**; the architecture moves it (with unread counts) into UserHub later.
- **No rate limiting** on commands yet.
- **Analytics and error tracking** (PostHog EU cookieless, Sentry) are decided but not wired in.
- **Desktop web layouts** (sidebar, margin, Cmd+K, Upcoming, weekly review) from `docs/design/buildpair-web.html` aren't built; the web app uses the simple responsive layout for now.
- **Dark mode** in the app (the landing page already has it).
- **Production deploys go straight to 100%** with a health check and one-command rollback; add gradual rollout after confirming it works with Durable Objects on staging.
- **Email goes through Resend**; Cloudflare Email Sending (in beta) can replace it by changing `EMAIL_PROVIDER`.
- **Repository license:** none yet (all rights reserved).
- **Dependabot pull requests** are open for routine updates; merge or close them as you like.

## Later milestones

4. **People:** owner-approved join requests, roles, Activity (the bell), Supporting tab, quiet-goal nudges to supporters, weekly reflections.
5. **Discover:** listings, offers ("support each other"), requests, profiles, badges, compliments.
6. **Desktop extras and beta:** sidebar layout, Cmd+K, Upcoming week view, weekly review, polish, privacy policy and terms.
7. **Integrations:** Jira first, then Linear and GitHub; habit sources like Apple Health and Strava.

## Decisions (owner)

- Domain `buildpair.app`: landing at `buildpair.app`, web app at `app.buildpair.app`, API at `api.buildpair.app` (staging: `staging.`, `app-staging.`, `api-staging.`).
- Public repository, no license for now.
- Sign-in: email codes first, then Google; add Sign in with Apple alongside Google on iOS.
- Analytics: privacy-first, no consent banner (PostHog EU cookieless, internal IDs only, session replay opt-in, a usage-data switch, no tracking pixels).
- Architecture: one Expo app; Cloudflare Workers with a Durable Object per space and per person, D1, R2. Details in [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).
- Inside a space, the chat comes first; updates come from the items themselves (no Update button in the chat).

## Where things are

| What | Where |
|---|---|
| Architecture and costs | [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) |
| Product record | [docs/PRODUCT.md](docs/PRODUCT.md) |
| Phone and desktop mockups | `docs/design/buildpair-screens.html`, `docs/design/buildpair-web.html` |
| Owner setup steps | [docs/SETUP.md](docs/SETUP.md) |
| Notes for coding agents | [CLAUDE.md](CLAUDE.md) |
| Design history and research | the `goalbuddy` repo, branch `claude/peaceful-hypatia-6qm1wu` |
