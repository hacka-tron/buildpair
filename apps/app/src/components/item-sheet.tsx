import { newId, type SpaceState, weekProgress } from "@buildpair/domain";
import type { Item } from "@buildpair/protocol";
import type { Change } from "@buildpair/sync";
import { useState } from "react";
import { Pressable, Text, TextInput, View } from "react-native";
import { dueLabel } from "../lib/format";
import { colors, radius, space } from "../lib/theme";
import { ItemRow, Sheet, Tag } from "./kit";
import { type Schedule, SchedulePanel } from "./schedule";
import { Button, ErrorText } from "./ui";

type Mode = null | "skip" | "wont" | "update" | "edit";

const PROMPTS: Record<
  Exclude<Mode, null | "edit">,
  { placeholder: string; confirm: string; optional: boolean }
> = {
  skip: { placeholder: "Add a reason (optional)", confirm: "Skip today", optional: true },
  wont: { placeholder: "Add a reason (optional)", confirm: "Won't do it", optional: true },
  update: { placeholder: "How's it going?", confirm: "Post to the chat", optional: false },
};

/** What an item is, what's under it, and what you can do with it. Key it by item ID so it starts fresh. */
export function ItemSheet(props: {
  item: Item | null;
  view: SpaceState | undefined;
  userId: string;
  today: string;
  wide: boolean;
  onClose: () => void;
  /** Applies a change; returns why it didn't happen, or null. */
  apply: (change: Change) => string | null;
}) {
  const { item, view } = props;
  const [mode, setMode] = useState<Mode>(null);
  const [text, setText] = useState("");
  const [step, setStep] = useState("");
  const [error, setError] = useState("");

  if (!item) return null;

  // Read the live copy so the sheet updates as steps are ticked.
  const live = view?.items[item.id] ?? item;
  const mine = live.ownerId === props.userId;
  const open = live.status === "open";
  const shared = live.visibility === "space";
  const doneToday = live.kind === "habit" && live.doneOn.includes(props.today);
  const skippedToday = live.skippedOn.includes(props.today);
  const steps = Object.values(view?.items ?? {}).filter((i) => i.parentId === live.id);
  const owner = view?.members[live.ownerId]?.name ?? "Someone";

  const run = (change: Change, after?: () => void) => {
    const problem = props.apply(change);
    if (problem) return setError(problem);
    setError("");
    after?.();
  };

  const confirm = () => {
    const reason = text.trim() || null;
    if (mode === "skip")
      run({ type: "item.skip", payload: { itemId: live.id, on: props.today, reason } }, props.onClose);
    if (mode === "wont") run({ type: "item.wont", payload: { itemId: live.id, reason } }, props.onClose);
    if (mode === "update" && reason)
      run({ type: "item.update", payload: { itemId: live.id, body: reason } }, props.onClose);
  };

  if (mode === "edit")
    return (
      <Sheet visible onClose={props.onClose} title="Edit" wide={props.wide}>
        <EditItem
          item={live}
          onCancel={() => setMode(null)}
          apply={(change) => run(change, () => setMode(null))}
        />
        <ErrorText>{error}</ErrorText>
      </Sheet>
    );

  return (
    <Sheet visible onClose={props.onClose} title={live.title} wide={props.wide}>
      <View style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: space.sm }}>
        <Tag tone="blue">{live.kind === "todo" ? "To-do" : live.kind === "habit" ? "Habit" : "Goal"}</Tag>
        <Text style={{ fontSize: 14, color: colors.sub }}>{describe(live, steps, props.today)}</Text>
        {!shared && live.parentId ? (
          <Text style={{ fontSize: 14, color: colors.sub }}>· Only you can see this</Text>
        ) : null}
        {!mine ? <Text style={{ fontSize: 14, color: colors.sub }}>· Added by {owner}</Text> : null}
        {mine && open ? (
          <Pressable
            onPress={() => {
              setError("");
              setMode("edit");
            }}
            accessibilityRole="button"
            hitSlop={8}
            style={{ marginLeft: "auto" }}
          >
            <Text style={{ fontSize: 14, fontWeight: "600", color: colors.blue }}>Edit</Text>
          </Pressable>
        ) : null}
      </View>

      {mine && !live.parentId ? (
        <View style={{ flexDirection: "row", alignItems: "center", gap: space.sm }}>
          <Text style={{ flex: 1, fontSize: 13, color: colors.sub }}>
            {shared
              ? "Everyone in this space can see this."
              : "Only you can see this. Its check-offs don't post to the chat."}
          </Text>
          <Pressable
            onPress={() =>
              run({
                type: "item.visibility",
                payload: { itemId: live.id, visibility: shared ? "owner" : "space" },
              })
            }
            accessibilityRole="button"
            hitSlop={8}
          >
            <Text style={{ fontSize: 14, fontWeight: "600", color: colors.blue }}>
              {shared ? "Make private" : "Share with the space"}
            </Text>
          </Pressable>
        </View>
      ) : null}

      {live.kind === "goal" ? (
        <View>
          <Text style={{ fontSize: 13, fontWeight: "700", color: colors.ink, marginBottom: 4 }}>Steps</Text>
          {steps.length === 0 ? (
            <Text style={{ fontSize: 13, color: colors.faint, paddingVertical: space.sm }}>
              No steps yet. Break the goal into a few things you can tick off.
            </Text>
          ) : null}
          {steps.map((s, i) => (
            <ItemRow
              key={s.id}
              item={s}
              today={props.today}
              last={i === steps.length - 1 && !(mine && open)}
              readOnly={!mine || !open}
              onToggle={() => run({ type: "item.complete", payload: { itemId: s.id, on: props.today } })}
            />
          ))}
          {mine && open ? (
            <TextInput
              value={step}
              onChangeText={setStep}
              onSubmitEditing={() => {
                const title = step.trim();
                if (!title) return;
                run(
                  {
                    type: "item.create",
                    payload: {
                      itemId: newId(),
                      kind: "todo",
                      title,
                      parentId: live.id,
                      visibility: live.visibility,
                    },
                  },
                  () => setStep(""),
                );
              }}
              submitBehavior="submit"
              placeholder="+ Add a step"
              placeholderTextColor={colors.blue}
              accessibilityLabel="Add a step"
              style={{ paddingVertical: 12, fontSize: 16, color: colors.ink, outlineColor: colors.royal }}
            />
          ) : null}
        </View>
      ) : null}

      {mode ? (
        <View style={{ gap: space.md }}>
          <TextInput
            autoFocus
            value={text}
            onChangeText={setText}
            placeholder={PROMPTS[mode].placeholder}
            placeholderTextColor={colors.faint}
            multiline={mode === "update"}
            style={{
              borderWidth: 1,
              borderColor: colors.line,
              borderRadius: radius.control,
              paddingHorizontal: space.md,
              paddingVertical: 12,
              fontSize: 16,
              minHeight: mode === "update" ? 90 : undefined,
              textAlignVertical: "top",
              color: colors.ink,
              outlineColor: colors.royal,
            }}
          />
          {mode !== "update" && shared ? (
            <Text style={{ fontSize: 13, color: colors.sub }}>This posts a line to the space's chat.</Text>
          ) : null}
          <ErrorText>{error}</ErrorText>
          <View style={{ flexDirection: "row", gap: space.sm }}>
            <View style={{ flex: 1 }}>
              <Button label="Back" kind="secondary" onPress={() => setMode(null)} />
            </View>
            <View style={{ flex: 1 }}>
              <Button
                label={PROMPTS[mode].confirm}
                onPress={confirm}
                disabled={!PROMPTS[mode].optional && !text.trim()}
              />
            </View>
          </View>
        </View>
      ) : mine && open ? (
        <View style={{ gap: space.sm }}>
          <ErrorText>{error}</ErrorText>
          {!doneToday ? (
            <Button
              label={
                live.kind === "habit" ? "Done today" : live.kind === "goal" ? "Finish goal" : "Mark done"
              }
              onPress={() =>
                run({ type: "item.complete", payload: { itemId: live.id, on: props.today } }, props.onClose)
              }
            />
          ) : null}
          <View style={{ flexDirection: "row", gap: space.sm }}>
            {live.kind === "habit" && !doneToday && !skippedToday ? (
              <View style={{ flex: 1 }}>
                <Button label="Skip" kind="secondary" onPress={() => setMode("skip")} />
              </View>
            ) : null}
            <View style={{ flex: 1 }}>
              <Button label="Won't do" kind="secondary" onPress={() => setMode("wont")} />
            </View>
            {shared ? (
              <View style={{ flex: 1 }}>
                <Button label="Update" kind="secondary" onPress={() => setMode("update")} />
              </View>
            ) : null}
          </View>
        </View>
      ) : (
        <Text style={{ fontSize: 13, color: colors.faint }}>
          {mine
            ? "This one is closed."
            : "Only the person who added it can change it. You can react and reply in the chat."}
        </Text>
      )}
    </Sheet>
  );
}

function describe(item: Item, steps: Item[], today: string): string {
  if (item.kind === "habit") {
    const p = weekProgress(item, today);
    return `${item.timesPerWeek} times a week · ${p.done} of ${p.target} this week`;
  }
  const parts: string[] = [];
  if (item.kind === "goal") {
    const done = steps.filter((s) => s.status === "done").length;
    parts.push(`${done} of ${steps.length} steps`);
  }
  if (item.dueOn)
    parts.push(
      `${item.kind === "goal" ? "by" : "due"} ${dueLabel(item.dueOn, today, item.kind === "goal" ? null : item.dueTime).text}`,
    );
  if (item.status === "done") parts.push("done");
  if (item.status === "wont") parts.push("won't do");
  return parts.join(" · ") || "No date";
}

/** Change the title and schedule. Habits change how often; to-dos and goals change their day. */
function EditItem(props: { item: Item; onCancel: () => void; apply: (change: Change) => void }) {
  const { item } = props;
  const [title, setTitle] = useState(item.title);
  const [schedule, setSchedule] = useState<Schedule>({
    dueOn: item.dueOn,
    dueTime: item.dueTime,
    timesPerWeek: item.timesPerWeek,
    deadline: item.kind === "goal",
  });
  const save = () => {
    const trimmed = title.trim();
    if (!trimmed) return;
    props.apply({
      type: "item.edit",
      payload:
        item.kind === "habit"
          ? { itemId: item.id, title: trimmed, timesPerWeek: schedule.timesPerWeek ?? item.timesPerWeek ?? 1 }
          : {
              itemId: item.id,
              title: trimmed,
              dueOn: schedule.dueOn,
              dueTime: item.kind === "goal" || !schedule.dueOn ? null : schedule.dueTime,
            },
    });
  };
  return (
    <View style={{ gap: space.lg }}>
      <TextInput
        value={title}
        onChangeText={setTitle}
        onSubmitEditing={save}
        accessibilityLabel="Title"
        style={{
          fontSize: 17,
          color: colors.ink,
          borderWidth: 1,
          borderColor: colors.line,
          borderRadius: radius.control,
          paddingHorizontal: space.md,
          paddingVertical: 12,
          outlineColor: colors.royal,
        }}
      />
      <SchedulePanel
        mode={item.kind === "habit" ? "repeat" : "date"}
        deadlineOnly={item.kind === "goal"}
        value={schedule}
        onChange={setSchedule}
      />
      <View style={{ flexDirection: "row", gap: space.sm }}>
        <View style={{ flex: 1 }}>
          <Button label="Cancel" kind="secondary" onPress={props.onCancel} />
        </View>
        <View style={{ flex: 1 }}>
          <Button label="Save" onPress={save} disabled={!title.trim()} />
        </View>
      </View>
    </View>
  );
}
