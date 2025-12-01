const { test, expect } = require('@playwright/test');

// A very small smoke test: load the built frontend and check the map container shows
// Note: The frontend build must be served (e.g., `npx serve -s build -l 5000`) before running this.

test('homepage has the map and sidebar', async ({ page }) => {
  await page.goto('/');
  // Sidebar should exist
  const sidebar = await page.locator('.sidebar-wrap');
  await expect(sidebar).toBeVisible();

  // Map container is expected to be present
  const map = await page.locator('.leaflet-container');
  await expect(map).toBeVisible();

  // There should be at least one marker element (div.marker-dot)
  const marker = await page.locator('.marker-dot');
  await expect(marker.first()).toBeVisible();
});
