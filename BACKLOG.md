# Backlog

Where the work stands, what's next, and what's still open. Update it whenever something finishes or comes up.

## > RESUME HERE (as of 2026-10-16)

**Done and pushed to `main`:** milestone 1 (foundations) and the landing page with sign-up. CI is green: lint, typecheck, 28 unit/integration tests, two browser tests (sign-up on desktop and mobile; two people chatting live), secret scan and CodeQL.

**Staging is live (2026-10-15):** `staging.buildpair.app` (landing), `app-staging.buildpair.app` (web app), `api-staging.buildpair.app` (API, `/health` OK). Every merge to `main` deploys there. Setup done: D1 databases, GitHub environments (production needs the owner's approval), variables, secrets including `RESEND_API_KEY`, Resend domain verified, `DEPLOY_ENABLED=true`. Production has not been released. Expo is not set up yet, so no phone updates are published.

**Pick it up locally:** follow "Run it locally" in [README.md](README.md). A fresh clone was checked on 2026-10-14: install, local database, `pnpm check`, and all three servers (API on 8787, web app on 8081, landing page on 8788) start and work; codes print in the API's terminal.

**App design pass (2026-10-15):** the app now follows the mockups' shell. Phones get a tab bar (Today, Spaces) and a floating +. Wide screens get the sidebar with your spaces. Today lists open items from every space, grouped by space, with a quick add sheet. Spaces shows tiles, summaries and faces. A space shows the chat with completion lines, stacked reactions (hover or press and hold to add), people with presence and an invite sheet. Checked in the browser at 390 and 1440 wide; not yet run on a real phone.

**Items, part 1 (2026-10-15):** quick add makes to-dos (today, tomorrow, no date), habits (times a week) and goals (finish by). Tapping an item opens its sheet: mark done, skip a habit for today, won't do, post an update to the chat, and a goal's steps with "+ Add a step". Habits show as done once checked off today; due goal steps show on Today.

**Sign-in uses passwords (2026-10-15):** email codes only go out to confirm a new account or reset a password. Shared test account `bagel` / `bagel` works on staging.

**Items, part 2 (2026-10-15):** plain-words adding ("dentist friday 3pm", "gym 4x a week", "launch v1 by nov 21"; the schedule decides to-do, habit or goal, and the add box shows what it read with an undo). A date picker with quick picks, a month calendar, times and a Repeat tab. Editing an item's title and schedule. Items have an optional time. To-dos record the day they were finished and skips are recorded, so both old gaps are fixed. Today has a "Coming up" section (next two weeks, plus goals). Protocol version 2.

**Selecting several (2026-10-15):** press and hold an item (or Select on wide screens) on Today or in a space, tick more, then Done, Skip today, Won't do or Reschedule them together. "+ Add to <space>" reads plain words too.

**Space settings (2026-10-15):** owners rename a space, change what it's for, and pick its color (gear in the space header). The global spaces list (D1, new `color` column) follows the room. Protocol version 3.

**Profile and templates (2026-10-15):** a Profile screen (your avatar on Today, or your name in the sidebar) with name, what you're building, time zone from the device, change password and sign out. Quick add offers goal templates (Launch v1, First 10 users, Raise a round, Train 4x a week).

**Delete your account (2026-10-15, PR #26):** on the Profile screen, confirmed with your password. Spaces you own are deleted for everyone (their members see "This space is gone"). In spaces you joined, a `member.erased` event removes you and everything you made, and the room deletes your earlier events from its log. Your other signed-in devices are disconnected. Protocol version 4. Open: accounts with no password (Google only, not turned on yet) are told to set one with Forgot password first. Pending email codes for the address aren't deleted and expire on their own within 10 minutes. Narrow races if the person joins or makes a space while the delete runs; a retry finishes it.

**Private after creating (2026-10-16):** an item's sheet has "Make private" and "Share with the space". A goal takes its steps with it. Going private removes the item, its chat lines and the reactions on them from other members' screens and saved copies. Sharing again brings them all back. Steps now only go under your own top-level goal. Protocol version 5. Checked in the browser at 1440 wide; two-person behavior is covered by tests.

**Move to another space (2026-10-16):** "Move to another space" on an item's sheet. A goal takes its steps and their history. The old space's log forgets the item. Chat lines about a shared item stay in the old chat, and lines about a private one go. A move that stops partway finishes when tried again. Protocol version 6. Checked in the browser at 1440 wide.

**Join requests (2026-10-16):** opening an invite link now asks to join. The owner sees "Invite · N waiting" (a badge on phones, a tag on the Spaces tab), and lets people in or declines them from the invite sheet. "Stop all old links" resets them. Until let in, the person sees nothing of the space. Checked in the browser at 1440 wide.

**Rate limits (2026-10-16):** sign-in, sign-up and email codes allow 20 tries a minute per network address. Changes (commands over HTTPS or the socket, invites, moves, new spaces) allow 120 a minute per person. Over the limit, people see "Too many tries in a short time. Wait a minute, then try again." IPv6 callers count by their /64. Changes over the limit wait and are sent again, never dropped, and resending changes that already landed is free. Workers rate limiting counts per Cloudflare location, so the limits are approximate.

**Next, in order:**
1. **Owner: try sign-in on staging** at `app-staging.buildpair.app` with `bagel` / `bagel`, then make your own account there (one confirmation email). Production (`buildpair.app`) isn't released, so it doesn't load yet.
2. **Owner: try it on a phone.** Make a development build (`npx eas-cli@latest build --profile development` in `apps/app`) and point `EXPO_PUBLIC_API_URL` at your laptop's local network address. The phone apps haven't been run on a real device yet.
3. **Build: the Activity tab and the Supporting tab** (milestone 4).
4. **Build: report and block** (needed before production opens).
5. **Build: reminders and push.** Waits on the phone build (step 2) and an Expo account. Reminders run on UserHub alarms.

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

- **App Store requirements before any store release:** report and block, Sign in with Apple (needed once Google sign-in ships on iOS).
- **Universal Links / App Links** need `apple-app-site-association` and `assetlinks.json` served from `buildpair.app/.well-known/` once the Apple Team ID and Android signing key exist.
- **Join request leftovers (review, minor):** a declined person can ask again with the same link (the owner can stop old links). After "Stop all old links", an existing member opening an old link is told it expired. The name on a request is the one they had when asking. The waiting count updates when the spaces list reloads, not live.
- **Approve edge cases (review, minor):** if the space can't be reached during "Let in", the person ends up in the spaces list but the room refuses them, and approving again doesn't fix it. Fix: when the invite link finds a member, add them to the room again (it's safe to repeat). Any database error while approving drops the request without a join. A failed account deletion leaves its marker, so approvals for that person are undone until they finish deleting.
- **Rate limit leftovers (review, minor):** typing notices over the socket aren't limited. Every PR preview shares one auth limit. There's no limit per account on password guesses from many addresses (codes are capped at 5 guesses each).
- **Owners only find out about join requests when they open the app.** The count shows on the Spaces tab and in the space, but nothing notifies them. Activity and push will.
- **The app doesn't use the UserHub inbox socket yet**, so spaces you don't have open don't update live (they catch up when opened).
- **SpaceRoom rebuilds its state by replaying the whole log on wake.** Add snapshots before spaces get long histories.
- **The list of your spaces lives in D1**; the architecture moves it (with unread counts) into UserHub later.
- **Analytics and error tracking** (PostHog EU cookieless, Sentry) are decided but not wired in.
- **Desktop web layouts** (sidebar, margin, Cmd+K, Upcoming, weekly review) from `docs/design/buildpair-web.html` aren't built; the web app uses the simple responsive layout for now.
- **Dark mode** in the app (the landing page already has it).
- **Production deploys go straight to 100%** with a health check and one-command rollback; add gradual rollout after confirming it works with Durable Objects on staging.
- **Email goes through Resend**; Cloudflare Email Sending (in beta) can replace it by changing `EMAIL_PROVIDER`.
- **Repository license:** none yet (all rights reserved).
- **Before production opens to the public:** report and block. Until then, release only the landing page publicly if anything.
- **Staging is open to anyone.** Anyone can make an account there (one email each) or request password-reset codes, which spends the Resend quota and can hurt the domain's email reputation. The allowlist is built: set the `ALLOWED_EMAILS` variable on the staging and preview environments and redeploy to turn it on. Left off for now by the owner's choice (2026-10-15). Sign-in and codes are now rate limited per address. Still to do: `noindex` on staging pages.
- **`hello@buildpair.app` only sends.** Nothing receives replies to it yet. Owner: turn on Cloudflare Email Routing for `buildpair.app` and forward `hello@` to a personal inbox (check the SPF record still includes Resend after).
- **Plain-words adding reads full weekday names and "today" anywhere** ("watch Friday Night Lights", "watch Today show" get a date). The add box shows what it read and one tap keeps the words as typed. Short names (fri, sat, sun) only count after on, next, this, by or due, or right before a time. "daily", "weekly" and "weekends" only count as the last words. Numeric dates need on, by, due or before ("on 10/20"). "At 7:30" stays in the words (morning or evening is unclear). A time with no day means today.
- **Quick add small cases (review of PR #18):** "SAT 3pm prep" reads as Saturday 3pm; a trailing "due" stays in the title ("pay bill due 11/20" keeps "due"); a period after a date stays ("call friday." becomes "call ."). Lookbehind in the parser is untested on a phone (Hermes).
- **"order 2 jan prints" reads as January 2.** A number next to a month name counts as a date anywhere in the words. The add box shows it and one tap undoes it.
- **"Every monday" becomes 1 time a week**, not specific days. Habits only know times per week for now.
- **Still to build in milestone 3:** reminders and push.
- **Move leftovers (review of the move change, minor):** a move the other space refuses says "moved", and then the item reappears in the old space (only with a reused move ID, or if you left that space at the same moment). A private item's chat lines don't come back with it. A resend after a refusal does nothing. Alarm retries to an unreachable space never give up. Fix: report the refusal, drop the move record on refusal, and cap retries with a fall back to bringing the item home.
- **A move to a space that can't be reached waits.** The old space keeps a copy and retries every 30 seconds until the new space takes it, so for that time the item shows in neither. If the new space refuses (deleted, or you left), the item comes back. Not tested against a real outage.
- **Making an item private still tells others its ID (review of the visibility change, minor).** The "went private" notice names item IDs only, but goes to every member, including people who join later. From it they can tell that a private item (or a goal with N steps) exists and roughly when it was made.
- **Old odd step shapes keep their old visibility.** Before 2026-10-16 a direct command could put a goal under a goal, or a step under someone else's goal. The app never did. Such items don't follow their top goal when it's made private.
- **Sharing an item again copies its chat lines and reactions into the log.** Toggling a long-lived goal back and forth many times grows the log. No size limit yet; snapshots (above) would fix it.
- **Confirm step polish (review of PR #16, minor):** check the 128-character password maximum in the verify-email wrapper, and hash the password before confirming so a failed database write can't leave the old password in place.
- **The test account `bagel` is shared and public.** Anyone who reads the repo can sign in as it on staging. Fine for test data; keep real things out of it. Remove `TEST_LOGIN` from `wrangler.jsonc` to turn it off.
- **A space's color can't go back to automatic** once the owner picks one. The protocol would need a "none" value.
- **The spaces list (D1) isn't retried** if updating it after a rename or recolor fails. It stays out of date until the next edit, and the space screen corrects it when opened.
- **The `bagel` password can't be changed for long.** It goes back to `bagel` the next time anyone signs in as it, by design, so the shared account keeps working.
- **DMARC isn't set** for `buildpair.app`. Some inboxes trust its email less without it. Owner: add a `_dmarc` TXT record in Cloudflare DNS (start with `v=DMARC1; p=none`).
- **Portfolio screenshots in `docs/portfolio` are out of date.** The app has changed a lot since they were taken.
- **Account deletion leftovers (review of PR #26, minor):** pending email codes for the address aren't deleted (they expire within 10 minutes). If the person joins or makes a space while the delete runs, the delete can stop partway or leave their join in the space, and deleting again finishes it. Accounts with no password are told to set one with "Forgot your password?" first. Typing notices still go to every open connection without a member check (erased people's connections are already closed).
- **Accounts made with email codes before 2026-10-15 have no password.** They set one with "Forgot your password?".
- **Today and Spaces open a live socket per space** to show their contents. Fine for a few spaces; move to the UserHub inbox (see above) before people have many.

## Later milestones

4. **People:** owner-approved join requests, roles, Activity (the bell), Supporting tab, quiet-goal nudges to supporters, weekly reflections.
5. **Discover:** listings, offers ("support each other"), requests, profiles, badges, compliments.
6. **Desktop extras and beta:** sidebar layout, Cmd+K, Upcoming week view, weekly review, polish, privacy policy and terms.
7. **Integrations:** Jira first, then Linear and GitHub; habit sources like Apple Health and Strava.

## Decisions (owner)

- The agent drives the project and decides; the owner reviews "Claude's call" entries later (2026-10-16). See "Who decides" in CLAUDE.md.
- Domain `buildpair.app`: landing at `buildpair.app`, web app at `app.buildpair.app`, API at `api.buildpair.app` (staging: `staging.`, `app-staging.`, `api-staging.`).
- Public repository, no license for now.
- Sign-in: email and password, with an emailed code only to confirm a new account or reset a password (2026-10-15, to save Resend email). Then Google; add Sign in with Apple alongside Google on iOS.
- Analytics: privacy-first, no consent banner (PostHog EU cookieless, internal IDs only, session replay opt-in, a usage-data switch, no tracking pixels).
- Architecture: one Expo app; Cloudflare Workers with a Durable Object per space and per person, D1, R2. Details in [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).
- Production database name stays `buildpair-production` (confirmed 2026-10-15).
- Staging stays open for now; the email allowlist is built but off (2026-10-15).
- Making an item private hides its past chat lines from the others too, and sharing it again brings them back (2026-10-16, Claude's call, reversible).
- A declined person may ask again; stopping old links is the owner's way to end it (2026-10-16, Claude's call, reversible).
- Rate limits: 20 auth tries a minute per address, 120 changes a minute per person (2026-10-16, Claude's call, reversible in wrangler.jsonc).
- Any member can make an invite link, but only the owner lets people in (2026-10-16, Claude's call, reversible).
- Moving an item leaves its chat lines in the old chat if it was shared, and takes nothing with it into the new chat (2026-10-16, Claude's call, reversible).
- Steps follow their goal's visibility and go one level deep, under your own goal (2026-10-16, Claude's call, reversible).
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
