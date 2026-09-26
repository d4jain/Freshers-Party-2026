import { expect, test } from "@playwright/test";
import { db, noHorizontalOverflow, setRole, signUpAndVerify, uniqueEmail, useFreshIp } from "./helpers";

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
    const pay = page.getByRole("button", { name: /Pay ₹6,597/ });
    await pay.click();
    await expect(page.getByText(/Please confirm everyone in this booking/)).toBeVisible();
    await page.getByLabel(/every person included in this booking is a first-year student/).check();
    await page.getByLabel(/I accept the/).check();
    expect(await noHorizontalOverflow(page)).toBe(true);

    await pay.click();
    // Bottle animation (or instant) — never says confirmed.
    const opening = page.getByText("Opening secure checkout…");
    if (await opening.isVisible().catch(() => false)) {
      await expect(page.getByText(/confirmed/i)).toHaveCount(0);
    }
    const dialog = page.getByRole("dialog", { name: /Demo checkout/ });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByText(/DEMO MODE — no real payment/)).toBeVisible();

    // Dismiss once, then retry the same held order.
    await page.keyboard.press("Escape");
    await expect(page.getByText(/Checkout closed — nothing is confirmed/)).toBeVisible();
    await pay.click();
    await expect(dialog).toBeVisible();
    await dialog.getByRole("button", { name: "Simulate successful payment" }).click();

    await page.waitForURL(/\/account\/bookings\/.+/);
    await expect(page.getByText("guest list.")).toBeVisible();
    await expect(page.getByText(/Pass \d of 3/)).toHaveCount(3);
    const [{ count }] = (
      await db().query(`SELECT count(*)::int AS count FROM bookings b JOIN "user" u ON u.id = b.user_id WHERE u.email = $1`, [
        email,
      ])
    ).rows;
    expect(count).toBe(1); // dismiss + retry reused the same booking

    const manualCode = (await page.locator("p.font-mono").first().innerText()).trim();

    // Door check-in as staff (role granted server-side, never via the UI).
    await setRole(email, "staff");
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
      "/privacy",
      "/refund-policy",
    ]) {
      await page.goto(path);
      await page.waitForLoadState("networkidle");
      expect(await noHorizontalOverflow(page), `overflow on ${path}`).toBe(true);
    }
  });
});
