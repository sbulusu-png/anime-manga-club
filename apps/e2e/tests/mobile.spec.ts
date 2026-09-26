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
  for (const path of ["/", "/browse", "/reviews", "/club", "/sign-up"]) {
    await page.goto(path);
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow, `${path} scrolls sideways`).toBeLessThanOrEqual(0);
  }
});
