import { cloudflareTest, readD1Migrations } from "@cloudflare/vitest-plugin";
import { defineConfig } from "vitest/config";

export default defineConfig(async () => {
  const migrations = await readD1Migrations("./migrations");
  return {
    plugins: [
      cloudflareTest({
        wrangler: { configPath: "./wrangler.jsonc" },
        miniflare: {
          bindings: {
            TEST_MIGRATIONS: migrations,
            ENVIRONMENT: "test",
            EMAIL_PROVIDER: "test",
            // Snapshot often, so every test also exercises waking up from a snapshot.
            SNAPSHOT_EVERY: "3",
            BETTER_AUTH_SECRET: "test-only-better-auth-secret-0123456789abcdef",
            TICKET_SECRET: "test-only-ticket-secret-0123456789abcdef",
          },
        },
      }),
    ],
    test: { setupFiles: ["./test/setup.ts"] },
  };
});
