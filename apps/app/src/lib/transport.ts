import {
  type ClientMessage,
  InboxMessage,
  parseServerMessage,
  type ServerMessage,
  type SpaceEvent,
} from "@buildpair/protocol";
import type { Connection, ConnectionHandlers, Transport } from "@buildpair/sync";
import { WebSocket as ReconnectingWebSocket } from "partysocket";
import { ApiError, api } from "./api";
import { API_URL } from "./config";
import { markSpaceGone } from "./spaces";

const wsBase = API_URL.replace(/^http/, "ws");
/** Spaces on screen right now. Only these hold a live socket (presence, typing); others sync over HTTPS. */
const live = new Set<string>();
const connections = new Map<string, Set<SpaceConnection>>();
const RETRY_MS = 5_000;

/** Show a space live (its screen opened) or let it go back to quiet syncing (closed). */
export function setLive(spaceId: string, on: boolean) {
  if (on) live.add(spaceId);
  else live.delete(spaceId);
  for (const c of connections.get(spaceId) ?? []) c.update();
}

/**
 * One space's connection. While the space is on screen it's a WebSocket to its room (each (re)connect
 * fetches a fresh 60-second ticket; partysocket handles backoff). Otherwise it talks HTTPS: catch-up is a
 * GET of the events since the cursor and each change is a POST, sent one at a time in order.
 */
class SpaceConnection implements Connection {
  private ws: ReconnectingWebSocket | null = null;
  private httpOpen = false;
  private queue: Promise<void> = Promise.resolve();
  private retry: ReturnType<typeof setTimeout> | null = null;
  private closed = false;
  /** Bumped whenever the HTTPS session ends, so steps queued in an older one don't run. */
  private generation = 0;

  constructor(
    private readonly spaceId: string,
    private readonly handlers: ConnectionHandlers,
  ) {
    this.update();
  }

  update() {
    if (this.closed) return;
    if (live.has(this.spaceId)) {
      if (this.ws) return;
      if (this.httpOpen) {
        // Not connected until the socket opens; SpaceSync resends what's waiting then.
        this.endHttp();
        this.handlers.onClose();
      }
      this.openSocket();
    } else {
      if (this.ws) this.closeSocket();
      if (!this.httpOpen) this.openHttp();
    }
  }

  send(msg: ClientMessage) {
    if (this.ws) {
      if (this.ws.readyState === this.ws.OPEN) this.ws.send(JSON.stringify(msg));
      return;
    }
    if (!this.httpOpen) return;
    // In order: a step can't be ticked before the goal it belongs to exists.
    const generation = this.generation;
    this.queue = this.queue
      .then(() => (generation === this.generation ? this.http(msg) : undefined))
      .catch(() => this.lost());
  }

  close() {
    this.closed = true;
    if (this.retry) clearTimeout(this.retry);
    this.closeSocket();
    this.endHttp();
    const set = connections.get(this.spaceId);
    set?.delete(this);
    if (set?.size === 0) connections.delete(this.spaceId);
  }

  private deliver(msg: ServerMessage) {
    if (!this.closed) this.handlers.onMessage(msg);
  }

  private gone() {
    this.close();
    markSpaceGone(this.spaceId);
  }

  private openSocket() {
    const url = async () => {
      const { ticket } = await api<{ ticket: string }>(`/spaces/${this.spaceId}/ticket`, {
        method: "POST",
      }).catch((e: unknown) => {
        // The space was deleted, or you're no longer in it. Stop trying and take it off the list.
        if (e instanceof ApiError && e.status === 404) this.gone();
        throw e;
      });
      return `${wsBase}/spaces/${this.spaceId}/ws?ticket=${encodeURIComponent(ticket)}`;
    };
    const ws = new ReconnectingWebSocket(url, [], {
      maxReconnectionDelay: 10_000,
      minReconnectionDelay: 500,
    });
    ws.addEventListener("open", () => this.ws === ws && this.handlers.onOpen());
    ws.addEventListener("close", () => this.ws === ws && this.handlers.onClose());
    ws.addEventListener("message", (e: MessageEvent) => {
      if (this.ws !== ws) return;
      const parsed = parseServerMessage(JSON.parse(String(e.data)));
      if (parsed) this.deliver(parsed);
    });
    this.ws = ws;
  }

  private closeSocket() {
    const ws = this.ws;
    this.ws = null;
    if (!ws) return;
    ws.close();
    this.handlers.onClose();
  }

  private openHttp() {
    this.httpOpen = true;
    // "Open" at once; SpaceSync then sends hello and anything waiting.
    queueMicrotask(() => this.httpOpen && !this.closed && this.handlers.onOpen());
  }

  private endHttp() {
    this.httpOpen = false;
    this.generation++;
    this.queue = Promise.resolve();
  }

  /**
   * A request didn't get through (offline, or the server failed): stop here so nothing after it goes out
   * of order, look offline, and try again in a little while. Reopening resends everything waiting.
   */
  private lost() {
    if (!this.httpOpen) return;
    this.endHttp();
    this.handlers.onClose();
    if (this.retry) clearTimeout(this.retry);
    this.retry = setTimeout(() => {
      this.retry = null;
      if (!this.closed && !this.ws) this.openHttp();
    }, RETRY_MS);
  }

  private async http(msg: ClientMessage) {
    if (!this.httpOpen) return;
    try {
      if (msg.t === "hello") {
        let after = msg.afterSeq;
        for (let i = 0; i < 50; i++) {
          const batch = await api<{ after: number; upTo: number; more?: boolean; events: SpaceEvent[] }>(
            `/spaces/${this.spaceId}/events?after=${after}`,
          );
          this.deliver({ t: "events", after: batch.after, upTo: batch.upTo, events: batch.events });
          if (!batch.more) break;
          after = batch.upTo;
        }
      } else if (msg.t === "cmd") {
        const { results } = await api<{
          results: ({ ok: true; seq: number } | { ok: false; reason: string })[];
        }>(`/spaces/${this.spaceId}/commands`, { method: "POST", body: { commands: [msg.cmd] } });
        const r = results[0];
        if (r?.ok) this.deliver({ t: "ack", id: msg.cmd.id, seq: r.seq });
        else if (r) this.deliver({ t: "reject", id: msg.cmd.id, reason: r.reason });
      }
      // Typing only matters to people looking at the space, which needs the live socket.
    } catch (e) {
      if (e instanceof ApiError && e.status === 404) return this.gone();
      if (e instanceof ApiError && e.status === 429 && msg.t === "cmd")
        return this.deliver({ t: "busy", id: msg.cmd.id, reason: e.message });
      // A change the server can't read won't get better by resending it.
      if (e instanceof ApiError && e.status === 400 && msg.t === "cmd")
        return this.deliver({ t: "reject", id: msg.cmd.id, reason: e.message });
      // Signed out: nothing to do until they sign in again.
      if (e instanceof ApiError && e.status === 401) return;
      throw e;
    }
  }
}

export const spaceTransport: Transport = {
  connect(spaceId: string, handlers: ConnectionHandlers): Connection {
    const c = new SpaceConnection(spaceId, handlers);
    const set = connections.get(spaceId) ?? new Set();
    set.add(c);
    connections.set(spaceId, set);
    return c;
  },
};

/**
 * The person's inbox: one socket per device. Spaces poke it when they have news; `onPoke` then catches
 * that space up. `onOpen` runs on every (re)connect, since pokes may have been missed while away.
 */
export function connectInbox(handlers: {
  onPoke: (spaceId: string, seq: number) => void;
  onOpen: () => void;
}) {
  const url = async () => {
    const { ticket } = await api<{ ticket: string }>("/me/ticket", { method: "POST" });
    return `${wsBase}/me/ws?ticket=${encodeURIComponent(ticket)}`;
  };
  const ws = new ReconnectingWebSocket(url, [], {
    maxReconnectionDelay: 30_000,
    minReconnectionDelay: 1_000,
  });
  ws.addEventListener("open", () => handlers.onOpen());
  ws.addEventListener("message", (e: MessageEvent) => {
    const parsed = InboxMessage.safeParse(JSON.parse(String(e.data)));
    if (parsed.success && parsed.data.t === "poke") handlers.onPoke(parsed.data.spaceId, parsed.data.seq);
  });
  return () => ws.close();
}
