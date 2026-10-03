import { test, expect } from "@playwright/test";

test("account loading and unavailable email controls remain distinct", async ({ page }) => {
  await page.route("**/api/account", async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 700));
    await route.fulfill({ json: { state: "signed_out", email: null, emailDeliveryEnabled: false } });
  });
  await page.goto("/account");
  await expect(page.getByText("Checking your account...")).toBeVisible();
  await expect(page.getByRole("button", { name: "Sign in", exact: true })).toBeEnabled();
  await expect(page.getByRole("button", { name: "Create account", exact: true })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Recover password", exact: true })).toBeDisabled();
  await expect(page.getByText("Account service unavailable. Public research remains available.")).toHaveCount(0);
});

test("a failed account service preserves public research navigation", async ({ page }) => {
  await page.route("**/api/account", (route) => route.fulfill({ status: 503, json: { state: "unavailable" } }));
  await page.goto("/account");
  await expect(page.getByText("Account service unavailable. Public research remains available.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Sign in", exact: true })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Terminal", exact: true })).toBeVisible();
});

test("Firebase enables email controls and preserves honest provider failures", async ({ page }) => {
  await page.route("**/api/account", (route) => route.fulfill({ json: { state: "signed_out", firebaseEnabled: true, emailDeliveryEnabled: false } }));
  await page.route("https://identitytoolkit.googleapis.com/**", (route) => route.fulfill({ status: 400, json: { error: { code: 400, message: "INVALID_LOGIN_CREDENTIALS" } } }));
  await page.goto("/account");
  await page.getByRole("textbox", { name: "Email", exact: true }).fill("reader@example.com");
  await page.getByLabel("Password", { exact: true }).fill("test-password-for-fixture");
  await expect(page.getByRole("button", { name: "Create account", exact: true })).toBeEnabled();
  await expect(page.getByRole("button", { name: "Recover password", exact: true })).toBeEnabled();
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("Account request failed");
  await expect(page.getByRole("button", { name: "Clear saved research", exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Use an existing password account", exact: true }).click();
  await expect(page.getByRole("button", { name: "Create account", exact: true })).toBeDisabled();
});
