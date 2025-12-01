const { test, expect } = require('@playwright/test');

// Simulate an outdated stored version and verify update prompt appears.

test('PWA manager shows update button on version mismatch', async ({ page }) => {
  // Set old version before load
  await page.addInitScript(() => {
    window.localStorage.setItem('appVersion', '0.0.0');
  });
  await page.goto('/');
  // Expand PWA manager panel
  const toggleBtn = page.locator('.pwa-manager button').first();
  await toggleBtn.click();
  // Wait for version fetch
  await page.waitForTimeout(2000);
  // Expect update button if server version differs
  const updateButton = page.getByRole('button', { name: /Actualizar versión/ });
  await expect(updateButton).toBeVisible();
});
