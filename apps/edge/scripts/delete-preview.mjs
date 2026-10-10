// Remove a pull request's preview Worker and database. Usage: node scripts/delete-preview.mjs <pr-number>
import { names, wrangler } from "./preview-config.mjs";

const pr = process.argv[2];
if (!/^\d+$/.test(pr ?? "")) throw new Error("Usage: delete-preview.mjs <pr-number>");
const { worker, db } = names(pr);
for (const args of [
  ["delete", "--name", worker, "--force"],
  ["d1", "delete", db, "--skip-confirmation"],
]) {
  try {
    wrangler(args);
  } catch (e) {
    console.warn(`Skipped (${args.join(" ")}): ${e.message}`);
  }
}
