import { ServerMessage } from "@buildpair/protocol";
import type { Connection, ConnectionHandlers, Transport } from "@buildpair/sync";
import { WebSocket as ReconnectingWebSocket } from "partysocket";
import { api } from "./api";
import { API_URL } from "./config";

const wsBase = API_URL.replace(/^http/, "ws");

/**
 * Live connection to a space's room. Each (re)connect fetches a fresh 60-second ticket over
 * authenticated HTTPS, then opens the socket; partysocket handles backoff and reconnects.
 */
export const spaceTransport: Transport = {
  connect(spaceId: string, handlers: ConnectionHandlers): Connection {
    const url = async () => {
      const { ticket } = await api<{ ticket: string }>(`/spaces/${spaceId}/ticket`, { method: "POST" });
      return `${wsBase}/spaces/${spaceId}/ws?ticket=${encodeURIComponent(ticket)}`;
    };
    const ws = new ReconnectingWebSocket(url, [], {
      maxReconnectionDelay: 10_000,
      minReconnectionDelay: 500,
    });
    ws.addEventListener("open", () => handlers.onOpen());
    ws.addEventListener("close", () => handlers.onClose());
    ws.addEventListener("message", (e: MessageEvent) => {
      const parsed = ServerMessage.safeParse(JSON.parse(String(e.data)));
      if (parsed.success) handlers.onMessage(parsed.data);
    });
    return {
      send: (msg) => {
        if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(msg));
      },
      close: () => ws.close(),
    };
  },
};
