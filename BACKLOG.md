# Backlog

Where the work stands, what's next, and what's still open. Update it whenever something finishes or comes up.

## > RESUME HERE (as of 2026-10-17)

**Where it stands.** Everything is merged to `main` and live on staging (`app-staging.buildpair.app`, sign in `bagel` / `bagel`). Production has never been released. Milestones 1 to 6 are built except reminders and push. Older day-by-day notes are in git history (this file before 2026-10-17).

**Done on 2026-10-16 and 17 (PRs #51 to #68):**
- Polish: move refusals report back, busy retries hold later changes, read positions follow you across devices, half-finished joins repair themselves.
- To-dos, following `docs/design/todo-study.md` (Things, Todoist, TickTick, Reminders):
  - untick and Undo, delete with Undo, and a ticked item keeps its place for a moment
  - a calmer Today (your own things, Overdue with "Move to today", Anytime folded)
  - notes, quick add that stays open, and repeating to-dos (protocol 10)
  - Upcoming as one agenda list
- Chat, following `docs/design/chat-study.md` (WeChat, QQ, LINE, Telegram, Teams):
  - your lines on the right, runs grouped, new lines pop in
  - Teams-style reactions (a floating bar on the bubble, pills on its edge, who reacted on hover, Report behind ⋯) drawn with Fluent Emoji
- The weekly review was removed at the owner's request.

**How the owner wants work done now.** One feature at a time: build it, check it in the browser (desktop and phone width), merge it, then start the next. The owner tries things on staging and in the local browser and sends short feedback; act on it first.

**Next, in order:**
1. **Chat step 3, typing indicator.** Bouncing dots with "Dana is typing". The sync layer currently drops typing notices (`case "typing": return` in `packages/sync/src/space-sync.ts`). An unmerged draft branch, `chat-alive`, has a working version of this and of steps 4 and 5 (`chat-fx.tsx`, sync `typing` in the snapshot with a test). Port one piece at a time onto a fresh branch from `main`; don't merge that branch as it is.
2. **Chat step 4, big emoji and double-tap ❤️.** Emoji-only lines show large. Double-tapping a line reacts ❤️ with a burst over the bubble (the draft's burst needed centering on the bubble).
3. **Chat step 5, celebrations.** Finished items as bright cards with a 🙌 High five button. Confetti when a goal is finished. Emoji rain on "congrats", "happy birthday", "shipped", "let's go" and similar words. Respect Reduce Motion.
4. **Chat step 6, nudges (WeChat pat pat).** Double-tap an avatar to nudge, with a per-space ending. Needs a new message kind and a protocol bump, so it gets an independent review.
5. **Chat step 7, cheer stickers.** A built-in pack of big cards. Also a new message kind, so review.
6. **Chat step 8, the spark.** A 🔥 day count when the owner and a supporter both show up three or more days running. Computed on the device.
7. **Swipes on phones** for to-dos (swipe right to finish, left to reschedule or delete). Step 6 of the to-do study.
8. **Dependabot PRs #64 to #67** are open. Check each (the Expo group has 21 updates, so test the web build and the browser). Merge the safe ones.
9. Then the known gaps below, or anything the owner asks for.

**Owner steps still waiting:**
- **Mail.** Turn on Cloudflare Email Routing for `buildpair.app`, add a personal inbox as the destination, route `hello@` and `reports@` to it, and add `_dmarc` (`v=DMARC1; p=none`). Then set `MODERATION_EMAIL=reports@buildpair.app` on staging and production and send a test report.
- **Phone.** A development build on a real phone. It's needed before reminders and push, along with an Expo account.
- **Integrations** (Jira, Sign in with Apple, analytics) wait, by the owner's choice.

**Working notes for the next session:**
- Local servers: `pnpm --filter @buildpair/edge dev` and `pnpm --filter @buildpair/app web`. Switching git branches while the web dev server runs reloads old code, so reload the page after switching.
- Local end-to-end test, the way CI runs it:
  1. Start the API with `wrangler dev --port 8787 --var EMAIL_PROVIDER:test --var ENVIRONMENT:test`.
  2. Build the web app with `EXPO_PUBLIC_API_URL=http://localhost:8787 pnpm build:web`, then serve it with `wrangler dev --port 8081` in `apps/app`.
  3. Run a temporary copy of `e2e/two-people-chat.mjs` with `chromium.launch({ channel: "chrome" })`, then delete the copy.
  4. Run this before merging anything that changes hover, sheets or reactions, because CI's headless browser is stricter.
- `pnpm check` can reuse cached results. When a type change looks suspicious, run `pnpm turbo run typecheck --force`.
- Merge only when every CI check passes (`if gh pr checks N | grep -v pass | grep -q .; then ...`).

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

- **App Store requirements before any store release:** Sign in with Apple (needed once Google sign-in ships on iOS).
- **Universal Links / App Links** need `apple-app-site-association` and `assetlinks.json` served from `buildpair.app/.well-known/` once the Apple Team ID and Android signing key exist.
- **Join request leftovers (review, minor):** a declined person can ask again with the same link (the owner can stop old links). After "Stop all old links", an existing member opening an old link is told it expired. The name on a request is the one they had when asking. The waiting count updates when the spaces list reloads, not live.
- **Approve edge cases (review, minor):** if the space can't be reached during "Let in", the person ends up in the spaces list but the room refuses them, and approving again doesn't fix it. Opening the invite link again now puts them back in. Any database error while approving drops the request without a join. A failed account deletion leaves its marker, so approvals for that person are undone until they finish deleting.
- **Rate limit leftovers (review, minor):** after a "busy", new changes still go out at once, so a change that depends on the waiting one can be refused (pause sending while a retry waits). The "Too many tries" notice stays until another message replaces it. `::ffff:` IPv4-mapped addresses would share one key. Typing notices over the socket aren't limited. Every PR preview shares one auth limit. There's no limit per account on password guesses from many addresses (codes are capped at 5 guesses each).
- **Report and block leftovers (review, minor):** people who left show as "Someone" on their old messages (the room doesn't keep former members' names). You can block any account ID, not only people you share a space with. Removing a user ID that isn't in the room leaves a harmless record (and an unknown ID answers "something failed" instead of "not found"). The 20-a-day report cap can be passed by a few with many requests at once. Narrow races: removing someone while their approval is still finishing can leave a member the room knows but the list doesn't (removing again fixes it), and a block landing at the same moment as their request can miss that request.
- **Profile leftovers (review, minor):** a goal count lost to a database error is never recovered. Compliments stay after people stop sharing a space (and can't then be taken back). The goal-count test waits up to a second for the count.
- **Discover leftovers (review, minor):** the 10-offers-a-day cap counts only offers still waiting (answered ones are deleted), and parallel requests can pass it by a few. A listing's goals and people count can lag a change by a moment.
- **Reflection leftovers (review, minor):** "Not now" isn't remembered across reloads. Tests don't cover the Friday/Monday and six-day edges. The room's new check that every event can be read back has no test that triggers it (the reflection length rule catches the one known case first).
- **Inbox leftovers (review, minor):** resending waiting changes over HTTPS counts against the change limit (the socket doesn't count resends). Two screens showing the same space can drop it back to quiet when one closes. Catch-up stops after 50 batches (about 25,000 events) until the next poke. The room's `more` flag and `SpaceSync.catchUp` have no server-side or sync tests. A request from an ended HTTPS session failing late can show a 5-second offline blip. If a session expires and a different person signs in without signing out, their inbox may not start until they reload.
- **Removal leftover (review, minor):** removing someone takes them out of the space first and off the list second. If the second step fails, or they open an invite link in between, opening the link puts them back in the space. Removing again fixes it. Fix: have the room remember removals.
- **Read position leftovers (review, minor):** positions a device saved before 2026-10-16 aren't sent to other devices until that space is read again. Past 2,000 spaces per person, new positions aren't saved on the server. The hub doesn't limit how often a device sends.
- **Activity has no "new" marker.** It shows the last two weeks of reactions and every waiting request, but doesn't remember what you've already seen, and only the bell's dot (for requests) hints at news. Reactions don't carry a time on the device, so they're ordered by the message they're on.
- **Owners only find out about join requests when they open the app.** The count shows on the Spaces tab and in the space, but nothing notifies them. Activity and push will.
- **Very large spaces (over about 1.5 MB of state) aren't snapshotted** and replay their whole log on wake. Split the snapshot or trim old chat when that matters.
- **The list of your spaces lives in D1**; the architecture moves it (with unread counts) into UserHub later.
- **Analytics and error tracking** (PostHog EU cookieless, Sentry) are decided but not wired in.
- **Desktop leftovers:** Today's right-hand margin, drag to reschedule on Upcoming, X to start selecting and U/M on a selection, right-click menus, and the habit detail view from `docs/design/buildpair-web.html` aren't built.
- **Switching between light and dark while the app is open redraws every screen,** so an open sheet or a half-typed message is lost at that moment.
- **Production deploys go straight to 100%** with a health check and one-command rollback; add gradual rollout after confirming it works with Durable Objects on staging.
- **Email goes through Resend**; Cloudflare Email Sending (in beta) can replace it by changing `EMAIL_PROVIDER`.
- **Repository license:** none yet (all rights reserved).
- **Before production opens to the public:** a moderation inbox (`MODERATION_EMAIL`) and a way to receive mail at `hello@buildpair.app`, which App Store review wants as a contact. Until then, release only the landing page publicly if anything.
- **Staging is open to anyone.** Anyone can make an account there (one email each) or request password-reset codes, which spends the Resend quota and can hurt the domain's email reputation. The allowlist is built: set the `ALLOWED_EMAILS` variable on the staging and preview environments and redeploy to turn it on. Left off for now by the owner's choice (2026-10-15). Sign-in and codes are now rate limited per address. Still to do: `noindex` on staging pages.
- **`hello@buildpair.app` only sends.** Nothing receives replies to it yet. Owner: turn on Cloudflare Email Routing for `buildpair.app` and forward `hello@` to a personal inbox (check the SPF record still includes Resend after).
- **Plain-words adding reads full weekday names and "today" anywhere** ("watch Friday Night Lights", "watch Today show" get a date). The add box shows what it read and one tap keeps the words as typed. Short names (fri, sat, sun) only count after on, next, this, by or due, or right before a time. "daily", "weekly" and "weekends" only count as the last words. Numeric dates need on, by, due or before ("on 10/20"). "At 7:30" stays in the words (morning or evening is unclear). A time with no day means today.
- **Quick add small cases (review of PR #18):** "SAT 3pm prep" reads as Saturday 3pm; a trailing "due" stays in the title ("pay bill due 11/20" keeps "due"); a period after a date stays ("call friday." becomes "call ."). Lookbehind in the parser is untested on a phone (Hermes).
- **"order 2 jan prints" reads as January 2.** A number next to a month name counts as a date anywhere in the words. The add box shows it and one tap undoes it.
- **To-do leftovers (review, minor):** notes typed in an open sheet overwrite notes changed meanwhile on another device. Each tick of a repeating to-do leaves a small record that's never cleaned up. "Every day" as a repeating to-do needs all seven day chips (quick add still reads "every day" as a habit). Skipping one of a repeating to-do can't be undone.
- **Still to build in milestone 3:** reminders and push.
- **Move leftovers (review, minor):** a private item's chat lines don't come back with it after a refusal. If the other space took a move but its answer was lost on the very last try (after about a day of failures), the item can end up in both spaces. Any error from the other space counts as unreachable and isn't logged. A resend with the same move ID after a refusal counts as a new move.
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

## Later milestones

4. **People:** owner-approved join requests, roles, Activity (the bell), Supporting tab, quiet-goal nudges to supporters, weekly reflections.
5. **Discover:** listings, offers ("support each other"), requests, profiles, badges, compliments.
6. **Desktop extras and beta:** sidebar layout, Cmd+K, Upcoming week view, weekly review, polish, privacy policy and terms.
7. **Integrations:** Jira first, then Linear and GitHub; habit sources like Apple Health and Strava.

## Decisions (owner)

- Upcoming is one agenda list (Overdue, then each of the next seven days with rows you can tick, then habits), not seven calendar columns. The owner found the columns confusing (2026-10-17).

- No weekly review. The Today banner, the review screen and its ⌘K entry are gone, so nothing asks for weekly reflections now. Reflections already posted still show in their chats (2026-10-16).

- Reaction emoji are drawn from Microsoft's Fluent Emoji (MIT, the 3D set Teams uses), bundled as six 96 px images in `apps/app/assets/emoji`, so they look the same on every device. Report sits behind a ⋯ More menu, and the bar shows only over the message itself (Claude's call, 2026-10-16).
- Reactions work like Teams: a floating bar of six quick reactions (👍 ❤️ 🔥 😂 🙌 👏) on hover or press and hold, pills hanging off the message's bottom edge that bounce in, and who reacted on hover. The always-visible "+ 🙂" button is gone (Claude's call, 2026-10-16).
- The chat gets more playful in steps, following `docs/design/chat-study.md` (WeChat pat pat and emoji rain, QQ sparks, LINE stickers, Telegram big emoji). First step: your lines on the right in blue, runs from one person grouped under one avatar, new lines pop in (Claude's call, 2026-10-16).
- To-dos follow the habits of the best to-do apps, as written up in `docs/design/todo-study.md`. A tick can always be taken back. A ticked item keeps its place for a moment. Every tick and delete shows Undo for five seconds, and deletes are sent only after that. Reopening takes back the chat line it posted. No priorities or flags for now (Claude's call, 2026-10-16).
- Today holds only your own things. Late ones gather in Overdue with "Move to today". Spaces with nothing for today are left out. Undated things sit in a folded Anytime group. Adding from Today with no date means today (Claude's call, 2026-10-16).
- Repeating on set days ("every monday", "weekdays", "weekends", "every month", "every 3 days") makes a repeating to-do that moves to its next date when ticked or skipped. Counts a week ("4x a week", "daily", "every week") still make habits. Before this, set days made habits with no day (Claude's call, 2026-10-16).
- Quick add stays open after each add, and items have notes saved when you leave the field (Claude's call, 2026-10-16).

- Integrations (Jira, Linear, GitHub, health apps) wait. Focus on core features and polish (2026-10-16).
- Privacy and terms drafts are fine as written, minimum age 16 (2026-10-16).
- Mail on the domain: `hello@` (public contact) and `reports@` (moderation) forward to the owner's personal inbox through Cloudflare Email Routing, so no personal address sits in the public repo (2026-10-16, suggested by Claude, owner to set up).

- The agent drives the project and decides; the owner reviews "Claude's call" entries later (2026-10-16). See "Who decides" in CLAUDE.md.
- Domain `buildpair.app`: landing at `buildpair.app`, web app at `app.buildpair.app`, API at `api.buildpair.app` (staging: `staging.`, `app-staging.`, `api-staging.`).
- Public repository, no license for now.
- Sign-in: email and password, with an emailed code only to confirm a new account or reset a password (2026-10-15, to save Resend email). Then Google; add Sign in with Apple alongside Google on iOS.
- Analytics: privacy-first, no consent banner (PostHog EU cookieless, internal IDs only, session replay opt-in, a usage-data switch, no tracking pixels).
- Architecture: one Expo app; Cloudflare Workers with a Durable Object per space and per person, D1, R2. Details in [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).
- Production database name stays `buildpair-production` (confirmed 2026-10-15).
- Staging stays open for now; the email allowlist is built but off (2026-10-15).
- Making an item private hides its past chat lines from the others too, and sharing it again brings them back (2026-10-16, Claude's call, reversible).
- People who leave or are removed keep their messages and items in the space. Their private items stay hidden. Blocks are one-way and silent (2026-10-16, Claude's call, reversible).
- A declined person may ask again; stopping old links is the owner's way to end it (2026-10-16, Claude's call, reversible).
- The Spaces tab lists only your own spaces; spaces others share are on Supporting. A space counts as quiet after 7 days with nothing from its owner (2026-10-16, Claude's call, reversible).
- Reflections are prompted Friday to Monday and post to the chat as a card; "Not now" isn't remembered across reloads (2026-10-16, Claude's call, reversible).
- Rate limits: 20 auth tries a minute per address, 120 changes a minute per person (2026-10-16, Claude's call, reversible in wrangler.jsonc).
- Profiles are visible only to people who share a space with you and haven't blocked you (or been blocked). Blocking clears compliments between you. Only shared goals count toward "goals finished". Two badges for now, Finisher (5 goals) and Reliable supporter (4 weeks). Compliments are one of each kind per pair and can be taken back (2026-10-16, Claude's call, reversible).
- Discover is opt-in per space, shows only shared open goals and habits (up to five), and turns offers into ordinary join requests with a note. Join requests from any source expire after a week (2026-10-16, Claude's call, reversible).
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
