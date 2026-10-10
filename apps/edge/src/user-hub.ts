import { DurableObject } from "cloudflare:workers";
import type { InboxMessage } from "@buildpair/protocol";
import type { Env } from "./env";
import { closeQuietly, USER_HEADER } from "./space-room";

/**
 * One instance per person. Each of their devices keeps one hibernatable socket here; spaces poke it
 * when they have news, so a device knows which spaces to sync without holding a socket per space.
 * Later: unread counts, push tokens, the Activity inbox and the personal reminder agenda.
 */
export class UserHub extends DurableObject<Env> {
  override async fetch(request: Request): Promise<Response> {
    if (request.headers.get("upgrade") !== "websocket")
      return new Response("Expected a WebSocket", { status: 426 });
    if (!request.headers.get(USER_HEADER)) return new Response("Unauthorized", { status: 401 });
    const { 0: client, 1: server } = new WebSocketPair();
    this.ctx.acceptWebSocket(server);
    return new Response(null, { status: 101, webSocket: client });
  }

  async poke(spaceId: string, seq: number): Promise<void> {
    const msg: InboxMessage = { t: "poke", spaceId, seq };
    for (const ws of this.ctx.getWebSockets()) {
      try {
        ws.send(JSON.stringify(msg));
      } catch {
        // Closed socket; the device catches up when it reconnects.
      }
    }
  }

  override async webSocketMessage(): Promise<void> {
    // Clients only listen on this socket.
  }

  override async webSocketClose(ws: WebSocket, code: number, reason: string): Promise<void> {
    closeQuietly(ws, code, reason);
  }
}
