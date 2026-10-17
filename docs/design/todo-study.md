# How good to-do apps behave, and what Buildpair takes from them

Written 2026-10-16 after the owner said ticking felt broken ("I click on the circle, then I can't click it"). It looks at Things 3, Todoist, TickTick, Apple Reminders, Microsoft To Do and Google Tasks. For each habit they share, it says why they do it and what Buildpair does now.

## What they all agree on

**A tick can always be taken back.** Every one of these apps lets you tap a finished item's circle again to reopen it. Todoist also shows an Undo notice for a few seconds after you finish something, and undoing a repeating task puts its old date back ([Todoist help](https://todoist.com/help/articles/complete-a-task-with-a-recurring-due-date-dmI6SVqdP)). The reason is simple. The circle is the most-tapped control in the app and it sits right next to the item's title, so mis-taps are common. If a mistake can't be fixed in one tap, people stop trusting the circle. In Buildpair a finished item's circle was switched off. That's the bug the owner hit.

**A finished item doesn't jump away at once.** Things and TickTick keep a just-ticked item in place for a moment, with a small check animation, before it slides into the finished part of the list. Reminders keeps it in place until you leave the list. That pause is what makes undo possible, because the item is still under your finger. It also gives the small reward of seeing it crossed off. In Buildpair the item moved to the bottom of the list the instant it was ticked.

**Today is short and honest.** Things' Today holds only what you chose to start today ([Things support](https://culturedcode.com/things/support/articles/4001304/)). Todoist's Today holds what's due today, plus an Overdue group at the top with a one-tap Reschedule, because a pile of old red items makes people give up on the list ([Todoist help](https://www.todoist.com/help/articles/plan-your-day-with-the-todoist-today-view-UVUXaiSs)). Neither shows empty projects. Buildpair's Today listed every space, empty ones included ("Nothing due" over and over), and mixed late items in with everything else.

**Adding is instant and stays in place.** Todoist, TickTick and Things each have an add row at the end of a list. Enter saves and leaves the box open for the next one, and Escape closes it. Capturing three things takes three lines of typing, not three trips through a menu. Buildpair has the + sheet, which is fine for one thing, but slow for a run of them.

**Items carry notes.** All six apps let an item hold a few lines of notes, such as a phone number, a link or what "done" means. People otherwise cram these into the title, and long titles make the list hard to scan.

**Repeating to-dos roll forward.** "Take out the bins every Monday" is one item. Ticking it moves it to the next Monday (Todoist, TickTick, Things, Reminders). Buildpair only has habits, counted as times a week, so "every monday" became "1 time a week" with no day.

**Deleting is easy and forgiving.** Swipe or menu, then Delete, with Undo instead of an "Are you sure?" dialog (Todoist, Google Tasks). Things sends deleted items to a Trash. Confirmation dialogs slow down the common case to protect the rare one, and an undo protects it just as well. Buildpair couldn't delete an item at all, only mark it "won't do".

**Finished things are kept, out of the way.** Things has the Logbook, Todoist has Completed, and Reminders has Show Completed. People look back to see what they got done, or to reopen something. Buildpair keeps today's finished items but has no way to see older ones.

**Phones use swipes, desktops use keys.** Reminders and Todoist use a swipe across a row to finish, schedule or delete it. On the desktop, the Things and Todoist keyboard shortcuts cover the same actions. Buildpair already has keyboard shortcuts on the web, but no swipes.

## What Buildpair does about it

In order. Each step ships on its own.

1. **Ticking you can trust.**
   - Tap a finished circle to reopen it. This works for to-dos, goals, today's habit tick, and "won't do".
   - A just-ticked item stays in place for a moment before it moves.
   - A "Done · Undo" notice appears for five seconds.
   - Reopening also takes back the "finished" line it posted in the space's chat, so supporters don't cheer something that isn't done.
   - Items can be deleted (with Undo), and a goal takes its steps with it.
   - The circle gets a bigger tap target.
2. **A calmer Today.**
   - An Overdue group at the top, with "Move to today".
   - Spaces with nothing for today are left out.
   - Things with no date sit in a folded "Anytime" group at the bottom instead of mixing in.
   - Adding from Today with no date means today.
3. **Faster adding and notes.** An add row at the end of each list (Enter keeps going), and a notes field on every item.
4. **Repeating to-dos.** Every day, weekdays, on chosen weekdays, or monthly. Ticking moves it to the next date, and Undo moves it back. Habits stay as they are, for "times a week" goals.
5. **Completed.** Each space gets a folded list of what was finished, newest first, where you can reopen anything.
6. **Swipes on phones.** Swipe right to finish, and swipe left to reschedule or delete.

## Left out on purpose

- **Priorities and flags.** Todoist has four priority levels and Reminders has flags. Buildpair's supporters, deadlines and goals already say what matters, and a second ranking system is something people have to keep up. We can revisit this if people ask.
- **Kanban boards and the Eisenhower matrix.** The product spec rules them out.
- **Drag to reorder.** This is useful, and Things is built around it. It needs a stored order on every item, though, so it waits until after the steps above.
