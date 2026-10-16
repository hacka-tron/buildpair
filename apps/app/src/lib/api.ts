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
  /** Owners only: whether it's shown on Discover. */
  listed?: boolean;
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
  /** What they wrote when offering support from Discover. */
  note: string | null;
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
/** Leave a space (your own ID), or as its owner remove someone. */
export const removeMember = (spaceId: string, userId: string) =>
  api<{ ok: true }>(`/spaces/${spaceId}/members/${userId}/remove`, { method: "POST" });
export const listBlocks = () => api<{ blocks: { userId: string; name: string }[] }>("/me/blocks");
export const blockPerson = (userId: string) =>
  api<{ ok: true }>("/me/blocks", { method: "POST", body: { userId } });
export const unblockPerson = (userId: string) =>
  api<{ ok: true }>(`/me/blocks/${userId}/remove`, { method: "POST" });
export type ReportReason = "spam" | "harassment" | "inappropriate" | "other";
export const sendReport = (report: {
  spaceId: string;
  userId: string;
  messageId?: string;
  reason: ReportReason;
  note?: string;
}) => api<{ ok: true }>("/reports", { method: "POST", body: report });

export interface Listing {
  spaceId: string;
  name: string;
  purpose: string;
  ownerName: string;
  goals: { title: string; kind: string }[];
  people: number;
  updatedAt: string;
  /** You've offered support and the owner hasn't answered yet. */
  asked: boolean;
}
export const listDiscover = (q = "") =>
  api<{ listings: Listing[] }>(`/discover${q.trim() ? `?q=${encodeURIComponent(q.trim())}` : ""}`);
export const offerSupport = (spaceId: string, note: string) =>
  api<{ status: "requested" | "member" }>(`/discover/${spaceId}/offer`, { method: "POST", body: { note } });
export const setListing = (spaceId: string, on: boolean) =>
  api<{ ok: true }>(`/spaces/${spaceId}/listing`, { method: "POST", body: { on } });
