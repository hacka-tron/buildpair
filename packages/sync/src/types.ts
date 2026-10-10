import type { SpaceState } from "@buildpair/domain";
import type { ClientMessage, Command, ServerMessage } from "@buildpair/protocol";

/** What a device keeps for one space between launches. */
export interface PersistedSpace {
  /** State confirmed by the server, up to and including `confirmed.seq`. */
  confirmed: SpaceState;
  /** Changes made on this device that the server hasn't confirmed yet, oldest first. */
  pending: Command[];
}

/** Where the local copy lives: SQLite on phones, IndexedDB on the web, memory in tests. */
export interface SpaceStorage {
  load(spaceId: string): Promise<PersistedSpace | null>;
  save(spaceId: string, data: PersistedSpace): Promise<void>;
}

export interface ConnectionHandlers {
  onOpen(): void;
  onMessage(msg: ServerMessage): void;
  onClose(): void;
}

/** A live connection to one space's room. The app implements this with partysocket and a ticket. */
export interface Connection {
  send(msg: ClientMessage): void;
  close(): void;
}

export interface Transport {
  connect(spaceId: string, handlers: ConnectionHandlers): Connection;
}
