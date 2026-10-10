/** API base URL. Set EXPO_PUBLIC_API_URL per environment; defaults to the local Worker. */
export const API_URL = (process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:8787").replace(/\/$/, "");
