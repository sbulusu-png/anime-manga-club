import { expect, test } from "@playwright/test";

import { LEAD_STATE } from "./accounts";

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
