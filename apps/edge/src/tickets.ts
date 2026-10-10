/**
 * Short-lived, signed tickets for opening WebSockets. Browsers and React Native can't reliably
 * attach auth headers to a WebSocket, so the app asks for a ticket over authenticated HTTPS
 * and passes it in the socket URL. Tickets expire after 60 seconds.
 */
const enc = new TextEncoder();

const b64url = (bytes: ArrayBuffer | Uint8Array) =>
  btoa(String.fromCharCode(...new Uint8Array(bytes)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");

const fromB64url = (s: string) =>
  Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0));

async function key(secret: string) {
  return crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, [
    "sign",
    "verify",
  ]);
}

export interface TicketClaims {
  sub: string;
  scope: string;
  exp: number;
}

export async function signTicket(
  secret: string,
  sub: string,
  scope: string,
  ttlSeconds = 60,
): Promise<string> {
  const claims: TicketClaims = { sub, scope, exp: Math.floor(Date.now() / 1000) + ttlSeconds };
  const body = b64url(enc.encode(JSON.stringify(claims)));
  const sig = await crypto.subtle.sign("HMAC", await key(secret), enc.encode(body));
  return `${body}.${b64url(sig)}`;
}

export async function verifyTicket(secret: string, ticket: string, scope: string): Promise<string | null> {
  const [body, sig] = ticket.split(".");
  if (!body || !sig) return null;
  let valid = false;
  try {
    valid = await crypto.subtle.verify("HMAC", await key(secret), fromB64url(sig), enc.encode(body));
  } catch {
    return null;
  }
  if (!valid) return null;
  const claims = JSON.parse(new TextDecoder().decode(fromB64url(body))) as TicketClaims;
  if (claims.scope !== scope || claims.exp < Math.floor(Date.now() / 1000)) return null;
  return claims.sub;
}
