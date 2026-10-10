import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

import { setSignInCode, withDb } from "./db";

test("a new member signs up, confirms their email and signs in with their username", async ({
  page,
}) => {
  const id = Math.random().toString(36).slice(2, 8);
  const username = `e2e_new_${id}`;
  const email = `e2e-new-${id}@example.com`;
  const password = `e2e ${id} paper crane river`;

  await page.goto("/sign-up?next=/for-you");
  await page.getByLabel("Username").fill(username);
  await expect(page.getByText(`@${username} is free`)).toBeVisible();
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page.getByRole("heading", { name: "Check your inbox" })).toBeVisible();

  // Signing in before confirming explains what to do (and resends the link).
  await page.goto("/sign-in?next=/for-you");
  await page.getByLabel("Email or username").fill(username);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByText("Please confirm your email first")).toBeVisible();

  // The confirmation email can't reach example.com; confirm as the link would.
  await withDb((db) =>
    db.query("update users set email_verified = true where email = $1", [email]),
  );

  // Sign-in is limited to 3 tries per 10 seconds per visitor.
  await page.waitForTimeout(10_500);
  await page.getByRole("button", { name: "Sign in" }).click();

  // Then the code we email, every time.
  await expect(page.getByRole("heading", { name: "Check your email" })).toBeVisible({
    timeout: 30_000,
  });
  const { violations } = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
    .analyze();
  expect(violations).toEqual([]);

  // Leaving without the code counts as signed out: "Sign in" shows the form, and
  // members-only pages send them there too.
  await page.getByRole("banner").getByRole("link", { name: "Sign in" }).click();
  await expect(page.getByRole("heading", { name: "Welcome back" })).toBeVisible();
  await page.goto("/for-you");
  await expect(page).toHaveURL(/\/sign-in\?next=%2Ffor-you/);
  await page.goto("/verify-sign-in?next=/for-you");
  await page.waitForLoadState("networkidle");

  await setSignInCode(email, "135790");
  await page.getByLabel("Sign-in code").fill("000000");
  await page.getByRole("button", { name: "Verify and sign in" }).click();
  await expect(page.getByText("That code isn't right. 4 tries left.")).toBeVisible();
  await page.getByLabel("Sign-in code").fill("135790");
  await page.getByRole("button", { name: "Verify and sign in" }).click();
  // The dev server may compile the page on first visit.
  await expect(page).toHaveURL("/for-you", { timeout: 30_000 });
  await expect(page.getByRole("heading", { level: 1, name: "For you" })).toBeVisible();
  await expect(page.getByRole("banner").getByText(username)).toBeVisible();
});

test("only university emails can join", async ({ page }) => {
  await page.goto("/sign-up");
  await page.getByLabel("Username").fill(`e2e_out_${Math.random().toString(36).slice(2, 8)}`);
  await page.getByLabel("University email").fill("someone@gmail.com");
  await page.getByLabel("Password", { exact: true }).fill("e2e outsider paper crane river");
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page.getByText(/That's not a valid email for the club/)).toBeVisible();
});

test("a wrong password is refused with a clear message", async ({ page }) => {
  await page.goto("/sign-in");
  await page.getByLabel("Email or username").fill("e2e-nobody@example.com");
  await page.getByLabel("Password", { exact: true }).fill("not the right password");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByText(/That email and password don't match/)).toBeVisible();
});
