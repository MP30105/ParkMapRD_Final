const { test, expect } = require('@playwright/test');

// Requires: frontend build served on port 5000 and backend running.

test('user can login with demo account', async ({ page }) => {
  await page.goto('/');
  // Open login modal
  await page.getByRole('button', { name: 'Login' }).click();
  await expect(page.getByText('Iniciar sesión')).toBeVisible();

  // Fill credentials
  await page.locator('input[name="username"]').fill('demo');
  await page.locator('input[name="password"]').fill('testpass');
  await page.getByRole('button', { name: 'Entrar' }).click();

  // Expect user info appears
  await expect(page.locator('.user-email')).toContainText('demo');
});
