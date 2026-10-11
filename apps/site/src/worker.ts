/**
 * The landing site at buildpair.app. Static pages come from ./public; this Worker adds the few
 * things that differ per environment: the browser config (where the API and the app live) and
 * redirects for invite links, which are shared as buildpair.app/join/<token>.
 */
export interface Env {
  ASSETS: Fetcher;
  API_URL: string;
  APP_URL: string;
  GOOGLE_ENABLED: string;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/config.js") {
      const config = {
        apiUrl: env.API_URL,
        appUrl: env.APP_URL,
        googleEnabled: env.GOOGLE_ENABLED === "true",
      };
      return new Response(`window.BUILDPAIR = ${JSON.stringify(config)};`, {
        headers: { "content-type": "text/javascript; charset=utf-8", "cache-control": "public, max-age=300" },
      });
    }

    // Invite links open the app (phones with the app installed catch them before this runs).
    if (url.pathname.startsWith("/join/") || url.pathname === "/app" || url.pathname === "/sign-in") {
      const target = url.pathname.startsWith("/join/") ? `${env.APP_URL}${url.pathname}` : env.APP_URL;
      return Response.redirect(target, 302);
    }

    const res = await env.ASSETS.fetch(request);
    const headers = new Headers(res.headers);
    headers.set("x-content-type-options", "nosniff");
    headers.set("referrer-policy", "strict-origin-when-cross-origin");
    headers.set("x-frame-options", "DENY");
    return new Response(res.body, { status: res.status, statusText: res.statusText, headers });
  },
} satisfies ExportedHandler<Env>;
