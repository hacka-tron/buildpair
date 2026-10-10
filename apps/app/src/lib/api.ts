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
  role: "owner" | "supporter";
}

export const listSpaces = () => api<{ spaces: SpaceSummary[] }>("/spaces");
export const createSpace = (name: string, purpose: string) =>
  api<SpaceSummary>("/spaces", { method: "POST", body: { name, purpose } });
export const createInvite = (spaceId: string) =>
  api<{ token: string; url: string }>(`/spaces/${spaceId}/invites`, { method: "POST" });
export const acceptInvite = (token: string) =>
  api<{ spaceId: string }>(`/invites/${token}/accept`, { method: "POST" });
