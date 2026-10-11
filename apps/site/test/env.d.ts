import type { Env as SiteEnv } from "../src/worker";

declare global {
  namespace Cloudflare {
    interface Env extends SiteEnv {}
  }
}
