/** API base URL. Set EXPO_PUBLIC_API_URL per environment; defaults to the local Worker. */
export const API_URL = (process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:8787").replace(/\/$/, "");

/** The landing site (privacy and terms pages). Follows the API's environment unless set. */
export const SITE_URL = (
  process.env.EXPO_PUBLIC_SITE_URL ??
  (API_URL.includes("api-staging.")
    ? "https://staging.buildpair.app"
    : API_URL.includes("api.buildpair.app")
      ? "https://buildpair.app"
      : "http://localhost:8788")
).replace(/\/$/, "");
