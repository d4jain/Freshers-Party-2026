import { expect, test } from "@playwright/test";
import { noHorizontalOverflow } from "./helpers";

test.describe("public landing page", () => {
  test("shows confirmed facts, eligibility and honest placeholders without overflow", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
    await page.goto("/");
    await expect(page.getByRole("heading", { level: 1 })).toContainText("Freshers’");
    await expect(page.getByText("Bennett University students only").first()).toBeVisible();
    await expect(page.getByText("Thursday, 1 October 2026").first()).toBeVisible();
    await expect(page.getByText(/From 7:00 am IST/).first()).toBeAttached();
    await expect(page.getByText("₹2,199").first()).toBeVisible();
    await expect(page.locator("s", { hasText: "₹2,500" }).first()).toBeVisible();
    await expect(page.getByText(/Countdown to doors · .*7:00 am IST/)).toBeVisible();
    await expect(page.getByRole("link", { name: /Join WhatsApp/ }).first()).toHaveAttribute(
      "href",
      "https://chat.whatsapp.com/FmJaepiArmjAbe7v5fofZA?mode=gi_t",
    );
    await expect(page.getByText(/not organised, endorsed or sponsored by Bennett University/).first()).toBeAttached();
    await expect(page.getByText(/menu to be announced/i)).toHaveCount(0);
    expect(await page.content()).not.toMatch(/first[- ]year/i);
    expect(await noHorizontalOverflow(page)).toBe(true);
    for (const y of [1200, 2400, 3600, 4800, 6000]) {
      await page.evaluate((v) => window.scrollTo(0, v), y);
      await page.waitForTimeout(150);
    }
    expect(await noHorizontalOverflow(page)).toBe(true);
    expect(errors.filter((e) => !/Download the React DevTools/.test(e))).toEqual([]);
  });

  test("countdown never shows negative values", async ({ page }) => {
    await page.goto("/");
    const timer = page.getByRole("timer");
    await expect(timer).toBeVisible();
    await expect(timer).not.toContainText("-");
  });

  test("FAQ works with the keyboard and exposes aria-expanded", async ({ page }) => {
    await page.goto("/#faq");
    const trigger = page.getByRole("button", { name: "Who can come?" });
    await trigger.focus();
    await expect(trigger).toHaveAttribute("aria-expanded", "false");
    await page.keyboard.press("Enter");
    await expect(trigger).toHaveAttribute("aria-expanded", "true");
    await expect(page.getByText(/Carry your college ID — you may be asked for it at entry/).first()).toBeVisible();
  });

  test("food and drinks cards open the menu popups", async ({ page }) => {
    await page.goto("/#experience");
    await page.getByRole("button", { name: "View the food menu" }).click();
    const food = page.getByRole("dialog", { name: "Food menu" });
    await expect(food.getByText("Paneer Tikka")).toBeVisible();
    await expect(food.getByText("Ice Cream")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(food).toBeHidden();
    await page.getByRole("button", { name: "View the drinks menu" }).click();
    const drinks = page.getByRole("dialog", { name: "Drinks menu" });
    await expect(drinks.getByText("Virgin Mojito")).toBeVisible();
    await expect(drinks.getByText("Kingfisher Premium")).toBeVisible();
    await expect(drinks.getByText(/21\+ in Uttar Pradesh/)).toBeVisible();
  });

  test("gallery captions stock photos honestly and survives image failures", async ({ page }) => {
    await page.route("**/_next/image**", (r) => r.abort());
    await page.goto("/#glimpses");
    await expect(page.getByText("Mood reference · licensed stock photo — not Rubarru and not this event").first()).toBeVisible();
    await page.getByRole("button", { name: "Next photo" }).click();
    await expect(page.getByText("2 / 5")).toBeVisible();
    await expect(page.getByText("Image unavailable").first()).toBeAttached();
  });

  test("venue uses a labelled search link, not an unverified pin", async ({ page }) => {
    await page.goto("/#venue");
    const directions = page.getByRole("link", { name: /Get directions/ });
    await expect(directions).toHaveAttribute("href", /google\.com\/maps\/dir\/\?api=1&destination=Rubarru/);
    await expect(page.getByText(/exact map pin hasn’t been verified/)).toBeVisible();
  });

  test("reduced motion: content visible, no glitter canvas", async ({ browser }) => {
    const ctx = await browser.newContext({ reducedMotion: "reduce", viewport: { width: 1280, height: 800 } });
    const page = await ctx.newPage();
    await page.goto("/");
    await page.mouse.move(300, 300);
    await page.mouse.move(600, 400);
    await expect(page.locator("canvas[aria-hidden='true']")).toHaveCount(0);
    await expect(page.getByText("Your people. Your first unforgettable night.")).toBeVisible();
    await ctx.close();
  });
});

test.describe("cursor glitter", () => {
  test("renders a non-interactive canvas on fine pointers and can be turned off", async ({ page }, info) => {
    test.skip(info.project.name !== "desktop-1440", "fine pointer only");
    await page.goto("/");
    await page.mouse.move(200, 200);
    await page.mouse.move(500, 300, { steps: 8 });
    const canvas = page.locator("canvas.pointer-events-none");
    await expect(canvas).toHaveCount(1);
    await expect(canvas).toHaveCSS("pointer-events", "none");
    await page.getByRole("switch", { name: /Sparkle effects/ }).click();
    await expect(canvas).toHaveCount(0);
    await page.getByRole("switch", { name: /Sparkle effects/ }).click();
  });
});
