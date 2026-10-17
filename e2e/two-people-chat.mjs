// End-to-end smoke test: two people make accounts on the web app, one creates a space and invites the
// other, and they chat live. Run against a local Worker started with EMAIL_PROVIDER=test.
// Usage: node e2e/two-people-chat.mjs [webUrl] [apiUrl]
import { chromium } from "playwright";

const WEB = process.argv[2] ?? "http://localhost:8081";
const OTP = "424242";
const shots = process.env.SHOTS_DIR;

const PASSWORD = "correct horse battery";

async function open(browser, who) {
  const page = await (await browser.newContext({ viewport: { width: 1200, height: 800 } })).newPage();
  page.on("pageerror", (e) => console.error(`[${who}] page error:`, e.message));
  await page.goto(WEB);
  return page;
}

/** Make an account with a password, then confirm the email with the code. */
async function signIn(browser, email) {
  const page = await open(browser, email);
  await page.getByText("New here? Make an account").click();
  await page.getByPlaceholder("Maya Chen").fill(email.split("-")[0]);
  await page.getByPlaceholder("you@example.com").fill(email);
  await page.getByPlaceholder("At least 8 characters").fill(PASSWORD);
  await page.getByText("Make my account").click();
  await page.getByPlaceholder("123456").fill(OTP);
  await page.getByText("Confirm and sign in").click();
  await page.getByText("Spaces", { exact: true }).waitFor();
  return page;
}

/** Sign in again later with just the email and password. */
async function signInAgain(browser, email, password) {
  const page = await open(browser, email);
  await page.getByPlaceholder("you@example.com").fill(email);
  await page.getByLabel("Password").fill(password);
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
  // Click into the field like a person would: a click inside a sheet must not close it.
  await maya.getByPlaceholder("Family, health and the house").click();
  await maya.keyboard.type("Family, health and the house");
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
  const spaceId = new URL(maya.url()).pathname.split("/").pop();

  const jordan = await signIn(browser, `jordan-${stamp}@example.com`);
  await jordan.goto(`${WEB}/join/${token}`);
  await jordan.getByText(/You asked to join Life/).waitFor();
  // Maya lets Jordan in from the invite sheet.
  await maya.reload();
  await maya.getByText(/Invite · 1 waiting/).click();
  await maya.getByText("Let in", { exact: true }).click();
  await maya.getByText("Asking to join").waitFor({ state: "detached" });
  // The sheet shrinks once the request is answered, so clicking near its edge can land on another control.
  // Reloading closes it for sure.
  await maya.reload();
  await maya.getByText(/\(you\)/).waitFor();
  await jordan.goto(`${WEB}/spaces/${spaceId}`);
  await jordan.getByPlaceholder("Message Life…").waitFor();

  await maya.getByPlaceholder("Message Life…").fill("Flights booked!");
  await maya.getByPlaceholder("Message Life…").press("Enter");
  await jordan.getByText("Flights booked!").waitFor({ timeout: 5000 });
  await jordan.getByText("Flights booked!").hover();
  await jordan.getByLabel("Add a reaction").first().click();
  await jordan.getByLabel("React 🔥").click();
  await maya.getByLabel("🔥 1").waitFor({ timeout: 5000 });
  // An update from the item itself lands in the chat for supporters.
  await maya.getByLabel("Open Pick up kids").first().click();
  await maya.getByText("Update", { exact: true }).click();
  await maya.getByPlaceholder("How's it going?").fill("Running 10 minutes late");
  await maya.getByText("Post to the chat").click();
  await jordan.getByText("Running 10 minutes late").waitFor({ timeout: 5000 });
  await maya.getByLabel("Mark Pick up kids done").click();
  await jordan.getByText("Pick up kids").first().waitFor({ timeout: 5000 });
  if (shots) {
    await maya.screenshot({ path: `${shots}/maya.png` });
    await jordan.screenshot({ path: `${shots}/jordan.png` });
  }
  // Plain-words add on Today: the date is read from the words and the item shows under Coming up.
  await maya.goto(WEB);
  await maya.getByText("Add", { exact: true }).first().click();
  await maya.getByLabel("What to add").fill("call mom in 2 days 6pm");
  await maya.getByText("Adds a to-do called").waitFor();
  await maya.getByRole("button", { name: "Add", exact: true }).last().click();
  // Quick add stays open for the next one; close it when done.
  await maya.getByText(/Added to Life/).waitFor();
  await maya.getByLabel("Close").first().click();
  await maya.getByText("Coming up").waitFor();
  await maya
    .getByText(/6:00 PM/)
    .first()
    .waitFor();
  await maya.getByLabel("Open call mom").first().waitFor();

  // Select several: Select, pick an item, Won't do. It leaves Today's list.
  await maya.getByRole("button", { name: "Select", exact: true }).click();
  await maya.getByLabel("Select call mom").first().click();
  await maya.getByText("1 selected").waitFor();
  await maya.getByText("Won't do", { exact: true }).last().click();
  await maya.getByLabel("Open call mom").waitFor({ state: "detached" });

  const wrong = await open(browser, "wrong password");
  await wrong.getByPlaceholder("you@example.com").fill(`maya-${stamp}@example.com`);
  await wrong.getByLabel("Password").fill("not the password");
  await wrong.getByText("Sign in", { exact: true }).click();
  await wrong.getByText("That email and password don't match").waitFor();
  const again = await signInAgain(browser, `maya-${stamp}@example.com`, PASSWORD);
  await again.getByText("Life").first().waitFor();
  await signInAgain(browser, "bagel", "bagel");
  console.log(
    "E2E passed: sign-up, password sign-in, the test account, space, invite, live chat, reactions, completion lines and updates work.",
  );
} finally {
  await browser.close();
}
