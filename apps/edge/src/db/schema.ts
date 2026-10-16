import { index, integer, primaryKey, sqliteTable, text } from "drizzle-orm/sqlite-core";

// --- Better Auth tables (field names must match Better Auth's model) ---

export const user = sqliteTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: integer("email_verified", { mode: "boolean" }).notNull().default(false),
  image: text("image"),
  /** Profile: what they're building, in their words. */
  building: text("building"),
  /** Profile: IANA time zone, e.g. "America/Chicago". */
  timeZone: text("time_zone"),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
});

export const session = sqliteTable(
  "session",
  {
    id: text("id").primaryKey(),
    expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
    token: text("token").notNull().unique(),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
  },
  (t) => [index("session_user_idx").on(t.userId)],
);

export const account = sqliteTable(
  "account",
  {
    id: text("id").primaryKey(),
    accountId: text("account_id").notNull(),
    providerId: text("provider_id").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    idToken: text("id_token"),
    accessTokenExpiresAt: integer("access_token_expires_at", { mode: "timestamp_ms" }),
    refreshTokenExpiresAt: integer("refresh_token_expires_at", { mode: "timestamp_ms" }),
    scope: text("scope"),
    password: text("password"),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
  },
  (t) => [index("account_user_idx").on(t.userId)],
);

export const verification = sqliteTable(
  "verification",
  {
    id: text("id").primaryKey(),
    identifier: text("identifier").notNull(),
    value: text("value").notNull(),
    expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
  },
  (t) => [index("verification_identifier_idx").on(t.identifier)],
);

// --- Global index of spaces. Each space's own data lives in its SpaceRoom Durable Object. ---

export const spaces = sqliteTable("spaces", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  purpose: text("purpose").notNull(),
  /** Picked by the owner (a SpaceColor name); null means the automatic color. */
  color: text("color"),
  ownerId: text("owner_id")
    .notNull()
    .references(() => user.id),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
});

export const memberships = sqliteTable(
  "memberships",
  {
    spaceId: text("space_id")
      .notNull()
      .references(() => spaces.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    role: text("role", { enum: ["owner", "supporter"] }).notNull(),
    joinedAt: integer("joined_at", { mode: "timestamp_ms" }).notNull(),
  },
  (t) => [primaryKey({ columns: [t.spaceId, t.userId] }), index("memberships_user_idx").on(t.userId)],
);

export const invites = sqliteTable("invites", {
  token: text("token").primaryKey(),
  spaceId: text("space_id")
    .notNull()
    .references(() => spaces.id, { onDelete: "cascade" }),
  createdBy: text("created_by")
    .notNull()
    .references(() => user.id),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
});

/** People who opened an invite link and asked to join. The space's owner approves or declines each one. */
export const joinRequests = sqliteTable(
  "join_requests",
  {
    spaceId: text("space_id")
      .notNull()
      .references(() => spaces.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    /** What they said when offering support from Discover. Invite-link requests have none. */
    note: text("note"),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  },
  (t) => [primaryKey({ columns: [t.spaceId, t.userId] })],
);

/** Accounts being deleted right now. Written first, so a join approved at the same moment can tell and undo itself. */
export const accountErasures = sqliteTable("account_erasures", {
  userId: text("user_id")
    .primaryKey()
    .references(() => user.id, { onDelete: "cascade" }),
  startedAt: integer("started_at", { mode: "timestamp_ms" }).notNull(),
});

/** People someone has blocked: their messages and reactions are hidden from the blocker, and their join requests are dropped. */
export const blocks = sqliteTable(
  "blocks",
  {
    blockerId: text("blocker_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    blockedId: text("blocked_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  },
  (t) => [primaryKey({ columns: [t.blockerId, t.blockedId] })],
);

/** Reports of a person or one of their messages, for review. Go when either account is deleted. */
export const reports = sqliteTable("reports", {
  id: text("id").primaryKey(),
  reporterId: text("reporter_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  targetId: text("target_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  spaceId: text("space_id").notNull(),
  messageId: text("message_id"),
  /** The reported message as it was, so it can be reviewed even if it changes. */
  body: text("body"),
  reason: text("reason", { enum: ["spam", "harassment", "inappropriate", "other"] }).notNull(),
  note: text("note"),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
});

/** Spaces someone left or was removed from. Deleting their account still reaches those rooms. */
export const pastMemberships = sqliteTable(
  "past_memberships",
  {
    spaceId: text("space_id")
      .notNull()
      .references(() => spaces.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    leftAt: integer("left_at", { mode: "timestamp_ms" }).notNull(),
  },
  (t) => [primaryKey({ columns: [t.spaceId, t.userId] })],
);

/**
 * Spaces their owner chose to show on Discover, as strangers see them: the name, what it's for, the owner's
 * first name, shared open goals and habits (never private ones), and how many people are in it. The room
 * keeps this in step with the space; turning Discover off deletes the row.
 */
export const listings = sqliteTable(
  "listings",
  {
    spaceId: text("space_id")
      .primaryKey()
      .references(() => spaces.id, { onDelete: "cascade" }),
    ownerId: text("owner_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    purpose: text("purpose").notNull(),
    ownerName: text("owner_name").notNull(),
    /** JSON array of { title, kind } for up to five shared open goals and habits. */
    goals: text("goals").notNull(),
    people: integer("people").notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
  },
  (t) => [index("listings_updated_idx").on(t.updatedAt)],
);
