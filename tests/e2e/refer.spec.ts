import { expect, test } from "@playwright/test";
import { noHorizontalOverflow, signUpAndVerify, uniqueEmail, useFreshIp } from "./helpers";

test.describe("Refer Now", () => {
  test("student gets a code, shares it, and a friend's booking form is prefilled", async ({ page, browser }, info) => {
    await useFreshIp(page);
    await signUpAndVerify(page, uniqueEmail(`ref-${info.project.name}`));

    await page.goto("/account/refer");
    await expect(page.getByRole("heading", { name: /Bring your batch/ })).toBeVisible();
    const code = (await page.locator("p.font-mono").first().innerText()).trim();
    expect(code).toMatch(/^RIYA\d{4}$/);

    const wa = page.getByRole("link", { name: /Share on WhatsApp/ });
    const href = decodeURIComponent((await wa.getAttribute("href")) ?? "");
    expect(href).toMatch(/^https:\/\/wa\.me\/\?text=/);
    expect(href).toContain(code);
    expect(href).toContain(`/book?ref=${code}`);
    await expect(page.getByRole("button", { name: /Share on Instagram/ })).toBeVisible();
    await expect(page.getByText("5 friends attend", { exact: true })).toBeVisible();
    await expect(page.getByText("30 or more friends attend")).toBeVisible();
    await expect(page.getByText("Friends booked")).toBeVisible();
    expect(await noHorizontalOverflow(page)).toBe(true);
    if (process.env.E2E_SHOTS)
      await page.screenshot({ path: `${process.env.E2E_SHOTS}/refer-${info.project.name}.png`, fullPage: true });

    // Same code on a revisit.
    await page.reload();
    await expect(page.locator("p.font-mono").first()).toHaveText(code);

    // A friend opens the shared links.
    const ctx = await browser.newContext({ viewport: page.viewportSize() ?? undefined });
    const friend = await ctx.newPage();
    await useFreshIp(friend);
    await friend.goto(`/signup?ref=${code.toLowerCase()}`);
    await expect(friend.getByLabel(/Referral code/)).toHaveValue(code);
    await signUpAndVerify(friend, uniqueEmail(`friend-${info.project.name}`), { from: null });
    await friend.goto(`/book?ref=${code}`);
    await friend.getByRole("button", { name: /Continue/ }).click();
    await expect(friend.getByLabel(/Referral code/)).toHaveValue(code);
    await ctx.close();
  });

  test("homepage teaser links to the Refer Now page", async ({ page }) => {
    await page.goto("/#refer");
    await expect(page.getByRole("heading", { name: /Bring your batch/ })).toBeVisible();
    await page.getByRole("link", { name: /Get my referral code/ }).click();
    await page.waitForURL(/\/login/);
  });
});
