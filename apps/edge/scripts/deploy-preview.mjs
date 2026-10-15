// Deploy a full preview API for one pull request: its own Worker, Durable Objects and D1 database.
// Usage: node scripts/deploy-preview.mjs <pr-number>
import { appendFileSync } from "node:fs";
import { names, readBaseConfig, wrangler, writeConfig } from "./preview-config.mjs";

const pr = process.argv[2];
if (!/^\d+$/.test(pr ?? "")) throw new Error("Usage: deploy-preview.mjs <pr-number>");
const { worker, db, web } = names(pr);
const subdomain = process.env.WORKERS_SUBDOMAIN;
if (!subdomain)
  throw new Error("Set the CLOUDFLARE_WORKERS_SUBDOMAIN repository variable (see docs/SETUP.md).");
for (const key of ["BETTER_AUTH_SECRET", "TICKET_SECRET"]) {
  if (!process.env[key])
    throw new Error(`Missing secret ${key} on the "preview" environment (see docs/SETUP.md).`);
}

// Create the database once per PR; later pushes reuse it.
const list = JSON.parse(wrangler(["d1", "list", "--json"]));
let databaseId = list.find((d) => d.name === db)?.uuid;
if (!databaseId) {
  wrangler(["d1", "create", db]);
  databaseId = JSON.parse(wrangler(["d1", "list", "--json"])).find((d) => d.name === db).uuid;
}

const apiUrl = `https://${worker}.${subdomain}.workers.dev`;
const webUrl = `https://pr-${pr}-${web}.${subdomain}.workers.dev`;
const base = readBaseConfig();
const config = {
  ...base,
  env: undefined,
  name: worker,
  d1_databases: [{ binding: "DB", database_name: db, database_id: databaseId, migrations_dir: "migrations" }],
  vars: {
    ...base.vars,
    ENVIRONMENT: "preview",
    APP_ORIGINS: webUrl,
    BETTER_AUTH_URL: apiUrl,
    EMAIL_PROVIDER: process.env.RESEND_API_KEY ? "resend" : "console",
  },
};
writeConfig("wrangler.preview.json", config);

wrangler(["d1", "migrations", "apply", "DB", "--remote", "-c", "wrangler.preview.json"]);
wrangler(["deploy", "-c", "wrangler.preview.json"]);
const secrets = {
  BETTER_AUTH_SECRET: process.env.BETTER_AUTH_SECRET,
  TICKET_SECRET: process.env.TICKET_SECRET,
};
if (process.env.RESEND_API_KEY) secrets.RESEND_API_KEY = process.env.RESEND_API_KEY;
if (process.env.ALLOWED_EMAILS) secrets.ALLOWED_EMAILS = process.env.ALLOWED_EMAILS;
wrangler(["secret", "bulk", "-c", "wrangler.preview.json"], { input: JSON.stringify(secrets) });

console.log(`Preview API: ${apiUrl}`);
if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `url=${apiUrl}\n`);
