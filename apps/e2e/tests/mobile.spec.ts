import { expect, test } from "@playwright/test";

test("the phone menu opens, offers sign-in, and closes with Escape", async ({ page }) => {
  await page.goto("/");
  const menuButton = page.getByRole("button", { name: "Open menu" });
  await menuButton.click();

  const menu = page.getByRole("navigation", { name: "Main" }).filter({ hasText: "Sign in" });
  await expect(menu).toBeVisible();
  await expect(menu.getByRole("link", { name: "Sign in" })).toHaveAttribute("href", "/sign-in");

  await page.keyboard.press("Escape");
  await expect(menu).toBeHidden();
  await expect(page.getByRole("button", { name: "Open menu" })).toBeFocused();
});

test("pages fit a phone screen without sideways scrolling", async ({ page }) => {
  // The project's phone, then the narrowest common one (where Browse's five type
  // buttons are tightest).
  for (const width of [page.viewportSize()?.width ?? 412, 320]) {
    await page.setViewportSize({ width, height: 800 });
    for (const path of ["/", "/browse", "/reviews", "/club", "/sign-up"]) {
      await page.goto(path);
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      expect(overflow, `${path} scrolls sideways at ${String(width)}px`).toBeLessThanOrEqual(0);
    }
  }
});
