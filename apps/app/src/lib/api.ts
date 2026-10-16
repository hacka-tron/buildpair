import type { SpaceColor } from "@buildpair/protocol";
import { authHeaders } from "./auth";
import { API_URL } from "./config";

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

/** The one way feature code talks to the API: JSON in, JSON out, errors with a readable message. */
export async function api<T>(
  path: string,
  init: { method?: "GET" | "POST"; body?: unknown } = {},
): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, {
      method: init.method ?? "GET",
      credentials: "include",
      headers: { "content-type": "application/json", ...(await authHeaders()) },
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
    });
  } catch {
    throw new ApiError(0, "offline", "Couldn't reach Buildpair. Check your connection.");
  }
  const data = (await res.json().catch(() => ({}))) as { error?: string; code?: string };
  if (!res.ok)
    throw new ApiError(res.status, data.code ?? "error", data.error ?? "Something went wrong. Try again.");
  return data as T;
}

export interface SpaceSummary {
  id: string;
  name: string;
  purpose: string;
  /** Picked by the owner; null or missing means the automatic color. */
  color?: SpaceColor | null;
  role: "owner" | "supporter";
  /** Owners only: how many people are asking to join. */
  requests?: number;
}

export const listSpaces = () => api<{ spaces: SpaceSummary[] }>("/spaces");
export const createSpace = (name: string, purpose: string) =>
  api<SpaceSummary>("/spaces", { method: "POST", body: { name, purpose } });
export const createInvite = (spaceId: string) =>
  api<{ token: string; url: string }>(`/spaces/${spaceId}/invites`, { method: "POST" });
/** Opening an invite link asks to join; "member" means you're already in. */
export const acceptInvite = (token: string) =>
  api<{ spaceId: string; spaceName: string; status: "requested" | "member" }>(`/invites/${token}/accept`, {
    method: "POST",
  });
export interface JoinRequest {
  userId: string;
  name: string;
  createdAt: string;
}
export const listRequests = (spaceId: string) =>
  api<{ requests: JoinRequest[] }>(`/spaces/${spaceId}/requests`);
export const answerRequest = (spaceId: string, userId: string, answer: "approve" | "decline") =>
  api<{ ok: true }>(`/spaces/${spaceId}/requests/${userId}/${answer}`, { method: "POST" });
export const resetInvites = (spaceId: string) =>
  api<{ ok: true }>(`/spaces/${spaceId}/invites/reset`, { method: "POST" });
/** Move an item (a goal with its steps) to another of your spaces. Reuse `moveId` when retrying. */
export const moveItem = (fromSpaceId: string, itemId: string, toSpaceId: string, moveId: string) =>
  api<{ ok: true }>(`/spaces/${fromSpaceId}/items/${itemId}/move`, {
    method: "POST",
    body: { moveId, toSpaceId },
  });
