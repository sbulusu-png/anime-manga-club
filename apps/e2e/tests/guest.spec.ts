import AxeBuilder from "@axe-core/playwright";
import { type Page, expect, test } from "@playwright/test";

/** The first title on a browse page (whatever the catalog holds). */
async function firstTitleHref(page: Page, query = "?type=anime") {
  await page.goto(`/browse${query}`);
  const card = page.locator('main a[href^="/media/"]').first();
  await expect(card).toBeVisible();
  const href = await card.getAttribute("href");
  if (!href) throw new Error("no title in the catalog");
  return href;
}

test.describe("visitors", () => {
  test("home page shows the banner and the sections", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { level: 1, name: "Anime Manga Club" })).toBeVisible();
    for (const section of [
      "Club suggestions",
      "Most popular anime",
      "Most popular manga",
      "Latest reviews",
    ]) {
      await expect(page.getByRole("heading", { level: 2, name: section })).toBeVisible();
    }
    await expect(page.getByRole("link", { name: "Sign in" }).first()).toHaveAttribute(
      "href",
      "/sign-in",
    );
  });

  test("searching the catalog updates the address and opens a title", async ({ page }) => {
    const href = await firstTitleHref(page);
    const title = (await page.locator(`main a[href="${href}"] h3`).first().textContent()) ?? "";
    const word = title.split(/\s+/).find((w) => w.length >= 4) ?? title.slice(0, 4);

    await page.getByRole("searchbox", { name: "Search titles" }).fill(word);
    await expect(page).toHaveURL(new RegExp(`[?&]q=${encodeURIComponent(word)}`));
    // Let the new results settle (the filter bar says "Updating…" meanwhile).
    await expect(page.getByRole("status").filter({ hasText: "Updating" })).toHaveCount(0);
    await expect(page.locator(`main a[href="${href}"]`).first()).toBeVisible();

    await page.locator(`main a[href="${href}"]`).first().click();
    await expect(page).toHaveURL(href);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(title);
  });

  test("title pages invite guests to sign in, then bring them back", async ({ page }) => {
    const href = await firstTitleHref(page);
    await page.goto(href);

    const prompt = page.getByRole("link", { name: "Sign in", exact: true }).last();
    await expect(page.getByText(/to give .+ your verdict/)).toBeVisible();
    await expect(prompt).toHaveAttribute("href", `/sign-in?next=${encodeURIComponent(href)}`);
    await expect(page.getByRole("link", { name: "Sign in to add to your list" })).toBeVisible();
  });

  test("members-only pages send guests to sign in", async ({ page }) => {
    for (const path of ["/for-you", "/settings", "/admin"]) {
      await page.goto(path);
      await expect(page).toHaveURL(`/sign-in?next=${encodeURIComponent(path)}`);
    }
  });

  test("links can't bounce people to other sites after sign-in", async ({ page }) => {
    await page.goto("/sign-in?next=//evil.example");
    const signUp = page.getByRole("link", { name: "Create an account" });
    await expect(signUp).toHaveAttribute("href", "/sign-up");
  });
});

test.describe("accessibility", () => {
  // Scan the settled page, not mid-animation (fading text can look low-contrast).
  test.use({ colorScheme: "dark", reducedMotion: "reduce" });

  const pages = [
    "/",
    "/browse",
    "/reviews",
    "/club",
    "/credits",
    "/sign-in",
    "/sign-up",
    "/forgot-password",
  ];
  for (const path of pages) {
    test(`${path} has no accessibility violations`, async ({ page }) => {
      await page.goto(path);
      await page.waitForLoadState("networkidle");
      const { violations } = await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
        .analyze();
      expect(
        violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`),
      ).toEqual([]);
    });
  }

  test("a title page has no accessibility violations", async ({ page }) => {
    await page.goto(await firstTitleHref(page));
    await page.waitForLoadState("networkidle");
    const { violations } = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
      .analyze();
    expect(
      violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`),
    ).toEqual([]);
  });

  test("light mode passes the contrast checks too", async ({ page }) => {
    await page.emulateMedia({ colorScheme: "light" });
    await page.goto("/");
    await page.waitForLoadState("networkidle");
    const { violations } = await new AxeBuilder({ page }).withRules(["color-contrast"]).analyze();
    expect(violations.map((v) => v.nodes.map((n) => n.target.join(" ")).join(", "))).toEqual([]);
  });
});
