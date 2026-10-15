// End-to-end smoke test: two people sign in on the web app, one creates a space and invites the
// other, and they chat live. Run against a local Worker started with EMAIL_PROVIDER=test.
// Usage: node e2e/two-people-chat.mjs [webUrl] [apiUrl]
import { chromium } from "playwright";

const WEB = process.argv[2] ?? "http://localhost:8081";
const OTP = "424242";
const shots = process.env.SHOTS_DIR;

async function signIn(browser, email) {
  const page = await (await browser.newContext({ viewport: { width: 1200, height: 800 } })).newPage();
  page.on("pageerror", (e) => console.error(`[${email}] page error:`, e.message));
  await page.goto(WEB);
  await page.getByPlaceholder("you@example.com").fill(email);
  await page.getByText("Send me a code").click();
  await page.getByPlaceholder("123456").fill(OTP);
  await page.getByText("Sign in", { exact: true }).click();
  await page.getByText("Spaces", { exact: true }).waitFor();
  return page;
}

const browser = await chromium.launch();
try {
  const stamp = Date.now();
  const maya = await signIn(browser, `maya-${stamp}@example.com`);
  await maya.getByText("Spaces", { exact: true }).click();
  await maya.getByText("New space").click();
  await maya.getByPlaceholder("Life", { exact: true }).fill("Life");
  await maya.getByPlaceholder("Family, health and the house").fill("Family, health and the house");
  await maya.getByText("Create space").click(); // opens the new space
  await maya.getByText(/\(you\)/).waitFor(); // the space has loaded
  await maya.getByPlaceholder("+ Add to Life").fill("Pick up kids");
  await maya.getByPlaceholder("+ Add to Life").press("Enter");
  await maya.getByText("Invite", { exact: true }).click();
  await maya.getByText("Make an invite link").click();
  const link = await maya.getByText(/buildpair\.app\/join\//).innerText();
  await maya
    .getByLabel("Close")
    .last()
    .click({ position: { x: 5, y: 5 } });
  const token = link.split("/join/")[1].trim();

  const jordan = await signIn(browser, `jordan-${stamp}@example.com`);
  await jordan.goto(`${WEB}/join/${token}`);
  await jordan.getByPlaceholder("Message Life…").waitFor();

  await maya.getByPlaceholder("Message Life…").fill("Flights booked!");
  await maya.getByPlaceholder("Message Life…").press("Enter");
  await jordan.getByText("Flights booked!").waitFor({ timeout: 5000 });
  await jordan.getByText("Flights booked!").hover();
  await jordan.getByLabel("Add a reaction").first().click();
  await jordan.getByLabel("React 🔥").click();
  await maya.getByLabel("🔥 1").waitFor({ timeout: 5000 });
  await maya.getByLabel("Mark Pick up kids done").click();
  await jordan.getByText("Pick up kids").first().waitFor({ timeout: 5000 });
  if (shots) {
    await maya.screenshot({ path: `${shots}/maya.png` });
    await jordan.screenshot({ path: `${shots}/jordan.png` });
  }
  console.log("E2E passed: sign-in, space, invite, live chat, reactions and completion lines work.");
} finally {
  await browser.close();
}
