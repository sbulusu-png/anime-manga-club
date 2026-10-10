import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

import { LEAD_STATE, accounts } from "./accounts";

test.use({ storageState: LEAD_STATE });

test("a club lead plans next week's pick privately, edits it and removes it", async ({
  page,
  browser,
}) => {
  await page.goto("/admin");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(/^Week of /);
  await page.getByRole("link", { name: "Next week" }).click();
  await expect(page.getByText("Upcoming")).toBeVisible();
  const week = new URL(page.url()).searchParams.get("week") ?? "";

  // Find a title and add it with a note. Search for one the catalog really has, so this
  // works on the small CI catalog as well as a full one.
  const catalog = await page.request.get("/api/media?sort=popularity&limit=1");
  const { items } = (await catalog.json()) as { items: { title: { display: string } }[] };
  const query = items[0]?.title.display.split(" ").find((word) => word.length >= 3) ?? "";
  expect(query, "the catalog should have at least one title").not.toBe("");
  await page.getByLabel("Find a title").fill(query);
  const pick = page.getByRole("button", { name: "Pick", exact: true }).first();
  await expect(pick).toBeVisible();
  await pick.click();
  await page.getByLabel(/Note for the club/).fill("E2E pick: planned ahead.");
  await page.getByRole("button", { name: "Add to the week" }).click();
  await expect(page.getByRole("heading", { name: "Picks (1)" })).toBeVisible();

  // Nobody else can see an upcoming week yet.
  const guest = await browser.newContext({ storageState: { cookies: [], origins: [] } });
  const peek = await guest.request.get(`/api/club/suggestions/current?week=${week}`);
  expect(peek.status()).toBe(403);
  await guest.close();

  // Edit the note, then remove the pick.
  await page.getByRole("button", { name: "Edit note" }).click();
  await page.getByLabel(/^Note for /).fill("E2E pick: note edited.");
  await page.getByRole("button", { name: "Save note" }).click();
  await expect(page.getByText("“E2E pick: note edited.”")).toBeVisible();
  await page.getByRole("button", { name: "Remove" }).click();
  await page.getByRole("button", { name: "Remove" }).click();
  await expect(page.getByRole("heading", { name: "Picks (0)" })).toBeVisible();
});

test("a club lead gives a title its club verdict, changes it and removes it", async ({
  page,
  browser,
}) => {
  // A title without a club verdict yet, so this never touches a real one.
  const catalog = await page.request.get("/api/media?sort=popularity&limit=50");
  const { items } = (await catalog.json()) as {
    items: { id: number; club: { verdict: string | null } }[];
  };
  const title = items.find((item) => item.club.verdict === null);
  expect(title, "the catalog should have a title without a club verdict").toBeDefined();
  const path = `/media/${String(title?.id)}`;

  await page.goto(path);
  await page.waitForLoadState("networkidle");
  // Not checking the starting text: after an interrupted run, the site may briefly show
  // a cached copy. Each click below refreshes it.
  const verdict = page.getByRole("region", { name: "Club verdict" });
  // The radios are visually hidden inside their labels, so click the label, as people do.
  const pickVerdict = (name: string) =>
    verdict.locator("label", { has: page.getByRole("radio", { name }) }).click();
  const saveButton = verdict.getByRole("button", { name: /Give this verdict|Save changes/ });
  await pickVerdict("Go for it");
  await verdict.getByLabel(/Why this verdict/).fill("E2E: sharp writing,\nand it never drags.");
  await saveButton.click();
  await expect(verdict.getByText("Saved. The club can see it now.")).toBeVisible();
  const { lead } = accounts();
  await expect(verdict.getByText(`Given by @${lead.username}`, { exact: false })).toBeVisible();
  await expect(verdict.getByRole("blockquote")).toHaveText(
    "E2E: sharp writing,\nand it never drags.",
  );

  const { violations } = await new AxeBuilder({ page })
    .include("#club-verdict-heading")
    .include("section:has(#club-verdict-heading)")
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
    .analyze();
  expect(violations.map((v) => v.id)).toEqual([]);

  // Everyone else sees it and the reason, without the lead's form.
  const visitor = await browser.newContext({ storageState: { cookies: [], origins: [] } });
  const guest = await visitor.newPage();
  await guest.goto(path);
  const seen = guest.getByRole("region", { name: "Club verdict" });
  await expect(seen.getByText("Go for it", { exact: true })).toBeVisible();
  await expect(seen.getByText(/E2E: sharp writing/)).toBeVisible();
  await expect(seen.getByRole("radio")).toHaveCount(0);
  await expect(seen.getByRole("button")).toHaveCount(0);
  await visitor.close();

  // Change it; then take it back.
  await pickVerdict("Perfection");
  await saveButton.click();
  await expect(verdict.getByText("Saved. The club can see it now.")).toBeVisible();
  await expect(verdict.getByText("Perfection", { exact: true }).first()).toBeVisible();
  await verdict.getByRole("button", { name: "Remove the club verdict" }).click();
  await expect(verdict.getByText("The club lead hasn't given a verdict yet.")).toBeVisible();
  await expect(verdict.getByRole("blockquote")).toHaveCount(0);
});
