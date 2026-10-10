# Product

<!-- impeccable:product-schema 1 -->

## Platform

adaptive

One Expo (React Native) codebase ships to iOS, Android and the web. Each OS follows its own conventions (iOS Human Interface Guidelines, Material 3 on Android); the web gets its own responsive layout. The brand is shared; navigation, controls and system fonts follow the platform.

## Users

Builders: anyone making something on their own time or their own terms. Founders, indie hackers, people shipping side projects or apps made with AI, creators, small-business owners, writers. Their goals mix building and life (ship v1, get first users, meet investors, go to the gym, eat better), and they often work alone. Technical builders are an important early group; the product must work for non-technical builders without getting worse for technical ones.

They use it daily for light to-dos, and weekly to reflect on their goals and respond to the people they support.

## Product Purpose

Buildpair (formerly GoalBuddy) is a social, accountable to-do and goals app for builders. You set goals with light to-dos underneath, choose who supports each space, and those people see it move, notice when it goes quiet, and tell you how it looks from the outside. The point is the feeling that someone has eyes on you, so you never work toward your goals alone.

Success means members keep their shared goals moving, reach or honestly revise them, and keep supporting each other over time.

## Positioning

Plenty of apps track to-dos; Buildpair is about the people supporting them. It is not a task board, a scrum tool, a public social feed or a cofounder marketplace. Supporters are friends, matched partners or small groups who are close enough to care and far enough from the work to be honest: "this goal is too big", "you've been stuck on this for three weeks", "this is going better than you think".

## Operating Context

- **Goals and to-dos.** Goals are the center: business or personal. Each goal holds milestones and light to-dos; ticking them moves the goal's progress. Templates help builders start ("Launch v1", "First 10 users", "Raise a round", "Train 4x a week").
- **Updates come from items, not a separate button.** Ticking an item's circle marks it done in one tap. Long-pressing an item selects it (like TickTick); tapping more items selects several. While selected, the bottom bar becomes an action bar: Skip today, Won't do, Update (post a note to the space's chat) and Move, with ••• at the far right opening the full menu (edit, change schedule, reminder, move to another space, only visible to me, duplicate, delete). Skip and Won't do apply instantly, followed by a small dismissible "Add a reason" prompt.
- **Reactions stack** like Teams or Slack: identical emoji collapse into one chip with a count ("🔥 5"); tap to add yours, press and hold to see who reacted. Notifications group the same way ("Alex and 4 others reacted 🔥").
- **Collapsible sections.** Each space's section on Today, a space's list and chat, and the "Check in on" strip on Supporting collapse with an arrow.
- **Profile and settings** have no tabs: the member's photo in the corner of Today opens the profile (photo, name, time zone, what they're building, a plain line of supporting stats, earned badges, compliment counts, spaces posted to Discover, public finished goals); a gear on the profile opens settings (notifications, privacy, connected tools, appearance, account).
- **Space setup and sharing.** "New space" (a row with a + in the goal's space picker, or Space in the + menu) opens a short setup: name, required purpose ("What it's for"), who's in it, and the Show on Discover switch. Adding people: an "Add people by name or username" field whose suggestions start with people the member already shares spaces with, then anyone by name or username, plus "Add by ID" (every profile shows a copyable Buildpair ID like BP-4821-KQ); a list of people with their role (Owner, Supporter; remove from the same menu); and "Invite with a link" (like group chats such as WhatsApp or Discord): Share sends the link anywhere, anyone who opens it can ask to join, requests land in the space's Requests for approval, and the link can be reset. The same controls appear on each space's people screen. Spaces get an automatic color and initial, changeable by tapping the icon. Items hidden with "Only visible to me" show a small lock in the list.
- **Adding things.** A floating + in the bottom-right corner (like TickTick, same spot on iOS, Android and web). On Today it opens a small add bar above the keyboard: the text, a date chip and a space chip, and a send button. Natural language fills the date ("dentist friday 3pm"). The date chip opens the scheduler (quick picks, small calendar, time, reminder, and a Repeat tab); the space chip opens a pull-up list of spaces (defaulting to the most recent, with a New space row). There are no habit or goal buttons: the schedule decides. A single date makes a to-do, a repeat (e.g. 4 times a week) makes a habit with weekly progress, and a deadline with steps underneath makes a goal. On the Spaces tab, the + creates a new space. Inside a space, "+ Add to <space>" adds directly to it.
- **Spaces tab.** Lists the member's own spaces by recent activity: name, a short summary, faces of the people in it, an unread dot, and tags for pending requests and "On Discover"; plus an Archived section. New spaces are created from the floating +.
- **Reputation: badges and compliments.** Badges are earned automatically from behavior so they can be trusted (Fast responder: usually replies within a day; Reliable supporter: checked in on someone for 4+ weeks; Finisher: finished 5 goals; Season complete; more later). Compliments are positive-only tags supporters give each other (Honest takes, Keeps me going, Friendly, Great advice, Always checks in), prompted after a few weeks of support or when a goal finishes, with an optional note; they add up on the profile. A person's top badge and compliment show on their Discover cards. No star ratings: a private "Not a good fit" improves matching, and Report handles anything serious.
- **Spaces.** Everything lives in a space: a named list (e.g. "Life", "Ledgerly", "Running", "Private") holding to-dos, habits and goals, with one chat for the people in it. Sharing is set per space (only me, invited friends, or people who joined from Discover); any single item can be locked to stay private inside a shared space. A new goal goes into an existing space or a new one, and can move later. Inside a space the chat comes first: planning and editing happen on Today, and finding people happens on Supporting and Discover, so a space shows its chat as the main view with its open items in a small secondary panel (a side panel on the web). Small to-dos roll up into one chat line per day; goals and habits post their own lines; finished items fold into a "Done" section. The rules below about chats and supporters apply per space.
- **Three kinds of items.** To-dos are one-off tasks ("pick up the kids", "email the accountant"): private, no supporters, no chat; they can stand alone or belong to a goal. Goals with an end ("Launch v1 by Nov 21") have one chat for their whole life; when completed they post a celebration, then move to an Archived section after a few days and can be reopened; a goal can also be closed with a note. Habits ("Gym 4x a week") have one ongoing chat, never one per day; each check-off or skip is a line in it, with a weekly summary line. Chats exist only for shared goals and habits. Quick add creates a to-do by default; "Make it a goal" adds supporters.
- **Supporters per space.** Each space has an audience: only me (default), specific people, or public (for finished goals and wins). The owner can change it anytime.
- **Where supporters come from.** Friends invited by link or username, and Discover. There is no separate group object: a space with several people in it is the group. Every space has a required "What it's for" and a "Show on Discover" switch (in setup and on its people screen); when on, the space appears on Discover built from its purpose, its goals and any optional extras the owner asked supporters for. Locked items stay hidden. Discover has For you (spaces that fit, with reasons: similar goal, overlapping hours, time zone; no swiping) and Browse. Others offer either to support the space, or to support each other by suggesting one or more of their own spaces, with a short note. Offers arrive as requests in the space; for a mutual offer the owner picks one of the suggested spaces, then accepts or declines (no one-sided "accept support only"). Open offers are limited and expire after a week.
- **Every goal is a thread.** Completions post themselves ("Maya completed Run 5k"; Jira-linked goals post when items close) and supporters react. A member who misses something posts an update instead ("Car broke down, doing Saturday instead"). When a goal falls behind, supporters get a quiet nudge to check in (shown only to supporters, never to the goal's owner, so the check-in reads as a friend reaching out). Supporters can message in the thread; the weekly reflection and its structured replies live there too.
- **What supporters do.** See progress move, react, message in the thread, and nudge when a goal goes quiet. A "Supporting" tab gathers the goals others share with the member.
- **To-do basics, borrowed from the best to-do apps (TickTick in particular).** Natural-language quick add ("gym tomorrow 7am"), habits for repeating goals, Today and calendar views, reliable reminders, and a shared focus timer ("Focus with Sam for 50 minutes"). Basics are never paywalled. Kanban boards and the Eisenhower matrix are out of scope.
- **Weekly reflection.** On shared goals, a short weekly reflection adds the human part: how it went, where they are stuck, how they are doing, and an On track / At risk / Off track status. Supporters answer with structured prompts (going well, I'd focus on, honest take) or freely.
- **Integrations.** Progress updates itself where a goal is linked to a work tool: Jira first, more tools later by popularity. Supporters see goal progress, never the backlog.
- **Optional seasons.** Spaces with several people can run six-week seasons that end with a demo day.

## Capabilities and Constraints

- Existing: email/password accounts, goals and milestones with frequencies, buddy requests and connections, check-ins and chat with live delivery, a finder that matches by goal category, stats and streaks, themes (see `CLAUDE.md`).
- Planned: spaces with per-space supporters, friends, the Supporting tab, posting spaces to Discover with support offers, weekly reflections with structured replies, quiet-goal nudges, to-dos under goals, Jira sync, block and report, reminders.
- Retired: co-op mode (two people copying the same goal) and the swipe deck.
- Deferred: social sign-in (Google/GitHub), developer-only integrations (commits, deploys, API, CLI), revenue verification.
- The 8 selectable color themes move into a settings menu; the Buildpair theme is the default.
- Built in a new repository on Cloudflare (Workers, a Durable Object per space and per user, D1, R2) with one Expo app for iOS, Android and web; see `docs/architecture/buildpair-architecture.md`. The product domain is `buildpair.app`; `goalbuddy.app` is also registered at Cloudflare.

## Brand Commitments

- Name: Buildpair. Audience word: "builders".
- Brand color: royal blue.
- Mark (draft): two rounded shapes side by side, one filled royal blue and one outlined, "you and the person in your corner"; white on royal blue for the app icon. Wordmark: "Buildpair" in Schibsted Grotesk Bold with tight tracking. Draft only: a trademark search and a designer's refinement are pending.
- Brand placement: app icon (iOS, Android adaptive), web favicon, launch screen (mark only), welcome/sign-in screen (wordmark and a short promise), notifications (app icon; text about people), invite-link preview cards (mark on royal blue, space name and purpose), web sidebar, landing page and emails. Not in the headers of in-app screens.
- Tone: serious at the core, warm at the edges. Calm, precise screens; warmth through what the copy says and through real people, with small celebration moments for real progress. Earned badges and positive compliments are welcome as reputation; no star ratings of people, no like counts or leaderboards, no confetti-heavy gamification, no guilt in reminders.
- Chosen visual direction: "Margin Notes", where a goal is the page and supporters' notes sit beside it like an editor's notes in the margin.
- The owner rejects two looks: dark "hacker" styling (black screens, neon accents) and generic SaaS templates (purple gradients, stock illustrations).
- The owner asked for a design language in the spirit of Cloudflare's: restrained, confident, mostly light, one accent. Never copy Cloudflare's logo, orange palette, arc motif or illustrations.

## Evidence on Hand

- Research: `docs/research/developer-friendly.md` and the linked research artifact.
- No real testimonials, member counts, customer logos or outcome statistics exist yet; do not invent them. Do not use the "ASTD 95%" or "Dominican 76%" accountability statistics.

## Product Principles

1. People over tasks. The to-do list is the vehicle; the supporters are the product.
2. Small audiences. Accountability comes from specific people who know you, not followers.
3. Honest from the outside. Make candid, kind feedback easy to give and to receive.
4. Forgiving rhythm. Room for bad weeks; never shame a quiet goal, notice it.
5. Private by default. Every goal's audience is the owner's choice.

## Accessibility & Inclusion

Meet WCAG 2.2 AA contrast on the web and respect the platform's text-size settings (Dynamic Type on iOS, font scale on Android), Reduce Motion, and dark appearance on all three platforms. Reflections can carry personal struggles, so keep wording supportive and link to real help resources where someone signals distress.
