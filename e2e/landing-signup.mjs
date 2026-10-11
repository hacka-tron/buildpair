// End-to-end: a new person creates an account from the landing page (name, email, code) and lands
// signed in inside the app, with their name on the account. Needs the API (EMAIL_PROVIDER=test),
// the web app and the site running. Usage: node e2e/landing-signup.mjs [siteUrl] [appUrl] [apiUrl]
import { chromium } from "playwright";

const SITE = process.argv[2] ?? "http://localhost:8788";
const APP = process.argv[3] ?? "http://localhost:8081";
const API = process.argv[4] ?? "http://localhost:8787";
const shots = process.env.SHOTS_DIR;

const browser = await chromium.launch();
try {
  for (const [label, viewport] of [
    ["desktop", { width: 1280, height: 860 }],
    ["mobile", { width: 390, height: 844 }],
  ]) {
    const page = await (await browser.newContext({ viewport, isMobile: label === "mobile" })).newPage();
    page.on("pageerror", (e) => console.error(`[${label}] page error:`, e.message));
    await page.goto(SITE);
    await page.waitForTimeout(1800); // let the margin notes finish arriving
    if (shots) await page.screenshot({ path: `${shots}/landing-${label}.png`, fullPage: true });

    const email = `new-${label}-${Date.now()}@example.com`;
    await page.getByLabel("Your name").fill(`Dana ${label}`);
    await page.getByLabel("Email").fill(email);
    await page.getByRole("button", { name: "Email me a code" }).click();
    await page.getByText("Check your email").waitFor();
    await page.getByLabel("Code").fill("424242"); // auto-submits at 6 digits
    await page.waitForURL(`${APP}/**`, { timeout: 10_000 });
    await page.getByText("Spaces", { exact: true }).waitFor();

    const me = await page.evaluate(
      async (api) => (await fetch(`${api}/me`, { credentials: "include" })).json(),
      API,
    );
    if (me.name !== `Dana ${label}`)
      throw new Error(`[${label}] expected the account name to be set, got ${JSON.stringify(me)}`);
    console.log(`[${label}] signed up from the landing page and landed in the app as ${me.name}`);
  }

  // Mistakes get plain answers.
  const page = await (await browser.newContext()).newPage();
  await page.goto(SITE);
  await page.getByLabel("Your name").fill("Sam");
  await page.getByLabel("Email").fill("not-an-email");
  await page.getByRole("button", { name: "Email me a code" }).click();
  await page.getByText("That email doesn't look right").waitFor();
  await page.getByLabel("Email").fill(`sam-${Date.now()}@example.com`);
  await page.getByRole("button", { name: "Email me a code" }).click();
  await page.getByLabel("Code").fill("000000");
  await page.getByRole("alert").filter({ hasText: /./ }).waitFor();
  console.log(`Wrong code shows: "${await page.getByRole("alert").innerText()}"`);
  console.log("E2E passed: landing-page sign-up on desktop and mobile.");
} finally {
  await browser.close();
}
