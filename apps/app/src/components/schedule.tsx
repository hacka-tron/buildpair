import { parseTime } from "@buildpair/domain";
import { useState } from "react";
import { Pressable, Text, TextInput, View } from "react-native";
import { daysBetween, dueLabel, localToday, timeLabel } from "../lib/format";
import { colors, radius, space } from "../lib/theme";
import { Chip, ChipRow, Icon } from "./kit";

/** When something is due or how often it repeats. A repeat makes a habit; a deadline makes a goal. */
export interface Schedule {
  dueOn: string | null;
  dueTime: string | null;
  timesPerWeek: number | null;
  deadline: boolean;
}

export const NO_SCHEDULE: Schedule = { dueOn: null, dueTime: null, timesPerWeek: null, deadline: false };

export const kindOf = (s: Schedule) => (s.timesPerWeek ? "habit" : s.deadline ? "goal" : "todo");

/** "Fri 3:00 PM", "4 times a week", "Every day", "By Nov 21", "No date". */
export function scheduleLabel(s: Schedule, today: string): string {
  if (s.timesPerWeek) return s.timesPerWeek === 7 ? "Every day" : `${s.timesPerWeek} times a week`;
  if (!s.dueOn) return s.deadline ? "No deadline" : "No date";
  const day = dueLabel(s.dueOn, today, s.deadline ? null : s.dueTime).text;
  return s.deadline ? `By ${day}` : day;
}

const plusDays = (today: string, n: number) => {
  const d = new Date(`${today}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
const nextMonday = (today: string) => {
  const dow = new Date(`${today}T00:00:00Z`).getUTCDay();
  return plusDays(today, (8 - dow) % 7 || 7);
};
const TIMES = ["09:00", "12:00", "15:00", "18:00", "20:00"];
const WEEKDAYS = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"];

/**
 * Pick a day (quick picks or a month calendar), an optional time, or a repeat. `mode` limits it:
 * "any" for new items, "date" for to-dos and goals being edited, "repeat" for habits being edited.
 */
export function SchedulePanel(props: {
  value: Schedule;
  onChange: (next: Schedule) => void;
  mode: "any" | "date" | "repeat";
  /** Goals being edited: the date is a deadline and takes no time. */
  deadlineOnly?: boolean;
}) {
  const today = localToday();
  const { value, onChange, mode } = props;
  const [tab, setTab] = useState<"date" | "repeat">(
    mode === "repeat" || value.timesPerWeek ? "repeat" : "date",
  );
  const [month, setMonth] = useState(() => (value.dueOn ?? today).slice(0, 7));
  const [typed, setTyped] = useState("");
  const set = (patch: Partial<Schedule>) => onChange({ ...value, ...patch });
  const pickDay = (dueOn: string | null) =>
    set({ dueOn, timesPerWeek: null, dueTime: dueOn ? value.dueTime : null });
  const showTime = !value.deadline && !props.deadlineOnly && Boolean(value.dueOn);

  return (
    <View style={{ gap: space.md }}>
      {mode === "any" ? (
        <View style={{ flexDirection: "row", gap: space.sm }}>
          <Chip on={tab === "date"} onPress={() => setTab("date")}>
            Date
          </Chip>
          <Chip on={tab === "repeat"} onPress={() => setTab("repeat")}>
            Repeat
          </Chip>
        </View>
      ) : null}

      {tab === "date" ? (
        <>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.sm }}>
            <Chip on={value.dueOn === today && !value.timesPerWeek} onPress={() => pickDay(today)}>
              Today
            </Chip>
            <Chip on={value.dueOn === plusDays(today, 1)} onPress={() => pickDay(plusDays(today, 1))}>
              Tomorrow
            </Chip>
            <Chip on={value.dueOn === nextMonday(today)} onPress={() => pickDay(nextMonday(today))}>
              Next week
            </Chip>
            <Chip on={!value.dueOn && !value.timesPerWeek} onPress={() => pickDay(null)}>
              {props.deadlineOnly || value.deadline ? "No deadline" : "No date"}
            </Chip>
          </View>
          <Calendar month={month} setMonth={setMonth} today={today} selected={value.dueOn} onPick={pickDay} />
          {showTime ? (
            <ChipRow label="Time">
              <Chip on={!value.dueTime} onPress={() => set({ dueTime: null })}>
                No time
              </Chip>
              {TIMES.map((t) => (
                <Chip key={t} on={value.dueTime === t} onPress={() => set({ dueTime: t })}>
                  {timeLabel(t)}
                </Chip>
              ))}
              <TextInput
                value={typed}
                onChangeText={(t) => {
                  setTyped(t);
                  const parsed = parseTime(t);
                  if (parsed) set({ dueTime: parsed });
                }}
                placeholder="Other, e.g. 4:30pm"
                placeholderTextColor={colors.faint}
                accessibilityLabel="Other time"
                style={{
                  borderWidth: 1,
                  borderColor: typed && !parseTime(typed) ? colors.danger : colors.line,
                  borderRadius: 999,
                  paddingHorizontal: 12,
                  paddingVertical: 7,
                  // 16px keeps iOS from zooming in on focus.
                  fontSize: 16,
                  minWidth: 150,
                  color: colors.ink,
                  outlineColor: colors.royal,
                }}
              />
            </ChipRow>
          ) : null}
          {mode === "any" ? (
            <Pressable
              onPress={() => set({ deadline: !value.deadline, dueTime: null })}
              accessibilityRole="switch"
              accessibilityState={{ checked: value.deadline }}
              style={{ flexDirection: "row", alignItems: "center", gap: space.sm }}
            >
              <View
                style={{
                  width: 20,
                  height: 20,
                  borderRadius: 5,
                  borderWidth: value.deadline ? 0 : 1.5,
                  borderColor: colors.control,
                  backgroundColor: value.deadline ? colors.blue : "transparent",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                {value.deadline ? <Icon name="check" size={13} color="#fff" /> : null}
              </View>
              <Text style={{ fontSize: 14, color: colors.ink }}>
                It's a goal with a deadline <Text style={{ color: colors.faint }}>(you can add steps)</Text>
              </Text>
            </Pressable>
          ) : null}
        </>
      ) : (
        <ChipRow label="How often">
          {mode === "any" ? (
            <Chip on={!value.timesPerWeek} onPress={() => set({ timesPerWeek: null })}>
              Doesn't repeat
            </Chip>
          ) : null}
          {[1, 2, 3, 4, 5, 6, 7].map((n) => (
            <Chip
              key={n}
              on={value.timesPerWeek === n}
              onPress={() => onChange({ dueOn: null, dueTime: null, deadline: false, timesPerWeek: n })}
            >
              {n === 7 ? "Every day" : `${n}× a week`}
            </Chip>
          ))}
        </ChipRow>
      )}
    </View>
  );
}

function Calendar(props: {
  month: string;
  setMonth: (m: string) => void;
  today: string;
  selected: string | null;
  onPick: (day: string) => void;
}) {
  const [y, m] = props.month.split("-").map(Number) as [number, number];
  const first = new Date(Date.UTC(y, m - 1, 1));
  const days = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const lead = (first.getUTCDay() + 6) % 7; // Monday first
  const cells = Array.from({ length: days }, (_, i) => `${props.month}-${String(i + 1).padStart(2, "0")}`);
  const shift = (n: number) => {
    const d = new Date(Date.UTC(y, m - 1 + n, 1));
    props.setMonth(d.toISOString().slice(0, 7));
  };
  const title = first.toLocaleDateString(undefined, { month: "long", year: "numeric", timeZone: "UTC" });
  return (
    <View
      style={{
        borderWidth: 1,
        borderColor: colors.line,
        borderRadius: radius.card,
        padding: space.md,
        gap: 6,
      }}
    >
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
        <Pressable
          onPress={() => shift(-1)}
          accessibilityLabel="Previous month"
          hitSlop={8}
          style={{ padding: 4 }}
        >
          <Icon name="chevron-left" size={18} color={colors.sub} />
        </Pressable>
        <Text style={{ fontSize: 14, fontWeight: "700", color: colors.ink }}>{title}</Text>
        <Pressable
          onPress={() => shift(1)}
          accessibilityLabel="Next month"
          hitSlop={8}
          style={{ padding: 4 }}
        >
          <Icon name="chevron-right" size={18} color={colors.sub} />
        </Pressable>
      </View>
      <View style={{ flexDirection: "row" }}>
        {WEEKDAYS.map((d) => (
          <Text key={d} style={{ flex: 1, textAlign: "center", fontSize: 11, color: colors.faint }}>
            {d}
          </Text>
        ))}
      </View>
      <View style={{ flexDirection: "row", flexWrap: "wrap" }}>
        {lead ? <View style={{ width: `${(100 / 7) * lead}%`, height: 34 }} /> : null}
        {cells.map((day) => {
          const past = daysBetween(props.today, day) < 0;
          const on = day === props.selected;
          const isToday = day === props.today;
          return (
            <Pressable
              key={day}
              onPress={() => props.onPick(day)}
              disabled={past}
              accessibilityRole="button"
              accessibilityLabel={new Date(`${day}T12:00:00Z`).toLocaleDateString(undefined, {
                weekday: "long",
                month: "long",
                day: "numeric",
                timeZone: "UTC",
              })}
              accessibilityState={{ selected: on, disabled: past }}
              style={{ width: `${100 / 7}%`, height: 34, alignItems: "center", justifyContent: "center" }}
            >
              <View
                style={{
                  width: 30,
                  height: 30,
                  borderRadius: 15,
                  alignItems: "center",
                  justifyContent: "center",
                  backgroundColor: on ? colors.blue : "transparent",
                  borderWidth: isToday && !on ? 1 : 0,
                  borderColor: colors.royal,
                }}
              >
                <Text
                  style={{
                    fontSize: 13,
                    fontWeight: on || isToday ? "700" : "400",
                    color: on ? "#fff" : past ? colors.faint : colors.ink,
                  }}
                >
                  {Number(day.slice(8))}
                </Text>
              </View>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}
