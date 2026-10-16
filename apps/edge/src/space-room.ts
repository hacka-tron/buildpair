import { DurableObject } from "cloudflare:workers";
import {
  applyEvents,
  canSee,
  decide,
  decideArrive,
  decideMoveOut,
  decideRemove,
  emptySpace,
  leavesWith,
  type SpaceState,
  sequence,
  viewFor,
} from "@buildpair/domain";
import {
  ClientMessage,
  Command,
  type Item,
  type Member,
  MIN_PROTOCOL_VERSION,
  PROTOCOL_VERSION,
  type ServerMessage,
  type SpaceEvent,
  type UnsequencedEvent,
} from "@buildpair/protocol";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { spaces } from "./db/schema";
import { type Env, SLOW_DOWN, withinLimit } from "./env";

const SCHEMA_VERSION = 2;
const MAX_EVENTS_PER_BATCH = 500;
/** The Worker sets this after verifying a ticket; Durable Objects are not reachable from the internet directly. */
export const USER_HEADER = "x-buildpair-user";

interface SocketInfo {
  userId: string;
}

/** Echo a close, mapping reserved codes (1005 "no status", 1006 "abnormal") that can't be sent back. */
export function closeQuietly(ws: WebSocket, code: number, reason: string) {
  try {
    ws.close(code === 1005 || code === 1006 ? 1000 : code, reason);
  } catch {
    // Already closed.
  }
}

type VisibilityPayload = Extract<SpaceEvent, { type: "item.visibility" }>["payload"];

/** A shared-again event's copies with one person's items, chat lines and reactions removed. */
export function withoutPerson(p: VisibilityPayload, userId: string): VisibilityPayload {
  const messages = p.messages.filter((m) => m.authorId !== userId);
  const kept = new Set(messages.map((m) => m.id));
  const reactions = Object.fromEntries(
    Object.entries(p.reactions)
      .filter(([messageId]) => kept.has(messageId))
      .map(([messageId, byEmoji]) => [
        messageId,
        Object.fromEntries(
          Object.entries(byEmoji)
            .map(([emoji, users]) => [emoji, users.filter((u) => u !== userId)] as const)
            .filter(([, users]) => users.length > 0),
        ),
      ]),
  );
  return { ...p, items: p.items.filter((i) => i.ownerId !== userId), messages, reactions };
}

export type CommandResult = { ok: true; seq: number } | { ok: false; reason: string };

/**
 * One instance per space. The only writer for the space: every change gets the next sequence
 * number here, so all devices see the same order. Stores the space's event log in its own SQLite
 * database and runs the space's live WebSocket connections (hibernatable, so idle rooms cost nothing).
 *
 * Rules: no in-memory timers (use alarms), so the room can hibernate between messages.
 */
export class SpaceRoom extends DurableObject<Env> {
  private state: SpaceState | null = null;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    ctx.blockConcurrencyWhile(async () => this.migrate());
  }

  private migrate() {
    const sql = this.ctx.storage.sql;
    sql.exec("CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL)");
    const row = sql
      .exec<{ value: string }>("SELECT value FROM meta WHERE key = 'schema_version'")
      .toArray()[0];
    const version = row ? Number(row.value) : 0;
    if (version < 1) {
      sql.exec(`CREATE TABLE IF NOT EXISTS events (
        seq INTEGER PRIMARY KEY,
        type TEXT NOT NULL,
        actor_id TEXT NOT NULL,
        command_id TEXT,
        at TEXT NOT NULL,
        payload TEXT NOT NULL
      )`);
      sql.exec("CREATE TABLE IF NOT EXISTS commands (id TEXT PRIMARY KEY, seq INTEGER NOT NULL)");
    }
    if (version < 2) {
      // Moving items between spaces: copies waiting to be delivered, move IDs used here, and arrivals.
      sql.exec(`CREATE TABLE IF NOT EXISTS outbox (
        move_id TEXT PRIMARY KEY,
        item_id TEXT NOT NULL,
        to_space TEXT NOT NULL,
        actor_id TEXT NOT NULL,
        items TEXT NOT NULL
      )`);
      sql.exec(`CREATE TABLE IF NOT EXISTS moves (
        move_id TEXT PRIMARY KEY,
        item_id TEXT NOT NULL,
        to_space TEXT NOT NULL,
        actor_id TEXT NOT NULL
      )`);
      sql.exec("CREATE TABLE IF NOT EXISTS arrivals (move_id TEXT PRIMARY KEY, key TEXT NOT NULL)");
    }
    sql.exec("INSERT OR REPLACE INTO meta (key, value) VALUES ('schema_version', ?)", String(SCHEMA_VERSION));
  }

  /** Current state, rebuilt from the log after the room wakes up. */
  private load(): SpaceState {
    if (!this.state) {
      this.state = applyEvents(emptySpace(), this.readLog());
    }
    return this.state;
  }

  private readLog(afterSeq = 0, limit = -1): SpaceEvent[] {
    return this.ctx.storage.sql
      .exec<{
        seq: number;
        type: string;
        actor_id: string;
        command_id: string | null;
        at: string;
        payload: string;
      }>("SELECT * FROM events WHERE seq > ? ORDER BY seq LIMIT ?", afterSeq, limit)
      .toArray()
      .map(
        (r) =>
          ({
            seq: r.seq,
            type: r.type,
            actorId: r.actor_id,
            commandId: r.command_id,
            at: r.at,
            payload: JSON.parse(r.payload),
          }) as SpaceEvent,
      );
  }

  private commandSeq(id: string): number | undefined {
    return this.ctx.storage.sql
      .exec<{ seq: number }>("SELECT seq FROM commands WHERE id = ?", id)
      .toArray()[0]?.seq;
  }

  private commit(unsequenced: UnsequencedEvent[], commandId?: string): SpaceEvent[] {
    const current = this.load();
    const events = sequence(unsequenced, current.seq);
    const sql = this.ctx.storage.sql;
    this.ctx.storage.transactionSync(() => {
      for (const e of events) {
        sql.exec(
          "INSERT INTO events (seq, type, actor_id, command_id, at, payload) VALUES (?, ?, ?, ?, ?, ?)",
          e.seq,
          e.type,
          e.actorId,
          e.commandId,
          e.at,
          JSON.stringify(e.payload),
        );
      }
      if (commandId) {
        sql.exec(
          "INSERT INTO commands (id, seq) VALUES (?, ?)",
          commandId,
          events.at(-1)?.seq ?? current.seq,
        );
      }
    });
    this.state = applyEvents(current, events);
    return events;
  }

  private spaceId(): string {
    return (
      this.ctx.storage.sql
        .exec<{ value: string }>("SELECT value FROM meta WHERE key = 'space_id'")
        .toArray()[0]?.value ?? ""
    );
  }

  // --- RPC, called by the API Worker ---

  async init(input: {
    spaceId: string;
    name: string;
    purpose: string;
    owner: { userId: string; name: string };
  }) {
    if (this.load().seq > 0) return;
    this.ctx.storage.sql.exec(
      "INSERT OR REPLACE INTO meta (key, value) VALUES ('space_id', ?)",
      input.spaceId,
    );
    const at = new Date().toISOString();
    const base = { actorId: input.owner.userId, commandId: null, at };
    this.commit([
      { ...base, type: "space.created", payload: { name: input.name, purpose: input.purpose } },
      {
        ...base,
        type: "member.joined",
        payload: { member: { userId: input.owner.userId, role: "owner", name: input.owner.name } },
      },
    ]);
  }

  async addMember(member: Member): Promise<void> {
    if (this.load().members[member.userId]) return;
    const events = this.commit([
      {
        type: "member.joined",
        actorId: member.userId,
        commandId: null,
        at: new Date().toISOString(),
        payload: { member },
      },
    ]);
    this.publish(events);
  }

  /**
   * Someone deleted their account. Records that they left (so open devices drop their things), then
   * deletes every earlier event they made from the log, so nothing of theirs is stored or sent again.
   * Safe to run twice.
   */
  async eraseMember(userId: string): Promise<void> {
    const sql = this.ctx.storage.sql;
    const theirs = sql
      .exec<{ seq: number; command_id: string | null }>(
        "SELECT seq, command_id FROM events WHERE actor_id = ? AND type != 'member.erased'",
        userId,
      )
      .toArray();
    // Their other devices may still be connected. They hear nothing more from this space.
    for (const ws of this.ctx.getWebSockets(userId))
      closeQuietly(ws, 4003, "You're no longer in this space.");
    if (!this.load().members[userId] && theirs.length === 0) return;
    const [left] = this.commit([
      {
        type: "member.erased",
        actorId: userId,
        commandId: null,
        at: new Date().toISOString(),
        payload: { userId },
      },
    ]);
    this.ctx.storage.transactionSync(() => {
      sql.exec("DELETE FROM events WHERE actor_id = ? AND type != 'member.erased'", userId);
      // Copies of their items waiting to move elsewhere go too.
      sql.exec("DELETE FROM outbox WHERE actor_id = ?", userId);
      // Sharing an item copies its chat lines and reactions into someone else's event. Take theirs out too.
      const copies = sql
        .exec<{ seq: number; payload: string }>(
          "SELECT seq, payload FROM events WHERE type = 'item.visibility' AND payload LIKE ?",
          `%${userId}%`,
        )
        .toArray();
      for (const { seq, payload } of copies)
        sql.exec(
          "UPDATE events SET payload = ? WHERE seq = ?",
          JSON.stringify(withoutPerson(JSON.parse(payload), userId)),
          seq,
        );
      // Only their own retry records. Other people's stay, so their retries still get the original answer.
      for (const { command_id } of theirs)
        if (command_id) sql.exec("DELETE FROM commands WHERE id = ?", command_id);
    });
    // Rebuild from the trimmed log, the same way a new device would.
    this.state = null;
    this.publish([left!]);
  }

  /** The owner deleted their account: close every connection and delete everything the space stored. */
  async destroy(): Promise<void> {
    for (const ws of this.ctx.getWebSockets()) closeQuietly(ws, 4004, "This space was deleted.");
    await this.ctx.storage.deleteAll();
    this.state = null;
    // Leave empty tables behind so any late request finds an empty space instead of failing.
    this.migrate();
  }

  /** Someone leaves, or the owner removes them. Their open connections close. */
  async removeMember(
    userId: string,
    actorId: string,
  ): Promise<{ ok: true; removed: boolean } | { ok: false; reason: string }> {
    const d = decideRemove(this.load(), userId, actorId, new Date().toISOString());
    if (!d.ok) return d;
    if (d.events.length === 0) return { ok: true, removed: false };
    const events = this.commit(d.events);
    for (const ws of this.ctx.getWebSockets(userId))
      closeQuietly(ws, 4003, "You're no longer in this space.");
    this.publish(events);
    return { ok: true, removed: true };
  }

  /** Whether `viewerId` (a member) shares this space with `userId`: they're in it, or wrote something the viewer sees. */
  async knows(userId: string, viewerId: string): Promise<boolean> {
    const state = this.load();
    if (!state.members[viewerId]) return false;
    return (
      Boolean(state.members[userId]) || viewFor(state, viewerId).messages.some((m) => m.authorId === userId)
    );
  }

  /** A message as the person reporting it sees it, or null if they can't see it. */
  async messageFor(messageId: string, userId: string): Promise<{ authorId: string; body: string } | null> {
    const state = this.load();
    if (!state.members[userId]) return null;
    const message = viewFor(state, userId).messages.find((m) => m.id === messageId);
    return message ? { authorId: message.authorId, body: message.body } : null;
  }

  async isMember(userId: string): Promise<boolean> {
    return Boolean(this.load().members[userId]);
  }

  async runCommand(raw: unknown, actorId: string): Promise<CommandResult> {
    const parsed = Command.safeParse(raw);
    if (!parsed.success) return { ok: false, reason: "That change isn't valid." };
    const command = parsed.data;
    // A retried command (same ID) returns its original result instead of applying twice.
    const seen = this.commandSeq(command.id);
    if (seen !== undefined) return { ok: true, seq: seen };
    const decision = decide(this.load(), command, actorId);
    if (!decision.ok) return decision;
    const events = this.commit(decision.events, command.id);
    // The list of spaces is updated before anyone hears about the change, so a sidebar that refreshes
    // on the news already sees it.
    for (const e of events) if (e.type === "space.edited") await this.updateIndex(e.payload.changes);
    this.publish(events);
    return { ok: true, seq: this.load().seq };
  }

  // --- Moving an item to another space ---

  /**
   * The item (a goal with its steps) leaves this space for `toSpaceId`. In one step it's taken out, its
   * earlier events are deleted from this log, and a copy waits in the outbox. Nothing can change it in
   * between, and the copy is kept until the other space has it. Delivery is tried at once, then by alarm.
   * Chat lines about a shared item stay; lines about a private one go, with their reactions.
   * Sending the same moveId again only resumes delivery; a moveId used for something else is refused.
   */
  async moveOut(
    moveId: string,
    itemId: string,
    toSpaceId: string,
    actorId: string,
  ): Promise<{ ok: true; delivered: boolean } | { ok: false; reason: string }> {
    const sql = this.ctx.storage.sql;
    const used = sql
      .exec<{ item_id: string; to_space: string; actor_id: string }>(
        "SELECT item_id, to_space, actor_id FROM moves WHERE move_id = ?",
        moveId,
      )
      .toArray()[0];
    if (used) {
      if (used.item_id !== itemId || used.to_space !== toSpaceId || used.actor_id !== actorId)
        return { ok: false, reason: "That move didn't go through. Try again." };
      // The same move sent again: finish delivering it if it hasn't landed yet.
      return { ok: true, delivered: await this.deliver() };
    }
    const d = decideMoveOut(this.load(), itemId, actorId, {
      commandId: moveId,
      at: new Date().toISOString(),
    });
    if (!d.ok) return d;
    const [moved] = this.commit([d.event]);
    const ids = new Set(d.items.map((i) => i.id));
    const log = this.readLog().filter((e) => e.seq < moved!.seq);
    const gone = log.filter((e) => leavesWith(e, ids, d.items[0]!.visibility === "space"));
    const goneLines = new Set(
      gone.flatMap((e) => (e.type === "message.posted" ? [e.payload.message.id] : [])),
    );
    for (const e of log)
      if (e.type === "reaction.toggled" && goneLines.has(e.payload.messageId)) gone.push(e);
    this.ctx.storage.transactionSync(() => {
      for (const e of gone) sql.exec("DELETE FROM events WHERE seq = ?", e.seq);
      sql.exec(
        "INSERT INTO moves (move_id, item_id, to_space, actor_id) VALUES (?, ?, ?, ?)",
        moveId,
        itemId,
        toSpaceId,
        actorId,
      );
      sql.exec(
        "INSERT INTO outbox (move_id, item_id, to_space, actor_id, items) VALUES (?, ?, ?, ?, ?)",
        moveId,
        itemId,
        toSpaceId,
        actorId,
        JSON.stringify(d.items),
      );
    });
    this.state = null;
    this.publish([moved!]);
    return { ok: true, delivered: await this.deliver() };
  }

  /**
   * Items arriving from another space. Each moveId lands once: the same move again is a no-op, and a
   * moveId already used for different items is refused (so the sender takes them back).
   */
  async receiveItems(
    moveId: string,
    fromSpaceId: string,
    items: Item[],
    actorId: string,
  ): Promise<{ ok: true } | { ok: false; reason: string }> {
    const sql = this.ctx.storage.sql;
    const key = `${fromSpaceId}:${items.map((i) => i.id).join(",")}`;
    const seen = sql.exec<{ key: string }>("SELECT key FROM arrivals WHERE move_id = ?", moveId).toArray()[0];
    if (seen) return seen.key === key ? { ok: true } : { ok: false, reason: "This move was already used." };
    const d = decideArrive(this.load(), items, actorId, { commandId: moveId, at: new Date().toISOString() });
    if (!d.ok) return d;
    const events = this.commit(d.events);
    sql.exec("INSERT INTO arrivals (move_id, key) VALUES (?, ?)", moveId, key);
    this.publish(events);
    return { ok: true };
  }

  /**
   * Send waiting moves to their spaces. A space that refuses for good (it was deleted, or the person left)
   * means the items come back here. If a space can't be reached, try again later. True when all landed.
   */
  private async deliver(): Promise<boolean> {
    const sql = this.ctx.storage.sql;
    const rows = sql
      .exec<{ move_id: string; to_space: string; actor_id: string; items: string }>(
        "SELECT move_id, to_space, actor_id, items FROM outbox",
      )
      .toArray();
    let waiting = false;
    for (const row of rows) {
      const items = JSON.parse(row.items) as Item[];
      let result: { ok: true } | { ok: false; reason: string };
      try {
        const there = this.env.SPACE_ROOM.get(this.env.SPACE_ROOM.idFromName(row.to_space));
        result = await there.receiveItems(row.move_id, this.spaceId(), items, row.actor_id);
      } catch {
        waiting = true;
        continue;
      }
      if (!result.ok) this.takeBack(row.actor_id, items);
      sql.exec("DELETE FROM outbox WHERE move_id = ?", row.move_id);
    }
    if (waiting) await this.ctx.storage.setAlarm(Date.now() + 30_000);
    return !waiting;
  }

  /** A move the other space refused: the items return here, unless their owner has left. */
  private takeBack(actorId: string, items: Item[]) {
    const state = this.load();
    if (!state.members[actorId] || items.some((i) => state.items[i.id])) return;
    const events = this.commit([
      { type: "item.arrived", actorId, commandId: null, at: new Date().toISOString(), payload: { items } },
    ]);
    this.publish(events);
  }

  override async alarm(): Promise<void> {
    await this.deliver();
  }

  /** Everything after `afterSeq` that this person may see. */
  async eventsAfter(
    afterSeq: number,
    userId: string,
  ): Promise<{ after: number; upTo: number; events: SpaceEvent[] } | null> {
    const state = this.load();
    if (!state.members[userId]) return null;
    const events = this.readLog(afterSeq, MAX_EVENTS_PER_BATCH);
    const upTo = events.length === MAX_EVENTS_PER_BATCH ? events.at(-1)!.seq : state.seq;
    return { after: afterSeq, upTo, events: events.filter((e) => canSee(state, userId, e)) };
  }

  // --- Live connections ---

  override async fetch(request: Request): Promise<Response> {
    if (request.headers.get("upgrade") !== "websocket")
      return new Response("Expected a WebSocket", { status: 426 });
    const userId = request.headers.get(USER_HEADER);
    if (!userId || !this.load().members[userId])
      return new Response("Not a member of this space", { status: 403 });
    const { 0: client, 1: server } = new WebSocketPair();
    this.ctx.acceptWebSocket(server, [userId]);
    server.serializeAttachment({ userId } satisfies SocketInfo);
    this.broadcastPresence();
    return new Response(null, { status: 101, webSocket: client });
  }

  override async webSocketMessage(ws: WebSocket, data: string | ArrayBuffer): Promise<void> {
    const { userId } = ws.deserializeAttachment() as SocketInfo;
    let msg: ClientMessage;
    try {
      msg = ClientMessage.parse(JSON.parse(typeof data === "string" ? data : new TextDecoder().decode(data)));
    } catch {
      this.send(ws, { t: "error", reason: "Unreadable message." });
      return;
    }
    switch (msg.t) {
      case "hello": {
        if (msg.v > PROTOCOL_VERSION || msg.v < MIN_PROTOCOL_VERSION) {
          this.send(ws, { t: "error", reason: "Please update Buildpair to keep syncing." });
          return;
        }
        let after = msg.afterSeq;
        // Send everything missed, in batches.
        for (;;) {
          const batch = await this.eventsAfter(after, userId);
          if (!batch) return;
          this.send(ws, { t: "events", ...batch });
          if (batch.upTo >= this.load().seq) break;
          after = batch.upTo;
        }
        return;
      }
      case "cmd": {
        // A resent change that already landed costs nothing; reconnecting resends the whole queue.
        const fresh = this.commandSeq(msg.cmd.id) === undefined;
        if (fresh && !(await withinLimit(this.env.WRITE_LIMIT, `write:${userId}`))) {
          this.send(ws, { t: "busy", id: msg.cmd.id, reason: SLOW_DOWN });
          return;
        }
        const result = await this.runCommand(msg.cmd, userId);
        this.send(
          ws,
          result.ok
            ? { t: "ack", id: msg.cmd.id, seq: result.seq }
            : { t: "reject", id: msg.cmd.id, reason: result.reason },
        );
        return;
      }
      case "typing":
        for (const other of this.ctx.getWebSockets()) {
          if (other !== ws) this.send(other, { t: "typing", userId });
        }
        return;
    }
  }

  override async webSocketClose(ws: WebSocket, code: number, reason: string): Promise<void> {
    closeQuietly(ws, code, reason);
    this.broadcastPresence();
  }

  private send(ws: WebSocket, msg: ServerMessage) {
    try {
      ws.send(JSON.stringify(msg));
    } catch {
      // The socket closed between our check and the send; the client will catch up on reconnect.
    }
  }

  private broadcastPresence() {
    const sockets = this.ctx.getWebSockets();
    const online = [...new Set(sockets.map((s) => (s.deserializeAttachment() as SocketInfo).userId))];
    for (const s of sockets) this.send(s, { t: "presence", online });
  }

  /**
   * Keep the global list of spaces (D1) in step with a rename or new color, so sidebars and the
   * Spaces tab show it. The room's log stays the source of truth; a failed write here only leaves
   * the list stale until the next edit.
   */
  private async updateIndex(changes: { name?: string; purpose?: string; color?: string }) {
    try {
      await drizzle(this.env.DB).update(spaces).set(changes).where(eq(spaces.id, this.spaceId()));
    } catch {
      console.error("space index update failed", { spaceId: this.spaceId() });
    }
  }

  /** Send new events to open sockets (filtered per person) and poke each member's inbox. */
  private publish(events: SpaceEvent[]) {
    if (!events.length) return;
    const state = this.load();
    const after = events[0]!.seq - 1;
    for (const ws of this.ctx.getWebSockets()) {
      const { userId } = ws.deserializeAttachment() as SocketInfo;
      if (!state.members[userId]) continue;
      this.send(ws, {
        t: "events",
        after,
        upTo: state.seq,
        events: events.filter((e) => canSee(state, userId, e)),
      });
    }
    const spaceId = this.spaceId();
    const pokes = Object.keys(state.members)
      .filter((userId) => events.some((e) => canSee(state, userId, e)))
      .map((userId) => this.env.USER_HUB.get(this.env.USER_HUB.idFromName(userId)).poke(spaceId, state.seq));
    // Pokes are best-effort: a missed poke only delays catch-up until the next connect.
    this.ctx.waitUntil(Promise.allSettled(pokes));
  }
}
