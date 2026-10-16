import { DurableObject } from "cloudflare:workers";
import { InboxClientMessage, type InboxMessage, type ReadPositions } from "@buildpair/protocol";
import type { Env } from "./env";
import { closeQuietly, USER_HEADER } from "./space-room";

/** Read positions kept per person. Past this, new spaces aren't saved (old ones still move on). */
export const MAX_READ_POSITIONS = 2000;

/**
 * One instance per person. Each of their devices keeps one hibernatable socket here; spaces poke it
 * when they have news, so a device knows which spaces to sync without holding a socket per space.
 * It also keeps how far they've read each space, so reading on one device clears the dot on the others.
 * Later: push tokens, the Activity inbox and the personal reminder agenda.
 */
export class UserHub extends DurableObject<Env> {
  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    ctx.storage.sql.exec(
      "CREATE TABLE IF NOT EXISTS reads (space_id TEXT PRIMARY KEY, seq INTEGER NOT NULL)",
    );
  }

  override async fetch(request: Request): Promise<Response> {
    if (request.headers.get("upgrade") !== "websocket")
      return new Response("Expected a WebSocket", { status: 426 });
    if (!request.headers.get(USER_HEADER)) return new Response("Unauthorized", { status: 401 });
    const { 0: client, 1: server } = new WebSocketPair();
    this.ctx.acceptWebSocket(server);
    return new Response(null, { status: 101, webSocket: client });
  }

  async poke(spaceId: string, seq: number): Promise<void> {
    this.sendAll({ t: "poke", spaceId, seq });
  }

  /** The account is being deleted: forget everything here and close its devices' sockets. */
  async erase(): Promise<void> {
    for (const ws of this.ctx.getWebSockets()) closeQuietly(ws, 1000, "Account deleted");
    this.ctx.storage.sql.exec("DELETE FROM reads");
  }

  override async webSocketMessage(ws: WebSocket, data: string | ArrayBuffer): Promise<void> {
    if (typeof data !== "string" || data.length > 20_000) return;
    let raw: unknown;
    try {
      raw = JSON.parse(data);
    } catch {
      return;
    }
    const msg = InboxClientMessage.safeParse(raw);
    if (!msg.success) return;
    const moved = this.saveReads(msg.data.reads);
    if (Object.keys(moved).length) this.sendAll({ t: "reads", reads: moved }, ws);
    if (msg.data.all) this.send(ws, { t: "reads", reads: this.allReads(), all: true });
  }

  override async webSocketClose(ws: WebSocket, code: number, reason: string): Promise<void> {
    closeQuietly(ws, code, reason);
  }

  /** Positions only move forward. Returns the ones that did. */
  private saveReads(reads: ReadPositions): ReadPositions {
    const sql = this.ctx.storage.sql;
    let count = sql.exec<{ n: number }>("SELECT count(*) AS n FROM reads").one().n;
    const moved: ReadPositions = {};
    for (const [spaceId, seq] of Object.entries(reads)) {
      const had = sql.exec<{ seq: number }>("SELECT seq FROM reads WHERE space_id = ?", spaceId).toArray()[0];
      if (had && had.seq >= seq) continue;
      if (!had && count >= MAX_READ_POSITIONS) continue;
      if (!had) count++;
      sql.exec("INSERT OR REPLACE INTO reads (space_id, seq) VALUES (?, ?)", spaceId, seq);
      moved[spaceId] = seq;
    }
    return moved;
  }

  private allReads(): ReadPositions {
    const rows = this.ctx.storage.sql
      .exec<{ space_id: string; seq: number }>("SELECT * FROM reads")
      .toArray();
    return Object.fromEntries(rows.map((r) => [r.space_id, r.seq]));
  }

  private send(ws: WebSocket, msg: InboxMessage) {
    try {
      ws.send(JSON.stringify(msg));
    } catch {
      // Closed socket; the device catches up when it reconnects.
    }
  }

  private sendAll(msg: InboxMessage, except?: WebSocket) {
    for (const ws of this.ctx.getWebSockets()) if (ws !== except) this.send(ws, msg);
  }
}
