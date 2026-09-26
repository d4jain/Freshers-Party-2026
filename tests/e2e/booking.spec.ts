import { expect, test } from "@playwright/test";
import { db, noHorizontalOverflow, screenshotPng, setRole, signUpAndVerify, uniqueEmail, useFreshIp } from "./helpers";

/**
 * Full DEMO-mode journey. Demo checkout is simulated server-side through the
 * real confirmation service; this is NOT Razorpay test mode.
 */
test.describe("demo booking journey", () => {
  test.beforeEach(async ({ page }) => {
    await useFreshIp(page);
  });

  test.beforeAll(async () => {
    // Local fixture state for the demo: open capacity via demo fallback.
    await db().query(`UPDATE event_settings SET max_group_size = 10 WHERE id = 'main'`);
  });

  test("group details survive login, then pay → passes → door check-in", async ({ page }, info) => {
    const email = uniqueEmail(info.project.name);

    // Pick a group while signed out, then get sent to sign up.
    await page.goto("/book");
    await page.getByRole("button", { name: "Increase total people" }).click();
    await page.getByRole("button", { name: "Increase total people" }).click();
    await page.getByRole("button", { name: "Increase girls" }).click();
    await expect(page.getByLabel("Boys", { exact: true })).toHaveValue("2");
    await page.getByRole("button", { name: /Continue/ }).click();
    await expect(page.getByText("Log in or create an account to continue")).toBeVisible();

    await page.getByRole("link", { name: "Create account" }).click();
    await page.waitForURL(/\/signup\?next=%2Fbook/);
    await signUpAndVerify(page, email, { from: null });
    await expect(page.getByRole("link", { name: /Join the WhatsApp group/ })).toBeVisible();
    await page.getByRole("link", { name: "Continue to booking" }).click();

    // Draft restored: jumps to details with 3 people.
    await expect(page.getByRole("heading", { name: /Your details/ })).toBeVisible();
    await expect(page.getByLabel("Booker name")).toHaveValue("Riya Verma");
    await page.getByRole("button", { name: /Review order/ }).click();
    await expect(page.getByText("3 × Freshers’ Pass")).toBeVisible();
    await expect(page.getByText("₹6,597").first()).toBeVisible();

    // Acknowledgements are required and unchecked by default.
    const pay = page.getByRole("button", { name: /Continue to pay ₹6,597/ });
    await pay.click();
    await expect(page.getByText(/Please confirm everyone in this booking/)).toBeVisible();
    await page.getByLabel(/every person included in this booking is a student at Bennett University/).check();
    await page.getByLabel(/I accept the/).check();
    expect(await noHorizontalOverflow(page)).toBe(true);

    await pay.click();
    // Bottle animation (or instant) → payment page. Nothing says "confirmed" yet.
    await page.waitForURL(/\/account\/bookings\/.+/);
    await expect(page.getByText("Complete your payment")).toBeVisible();
    await expect(page.getByAltText(/UPI QR code/)).toBeVisible();
    await expect(page.getByText("63968583011@axl")).toBeVisible();
    await expect(page.getByText("₹6,597").first()).toBeVisible();
    await expect(page.getByText(/guest list/i)).toHaveCount(0);
    // Above ₹2,000: the UPI scan-limit note appears in the status card and the QR panel.
    await expect(page.getByText("PLEASE NOTE:")).toHaveCount(2);
    await expect(page.getByText(/payments above ₹2,000 may not go through/).first()).toBeVisible();
    if (process.env.E2E_SHOTS)
      await page.screenshot({ path: `${process.env.E2E_SHOTS}/pay-${info.project.name}.png`, fullPage: true });
    expect(await noHorizontalOverflow(page)).toBe(true);

    const bookingUrl = page.url();

    // Upload proof: validation first, then a real screenshot + UTR.
    await page.getByRole("button", { name: "Submit payment proof" }).click();
    await expect(page.getByText("Attach the payment screenshot.")).toBeVisible();
    await page
      .locator('input[type="file"]')
      .setInputFiles({ name: "paid.png", mimeType: "image/png", buffer: await screenshotPng(3) });
    const utr = String(Date.now()).slice(-12); // unique per run (duplicate UTRs are rightly refused)
    await page.getByLabel("UPI transaction ID / UTR").fill(`${utr.slice(0, 4)} ${utr.slice(4, 8)} ${utr.slice(8)}`);
    await page.getByLabel(/I paid exactly ₹6,597/).check();
    await page.getByRole("button", { name: "Submit payment proof" }).click();
    await expect(page.getByText("In review").first()).toBeVisible();
    await expect(page.getByText(utr)).toBeVisible();
    const [{ count }] = (
      await db().query(`SELECT count(*)::int AS count FROM bookings b JOIN "user" u ON u.id = b.user_id WHERE u.email = $1`, [
        email,
      ])
    ).rows;
    expect(count).toBe(1);

    // Organiser approves in the review queue (role granted server-side, never via the UI).
    await setRole(email, "admin");
    await page.goto("/admin/review");
    const card = page.locator("li", { hasText: utr });
    await expect(card.getByAltText(/Payment screenshot/)).toBeVisible();
    await card.getByLabel(/I found ₹6,597/).check();
    await card.getByRole("button", { name: "Approve & issue passes" }).click();
    await expect(page.getByText(/approved — passes issued/)).toBeVisible();

    await page.goto(bookingUrl);
    await expect(page.getByText(/Pass \d of 3/)).toHaveCount(3);
    const manualCode = (await page.locator("p.font-mono").first().innerText()).trim();

    // Door check-in (staff/admin only).
    await page.goto("/staff/check-in");
    await page.getByLabel("Manual code").fill(manualCode);
    await page.getByRole("button", { name: "Check" }).click();
    await expect(page.getByText("Valid pass")).toBeVisible();
    await page.getByRole("button", { name: "Admit" }).click();
    await expect(page.getByText("Admitted ✓")).toBeVisible();
    await page.getByRole("button", { name: "Next guest" }).click();
    await page.getByRole("button", { name: "Check" }).click();
    await expect(page.getByText("Already checked in")).toBeVisible();
  });

  test("regular users cannot open the organiser dashboard", async ({ page }, info) => {
    const email = uniqueEmail(`plain-${info.project.name}`);
    await signUpAndVerify(page, email);
    await page.goto("/admin");
    await expect(page).toHaveURL(/\/account\?denied=1/);
  });
});

test.describe("layout on signed-in pages", () => {
  test("no horizontal overflow on account, booking, organiser and door pages", async ({ page }, info) => {
    await useFreshIp(page);
    const email = uniqueEmail(`layout-${info.project.name}`);
    await signUpAndVerify(page, email);
    await setRole(email, "admin");
    for (const path of [
      "/account",
      "/book",
      "/admin",
      "/admin/bookings",
      "/admin/settings",
      "/admin/coupons",
      "/admin/referrals",
      "/admin/exceptions",
      "/admin/audit",
      "/staff/check-in",
      "/terms",
      "/refund-policy",
    ]) {
      await page.goto(path);
      await page.waitForLoadState("networkidle");
      expect(await noHorizontalOverflow(page), `overflow on ${path}`).toBe(true);
    }
  });
});
