import { z } from "zod";

/** Client-generated ULID (26 Crockford base32 chars). Doubles as the idempotency key for commands. */
export const Ulid = z.string().regex(/^[0-9A-HJKMNP-TV-Z]{26}$/, "expected a ULID");
export type Ulid = z.infer<typeof Ulid>;

export const UserId = z.string().min(1).max(64);
export type UserId = z.infer<typeof UserId>;

export const SpaceId = z.string().min(1).max(64);
export type SpaceId = z.infer<typeof SpaceId>;

/** ISO-8601 timestamp in UTC. */
export const Timestamp = z.iso.datetime();

/** Calendar day in the user's own time zone, YYYY-MM-DD. */
export const LocalDate = z.iso.date();

/** Time of day in the user's own time zone, HH:MM (24-hour). */
export const TimeOfDay = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "expected HH:MM");
