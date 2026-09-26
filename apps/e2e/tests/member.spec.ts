import AxeBuilder from "@axe-core/playwright";
import { type Page, expect, request, test } from "@playwright/test";

import { LEAD_STATE, MEMBER_STATE, accounts } from "./accounts";

test.use({ storageState: MEMBER_STATE });

/** A title for this run's reviews: the most popular anime in the catalog. */
async function pickTitle(page: Page) {
  await page.goto("/browse?type=anime");
  const card = page.locator('main a[href^="/media/"]').first();
  const href = await card.getAttribute("href");
  if (!href) throw new Error("no title in the catalog");
  return href;
}

test("a member reviews a title, tracks it on their list, and sees it on their profile", async ({
  page,
}) => {
  // The longest journey here (review, list, profile, edit, delete).
  test.setTimeout(120_000);
  const { member } = accounts();
  const href = await pickTitle(page);
  await page.goto(href);

  // Verdict and review.
  await page.locator("label", { has: page.getByRole("radio", { name: /^Perfection/ }) }).click();
  await page
    .getByRole("textbox", { name: "Your review" })
    .fill("End-to-end test review: tense, clever and beautifully animated.");
  await page.getByLabel("Contains spoilers").check();
  await page.getByRole("button", { name: "Post review" }).click();
  await expect(page.getByText("You said")).toBeVisible();

  // The club verdict gauge counts it straight away.
  const verdict = page.getByRole("region", { name: "Club verdict" });
  await expect(verdict.getByRole("img")).toHaveAttribute("aria-label", /Perfection: \d+ votes?/, {
    timeout: 30_000,
  });

  // The list, with progress.
  await page.getByLabel("On your list").selectOption("current");
  await expect(page.getByRole("status").filter({ hasText: "Saved" })).toBeVisible();
  await page.getByRole("button", { name: "One episode more" }).click();
  await expect(page.getByLabel("Episodes watched")).toHaveValue("1");

  // The profile shows both.
  await page.goto(`/u/${member.username}`);
  await expect(page.getByRole("heading", { level: 1, name: member.username })).toBeVisible();
  await expect(page.getByText("End-to-end test review")).toBeVisible();
  await page.getByRole("link", { name: /Anime list \(1\)/ }).click();
  await expect(page.getByText(/Watching · ep 1/)).toBeVisible();

  // Editing and deleting.
  await page.goto(href);
  await page.getByRole("button", { name: "Edit" }).click();
  await page.locator("label", { has: page.getByRole("radio", { name: /^Go for it/ }) }).click();
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByText("You said")).toBeVisible();
  await page.getByRole("button", { name: "Delete" }).click();
  await page.getByRole("button", { name: "Yes, delete it" }).click();
  await expect(page.getByRole("button", { name: "Post review" })).toBeVisible();
});

test("a member likes another member's review", async ({ page, baseURL }) => {
  const origin = baseURL ?? "http://localhost:3000";
  const href = await pickTitle(page);
  const mediaId = Number(href.split("/").pop());

  // The club lead writes a review for the member to like.
  const leadApi = await request.newContext({
    baseURL: origin,
    storageState: LEAD_STATE,
    extraHTTPHeaders: { Origin: origin },
  });
  const posted = await leadApi.post("/api/reviews", {
    data: { mediaId, rating: "go_for_it", body: "A review from the e2e club lead to be liked." },
  });
  expect(posted.status()).toBe(201);
  await leadApi.dispose();

  await page.goto("/reviews");
  const card = page.getByRole("article").filter({ hasText: "A review from the e2e club lead" });
  // Wait for the server to confirm, not just the instant on-screen update.
  const saved = page.waitForResponse((r) => r.url().includes("/like") && r.ok());
  await card.getByRole("button", { name: /like this review/ }).click();
  await saved;
  await expect(card.getByRole("button", { name: /1 like \(you liked this\)/ })).toBeVisible();

  await page.reload();
  await expect(
    page
      .getByRole("article")
      .filter({ hasText: "A review from the e2e club lead" })
      .getByRole("button", {
        name: /you liked this/,
      }),
  ).toBeVisible();
});

test("members can't open the club lead panel", async ({ page }) => {
  const response = await page.goto("/admin");
  expect(response?.status()).toBe(404);
});

test("member pages have no accessibility violations", async ({ page }) => {
  const { member } = accounts();
  await page.emulateMedia({ reducedMotion: "reduce" });
  for (const path of ["/for-you", "/settings", `/u/${member.username}`, await pickTitle(page)]) {
    await page.goto(path);
    await page.waitForLoadState("networkidle");
    const { violations } = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
      .analyze();
    expect(
      violations.map(
        (v) => `${path} ${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`,
      ),
    ).toEqual([]);
  }
});
