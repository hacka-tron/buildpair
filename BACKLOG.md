# Backlog

Where the work stands, what's next, and what's still open. Update it whenever something finishes or comes up.

## > RESUME HERE (as of 2026-10-15)

**Done and pushed to `main`:** milestone 1 (foundations) and the landing page with sign-up. CI is green: lint, typecheck, 28 unit/integration tests, two browser tests (sign-up on desktop and mobile; two people chatting live), secret scan and CodeQL.

**Staging is live (2026-10-15):** `staging.buildpair.app` (landing), `app-staging.buildpair.app` (web app), `api-staging.buildpair.app` (API, `/health` OK). Every merge to `main` deploys there. Setup done: D1 databases, GitHub environments (production needs the owner's approval), variables, secrets including `RESEND_API_KEY`, Resend domain verified, `DEPLOY_ENABLED=true`. Production has not been released. Expo is not set up yet, so no phone updates are published.

**Pick it up locally:** follow "Run it locally" in [README.md](README.md). A fresh clone was checked on 2026-10-14: install, local database, `pnpm check`, and all three servers (API on 8787, web app on 8081, landing page on 8788) start and work; codes print in the API's terminal.

**App design pass (2026-10-15):** the app now follows the mockups' shell. Phones get a tab bar (Today, Spaces) and a floating +. Wide screens get the sidebar with your spaces. Today lists open items from every space, grouped by space, with a quick add sheet. Spaces shows tiles, summaries and faces. A space shows the chat with completion lines, stacked reactions (hover or press and hold to add), people with presence and an invite sheet. Checked in the browser at 390 and 1440 wide; not yet run on a real phone.

**Items, part 1 (2026-10-15):** quick add makes to-dos (today, tomorrow, no date), habits (times a week) and goals (finish by). Tapping an item opens its sheet: mark done, skip a habit for today, won't do, post an update to the chat, and a goal's steps with "+ Add a step". Habits show as done once checked off today; due goal steps show on Today.

**Sign-in uses passwords (2026-10-15):** email codes only go out to confirm a new account or reset a password. Shared test account `bagel` / `bagel` works on staging.

**Items, part 2 (2026-10-15):** plain-words adding ("dentist friday 3pm", "gym 4x a week", "launch v1 by nov 21"; the schedule decides to-do, habit or goal, and the add box shows what it read with an undo). A date picker with quick picks, a month calendar, times and a Repeat tab. Editing an item's title and schedule. Items have an optional time. To-dos record the day they were finished and skips are recorded, so both old gaps are fixed. Today has a "Coming up" section (next two weeks, plus goals). Protocol version 2.

**Next, in order:**
1. **Owner: try sign-in on staging** at `app-staging.buildpair.app` with `bagel` / `bagel`, then make your own account there (one confirmation email). Production (`buildpair.app`) isn't released, so it doesn't load yet.
2. **Owner: try it on a phone.** Make a development build (`npx eas-cli@latest build --profile development` in `apps/app`) and point `EXPO_PUBLIC_API_URL` at your laptop's local network address. The phone apps haven't been run on a real device yet.
3. **Build: rest of milestone 3.** Natural-language adding ("dentist friday 3pm"), editing an item (title, date, schedule, move to another space, only visible to me), multi-select with the action bar from the designs, a calendar date picker and repeat rules, reminders (UserHub alarms) and push notifications.

## What exists now

| Area | State |
|---|---|
| Sign-up and sign-in | Email and password (Better Auth on D1). One emailed code confirms the address at sign-up, and "Forgot your password?" emails a code to set a new one. Signing in sends nothing. Shared test account `bagel` / `bagel` on local, staging and previews (production refuses it). Landing-page sign-up drops you into the app. Google sign-in is wired but hidden until keys are set (`GOOGLE_ENABLED`). |
| Spaces | Create (name + what it's for), list, invite by link (`buildpair.app/join/<token>`), join as a supporter. |
| Chat | Live messages, stacked reactions, presence ("here now"), completion and skip lines written by the room. Offline messages queue and send on reconnect; no duplicates; gaps catch up. |
| Items | To-dos (with a due date), habits (times a week) and goals (finish by, with steps). Quick add, an item sheet with done, skip, won't do and post an update. |
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
- **Before production opens to the public:** rate limiting on sign-in and commands, report and block, in-app account deletion, real app icons and splash, owner-approved join requests. Until then, release only the landing page publicly if anything.
- **Staging is open to anyone.** Anyone can make an account there (one email each) or request password-reset codes, which spends the Resend quota and can hurt the domain's email reputation. The allowlist is built: set the `ALLOWED_EMAILS` variable on the staging and preview environments and redeploy to turn it on. Left off for now by the owner's choice (2026-10-15). Still to do: a Cloudflare rate-limiting rule on the auth endpoints and `noindex` on staging pages.
- **`hello@buildpair.app` only sends.** Nothing receives replies to it yet. Owner: turn on Cloudflare Email Routing for `buildpair.app` and forward `hello@` to a personal inbox (check the SPF record still includes Resend after).
- **Plain-words adding reads full weekday names and "today" anywhere** ("watch Friday Night Lights", "watch Today show" get a date). The add box shows what it read and one tap keeps the words as typed. Short names (fri, sat, sun) only count after on, next, this, by or due, or right before a time. "daily", "weekly" and "weekends" only count as the last words. Numeric dates need on, by, due or before ("on 10/20"). "At 7:30" stays in the words (morning or evening is unclear). A time with no day means today.
- **"Every monday" becomes 1 time a week**, not specific days. Habits only know times per week for now.
- **Still to build in milestone 3:** multi-select with the action bar, moving an item to another space, "only visible to me" after creating, reminders and push.
- **Confirm step polish (review of PR #16, minor):** check the 128-character password maximum in the verify-email wrapper, and hash the password before confirming so a failed database write can't leave the old password in place.
- **No rate limiting on auth routes yet.** Codes allow 5 guesses each. Add a Cloudflare rate-limiting rule on `/api/auth/*` before production.
- **The test account `bagel` is shared and public.** Anyone who reads the repo can sign in as it on staging. Fine for test data; keep real things out of it. Remove `TEST_LOGIN` from `wrangler.jsonc` to turn it off.
- **Accounts made with email codes before 2026-10-15 have no password.** They set one with "Forgot your password?".
- **Today and Spaces open a live socket per space** to show their contents. Fine for a few spaces; move to the UserHub inbox (see above) before people have many.
- **Space colors come from the space ID**, so two spaces can share a color. Let owners pick, as the design says.

## Later milestones

4. **People:** owner-approved join requests, roles, Activity (the bell), Supporting tab, quiet-goal nudges to supporters, weekly reflections.
5. **Discover:** listings, offers ("support each other"), requests, profiles, badges, compliments.
6. **Desktop extras and beta:** sidebar layout, Cmd+K, Upcoming week view, weekly review, polish, privacy policy and terms.
7. **Integrations:** Jira first, then Linear and GitHub; habit sources like Apple Health and Strava.

## Decisions (owner)

- Domain `buildpair.app`: landing at `buildpair.app`, web app at `app.buildpair.app`, API at `api.buildpair.app` (staging: `staging.`, `app-staging.`, `api-staging.`).
- Public repository, no license for now.
- Sign-in: email and password, with an emailed code only to confirm a new account or reset a password (2026-10-15, to save Resend email). Then Google; add Sign in with Apple alongside Google on iOS.
- Analytics: privacy-first, no consent banner (PostHog EU cookieless, internal IDs only, session replay opt-in, a usage-data switch, no tracking pixels).
- Architecture: one Expo app; Cloudflare Workers with a Durable Object per space and per person, D1, R2. Details in [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).
- Production database name stays `buildpair-production` (confirmed 2026-10-15).
- Staging stays open for now; the email allowlist is built but off (2026-10-15).
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
