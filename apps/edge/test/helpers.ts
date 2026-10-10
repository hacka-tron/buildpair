import { SELF } from "cloudflare:test";
import { newId } from "@buildpair/domain";
import type { CommandInput, ServerMessage } from "@buildpair/protocol";
import { TEST_OTP } from "../src/auth";

const ORIGIN = "http://localhost:8081";
const BASE = "http://localhost:8787";

export interface Client {
  cookie: string;
  get(path: string): Promise<Response>;
  post(path: string, body?: unknown): Promise<Response>;
}

/** Sign in with an email code (the test provider always issues TEST_OTP) and return a client with the session cookie. */
export async function signIn(email: string): Promise<Client> {
  const headers = { "content-type": "application/json", origin: ORIGIN };
  const sent = await SELF.fetch(`${BASE}/api/auth/email-otp/send-verification-otp`, {
    method: "POST",
    headers,
    body: JSON.stringify({ email, type: "sign-in" }),
  });
  if (!sent.ok) throw new Error(`send otp: ${sent.status} ${await sent.text()}`);
  const res = await SELF.fetch(`${BASE}/api/auth/sign-in/email-otp`, {
    method: "POST",
    headers,
    body: JSON.stringify({ email, otp: TEST_OTP }),
  });
  if (!res.ok) throw new Error(`sign in: ${res.status} ${await res.text()}`);
  const cookie = res.headers
    .getSetCookie()
    .map((c) => c.split(";")[0])
    .join("; ");
  const withAuth = { cookie, origin: ORIGIN };
  return {
    cookie,
    get: (path) => SELF.fetch(`${BASE}${path}`, { headers: withAuth }),
    post: (path, body) =>
      SELF.fetch(`${BASE}${path}`, {
        method: "POST",
        headers: { ...withAuth, "content-type": "application/json" },
        body: JSON.stringify(body ?? {}),
      }),
  };
}

export const command = (c: Omit<CommandInput, "id" | "at">) => ({
  id: newId(),
  at: new Date().toISOString(),
  ...c,
});

/** Open a space socket and collect what the server sends. */
export async function openSocket(client: Client, spaceId: string) {
  const { ticket } = (await (await client.post(`/spaces/${spaceId}/ticket`)).json()) as { ticket: string };
  const res = await SELF.fetch(`${BASE}/spaces/${spaceId}/ws?ticket=${ticket}`, {
    headers: { upgrade: "websocket" },
  });
  const ws = res.webSocket;
  if (!ws) throw new Error(`no websocket: ${res.status}`);
  ws.accept();
  const received: ServerMessage[] = [];
  const waiters: Array<() => void> = [];
  ws.addEventListener("message", (e) => {
    received.push(JSON.parse(e.data as string));
    for (const w of waiters.splice(0)) w();
  });
  const waitFor = async (pred: (m: ServerMessage) => boolean, timeoutMs = 2000): Promise<ServerMessage> => {
    const deadline = Date.now() + timeoutMs;
    for (;;) {
      const hit = received.find(pred);
      if (hit) return hit;
      if (Date.now() > deadline) throw new Error(`timed out; got ${JSON.stringify(received)}`);
      await new Promise<void>((r) => {
        waiters.push(r);
        setTimeout(r, 50);
      });
    }
  };
  return { ws, received, waitFor, send: (m: unknown) => ws.send(JSON.stringify(m)) };
}
