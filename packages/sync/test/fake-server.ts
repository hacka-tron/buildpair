import { applyEvents, canSee, decide, emptySpace, type SpaceState, sequence } from "@buildpair/domain";
import { ClientMessage, type ServerMessage, type SpaceEvent } from "@buildpair/protocol";
import type { Connection, ConnectionHandlers, Transport } from "../src";

/** A stand-in for the SpaceRoom Durable Object: same rules, in memory, with controllable networking. */
export class FakeRoom {
  state: SpaceState = emptySpace();
  log: SpaceEvent[] = [];
  seenCommands = new Map<string, number>();
  sockets = new Set<FakeSocket>();

  constructor(members: string[]) {
    const at = "2026-10-10T09:00:00.000Z";
    this.commit([
      {
        type: "space.created",
        actorId: members[0]!,
        commandId: null,
        at,
        payload: { name: "Life", purpose: "Family" },
      },
      ...members.map((userId, i) => ({
        type: "member.joined" as const,
        actorId: userId,
        commandId: null,
        at,
        payload: {
          member: { userId, role: i === 0 ? ("owner" as const) : ("supporter" as const), name: userId },
        },
      })),
    ]);
  }

  commit(unsequenced: Parameters<typeof sequence>[0]) {
    const events = sequence(unsequenced, this.state.seq);
    this.log.push(...events);
    this.state = applyEvents(this.state, events);
    return events;
  }

  receive(socket: FakeSocket, raw: unknown) {
    const msg = ClientMessage.parse(raw);
    if (msg.t === "hello") {
      socket.deliver({
        t: "events",
        after: msg.afterSeq,
        upTo: this.state.seq,
        events: this.log.filter((e) => e.seq > msg.afterSeq && canSee(this.state, socket.userId, e)),
      });
      return;
    }
    if (msg.t === "cmd") {
      const seen = this.seenCommands.get(msg.cmd.id);
      if (seen !== undefined) return socket.deliver({ t: "ack", id: msg.cmd.id, seq: seen });
      const d = decide(this.state, msg.cmd, socket.userId);
      if (!d.ok) return socket.deliver({ t: "reject", id: msg.cmd.id, reason: d.reason });
      const events = this.commit(d.events);
      this.seenCommands.set(msg.cmd.id, this.state.seq);
      const after = (events[0]?.seq ?? this.state.seq + 1) - 1;
      if (events.length) {
        for (const s of this.sockets) {
          s.deliver({
            t: "events",
            after,
            upTo: this.state.seq,
            events: events.filter((e) => canSee(this.state, s.userId, e)),
          });
        }
      }
      socket.deliver({ t: "ack", id: msg.cmd.id, seq: this.state.seq });
    }
  }
}

export class FakeSocket implements Connection {
  open = false;
  /** Drop the next N server messages (simulates lost packets before a reconnect). */
  dropNext = 0;
  constructor(
    readonly room: FakeRoom,
    readonly userId: string,
    readonly handlers: ConnectionHandlers,
  ) {}
  deliver(msg: ServerMessage) {
    if (!this.open) return;
    if (this.dropNext > 0) {
      this.dropNext--;
      return;
    }
    queueMicrotask(() => this.open && this.handlers.onMessage(structuredClone(msg)));
  }
  send(msg: unknown) {
    if (!this.open) return;
    const copy = structuredClone(msg);
    queueMicrotask(() => this.open && this.room.receive(this, copy));
  }
  close() {
    this.open = false;
    this.room.sockets.delete(this);
    this.handlers.onClose();
  }
}

/** Connects to a FakeRoom; `online` controls whether connections open. */
export class FakeTransport implements Transport {
  online = true;
  socket: FakeSocket | null = null;
  private handlers: ConnectionHandlers | null = null;
  constructor(
    readonly room: FakeRoom,
    readonly userId: string,
  ) {}
  connect(_spaceId: string, handlers: ConnectionHandlers): Connection {
    this.handlers = handlers;
    this.socket = new FakeSocket(this.room, this.userId, handlers);
    if (this.online) this.openSocket();
    return {
      send: (m) => this.socket?.send(m),
      close: () => this.socket?.close(),
    };
  }
  private openSocket() {
    if (!this.socket || !this.handlers) return;
    this.socket.open = true;
    this.room.sockets.add(this.socket);
    queueMicrotask(() => this.handlers!.onOpen());
  }
  goOffline() {
    this.online = false;
    this.socket?.close();
  }
  goOnline() {
    this.online = true;
    if (this.handlers) {
      this.socket = new FakeSocket(this.room, this.userId, this.handlers);
      this.openSocket();
    }
  }
}

export const settle = async () => {
  for (let i = 0; i < 20; i++) await new Promise((r) => setTimeout(r, 0));
};
