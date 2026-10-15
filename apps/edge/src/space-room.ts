import { DurableObject } from "cloudflare:workers";
import { applyEvents, canSee, decide, emptySpace, type SpaceState, sequence } from "@buildpair/domain";
import {
  ClientMessage,
  Command,
  type Member,
  PROTOCOL_VERSION,
  type ServerMessage,
  type SpaceEvent,
  type UnsequencedEvent,
} from "@buildpair/protocol";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { spaces } from "./db/schema";
import type { Env } from "./env";

const SCHEMA_VERSION = 1;
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
    sql.exec("INSERT OR REPLACE INTO meta (key, value) VALUES ('schema_version', ?)", String(SCHEMA_VERSION));
  }

  /** Current state, rebuilt from the log after the room wakes up. */
  private load(): SpaceState {
    if (!this.state) {
      const rows = this.ctx.storage.sql
        .exec<{
          seq: number;
          type: string;
          actor_id: string;
          command_id: string | null;
          at: string;
          payload: string;
        }>("SELECT * FROM events ORDER BY seq")
        .toArray();
      this.state = applyEvents(
        emptySpace(),
        rows.map(
          (r) =>
            ({
              seq: r.seq,
              type: r.type,
              actorId: r.actor_id,
              commandId: r.command_id,
              at: r.at,
              payload: JSON.parse(r.payload),
            }) as SpaceEvent,
        ),
      );
    }
    return this.state;
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

  async isMember(userId: string): Promise<boolean> {
    return Boolean(this.load().members[userId]);
  }

  async runCommand(raw: unknown, actorId: string): Promise<CommandResult> {
    const parsed = Command.safeParse(raw);
    if (!parsed.success) return { ok: false, reason: "That change isn't valid." };
    const command = parsed.data;
    // A retried command (same ID) returns its original result instead of applying twice.
    const seen = this.ctx.storage.sql
      .exec<{ seq: number }>("SELECT seq FROM commands WHERE id = ?", command.id)
      .toArray()[0];
    if (seen) return { ok: true, seq: seen.seq };
    const decision = decide(this.load(), command, actorId);
    if (!decision.ok) return decision;
    const events = this.commit(decision.events, command.id);
    this.publish(events);
    for (const e of events) if (e.type === "space.edited") await this.updateIndex(e.payload.changes);
    return { ok: true, seq: this.load().seq };
  }

  /** Everything after `afterSeq` that this person may see. */
  async eventsAfter(
    afterSeq: number,
    userId: string,
  ): Promise<{ after: number; upTo: number; events: SpaceEvent[] } | null> {
    const state = this.load();
    if (!state.members[userId]) return null;
    const rows = this.ctx.storage.sql
      .exec<{
        seq: number;
        type: string;
        actor_id: string;
        command_id: string | null;
        at: string;
        payload: string;
      }>("SELECT * FROM events WHERE seq > ? ORDER BY seq LIMIT ?", afterSeq, MAX_EVENTS_PER_BATCH)
      .toArray();
    const events = rows.map(
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
    const upTo = rows.length === MAX_EVENTS_PER_BATCH ? rows.at(-1)!.seq : state.seq;
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
        if (msg.v > PROTOCOL_VERSION || msg.v < PROTOCOL_VERSION - 1) {
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
