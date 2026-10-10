import { applyEvents, decide, emptySpace, newId, type SpaceState, sequence } from "@buildpair/domain";
import { Command, type CommandInput, PROTOCOL_VERSION, type ServerMessage } from "@buildpair/protocol";
import type { Connection, PersistedSpace, SpaceStorage, Transport } from "./types";

export type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;
/** A change as the UI describes it; the engine adds the ID and timestamp. */
export type Change = DistributiveOmit<CommandInput, "id" | "at">;

export interface SyncSnapshot {
  /** What the screen should show: confirmed state plus this device's pending changes. */
  view: SpaceState;
  /** IDs of commands not yet confirmed (show these as "sending"). */
  pendingIds: ReadonlySet<string>;
  connected: boolean;
  online: readonly string[];
  /** The last change the server turned down, with its reason. Cleared by `dismissError`. */
  error: { commandId: string; reason: string } | null;
}

/**
 * Keeps one space in sync on a device. Every change updates the screen at once (using the same
 * domain rules as the server), waits in a persisted queue, and is sent whenever a connection is
 * open. Confirmed events arrive in sequence order; a gap triggers a catch-up.
 */
export class SpaceSync {
  private confirmed: SpaceState = emptySpace();
  private pending: Command[] = [];
  private view: SpaceState = emptySpace();
  private connection: Connection | null = null;
  private connected = false;
  private online: string[] = [];
  private error: SyncSnapshot["error"] = null;
  private listeners = new Set<() => void>();
  private snapshot: SyncSnapshot;
  private saving: Promise<void> = Promise.resolve();

  constructor(
    readonly spaceId: string,
    private readonly userId: string,
    private readonly storage: SpaceStorage,
    private readonly transport: Transport,
  ) {
    this.snapshot = this.makeSnapshot();
  }

  /** Load the local copy (instant screens), then connect. */
  async start(): Promise<void> {
    const saved = await this.storage.load(this.spaceId);
    if (saved) {
      this.confirmed = saved.confirmed;
      this.pending = saved.pending;
      this.recompute();
    }
    this.connection = this.transport.connect(this.spaceId, {
      onOpen: () => this.onOpen(),
      onMessage: (m) => this.onMessage(m),
      onClose: () => {
        this.connected = false;
        this.online = [];
        this.emit();
      },
    });
  }

  stop(): void {
    this.connection?.close();
    this.connection = null;
    this.connected = false;
  }

  /** Apply a change now and queue it for the server. Returns the reason if the rules forbid it. */
  dispatch(change: Change): { ok: true; id: string } | { ok: false; reason: string } {
    const command = Command.parse({ ...change, id: newId(), at: new Date().toISOString() });
    const decision = decide(this.view, command, this.userId);
    if (!decision.ok) return decision;
    this.pending.push(command);
    this.recompute();
    this.persist();
    if (this.connected) this.connection?.send({ t: "cmd", cmd: command });
    return { ok: true, id: command.id };
  }

  typing(): void {
    if (this.connected) this.connection?.send({ t: "typing" });
  }

  dismissError(): void {
    this.error = null;
    this.emit();
  }

  getSnapshot = (): SyncSnapshot => this.snapshot;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  /** Resolves once queued writes to local storage have finished (tests, app backgrounding). */
  flush(): Promise<void> {
    return this.saving;
  }

  private onOpen() {
    this.connected = true;
    this.connection?.send({ t: "hello", v: PROTOCOL_VERSION, afterSeq: this.confirmed.seq });
    // Resend everything unconfirmed, in order. The server ignores commands it already applied.
    for (const cmd of this.pending) this.connection?.send({ t: "cmd", cmd });
    this.emit();
  }

  private onMessage(msg: ServerMessage) {
    switch (msg.t) {
      case "events": {
        if (msg.after > this.confirmed.seq) {
          // We missed something (for example a dropped batch): ask for everything since our cursor.
          this.connection?.send({ t: "hello", v: PROTOCOL_VERSION, afterSeq: this.confirmed.seq });
          return;
        }
        const fresh = msg.events.filter((e) => e.seq > this.confirmed.seq);
        const next = applyEvents(this.confirmed, fresh);
        this.confirmed = { ...next, seq: Math.max(next.seq, msg.upTo) };
        const confirmedIds = new Set(fresh.map((e) => e.commandId).filter(Boolean));
        this.pending = this.pending.filter((c) => !confirmedIds.has(c.id));
        this.recompute();
        this.persist();
        return;
      }
      case "ack": {
        if (msg.seq > this.confirmed.seq) {
          // Confirmed on the server but we haven't seen the events yet: catch up first.
          this.connection?.send({ t: "hello", v: PROTOCOL_VERSION, afterSeq: this.confirmed.seq });
          return;
        }
        this.pending = this.pending.filter((c) => c.id !== msg.id);
        this.recompute();
        this.persist();
        return;
      }
      case "reject":
        this.pending = this.pending.filter((c) => c.id !== msg.id);
        this.error = { commandId: msg.id, reason: msg.reason };
        this.recompute();
        this.persist();
        return;
      case "presence":
        this.online = msg.online;
        this.emit();
        return;
      case "typing":
        return;
      case "error":
        this.error = { commandId: "", reason: msg.reason };
        this.emit();
        return;
    }
  }

  /** Confirmed state with pending changes replayed on top, numbered after the confirmed cursor. */
  private recompute() {
    let view = this.confirmed;
    for (const cmd of this.pending) {
      const d = decide(view, cmd, this.userId);
      if (!d.ok) continue; // No longer possible (someone else changed things); the server will reject it too.
      view = applyEvents(view, sequence(d.events, view.seq));
    }
    this.view = view;
    this.emit();
  }

  private persist() {
    const data: PersistedSpace = { confirmed: this.confirmed, pending: [...this.pending] };
    this.saving = this.saving.then(() => this.storage.save(this.spaceId, data)).catch(() => undefined);
  }

  private makeSnapshot(): SyncSnapshot {
    return {
      view: this.view,
      pendingIds: new Set(this.pending.map((c) => c.id)),
      connected: this.connected,
      online: this.online,
      error: this.error,
    };
  }

  private emit() {
    this.snapshot = this.makeSnapshot();
    for (const l of this.listeners) l();
  }
}
