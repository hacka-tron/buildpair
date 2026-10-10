// Shared helpers for per-pull-request preview environments.
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";

export const names = (pr) => ({
  worker: `buildpair-api-pr-${pr}`,
  db: `buildpair-pr-${pr}`,
  web: `buildpair-web`,
});

export function wrangler(args, opts = {}) {
  return execFileSync("pnpm", ["exec", "wrangler", ...args], {
    encoding: "utf8",
    stdio: ["pipe", "pipe", "inherit"],
    ...opts,
  });
}

/** Read wrangler.jsonc (comments allowed) as plain JSON. */
export function readBaseConfig() {
  const text = readFileSync(new URL("../wrangler.jsonc", import.meta.url), "utf8")
    .split("\n")
    .filter((line) => !line.trim().startsWith("//"))
    .join("\n");
  return JSON.parse(text);
}

export function writeConfig(path, config) {
  writeFileSync(path, JSON.stringify(config, null, 2));
}
