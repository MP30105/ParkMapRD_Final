const { test, expect } = require('@playwright/test');

test('admin can create, edit and delete a parking', async ({ page }) => {
  // Navigate to the running frontend (ensure frontend at :3000 and backend at :4000)
  await page.goto('http://localhost:3000');

  // Login as admin
  await page.fill('input[name="email"]', 'admin@parkmaprd.local');
  await page.fill('input[name="password"]', 'adminpass');
  await page.click('text=Login');

  // Wait for nav and admin button
  await expect(page.locator('text=Admin')).toBeVisible({ timeout: 5000 });
  await page.click('text=Admin');

  // Create a parking
  const id = 'e2e_test_p';
  const name = 'E2E Parking';
  await page.fill('input[placeholder="id"]', id);
  await page.fill('input[placeholder="nombre"]', name);
  await page.fill('input[placeholder="totalSpots"]', '5');
  await page.click('text=Crear parking');

  // Wait for the parking to appear in the list
  await expect(page.locator(`text=${name}`)).toBeVisible({ timeout: 5000 });

  // Edit the parking name inline
  const edited = 'E2E Parking Edited';
  const nameInput = page.locator('input').filter({ hasText: '' }).nth(1); // coarse selector; we'll target by placeholder absence
  // Instead target the input next to the id input by finding the parking block
  const parkRow = page.locator('div').filter({ hasText: id }).first();
  const nameField = parkRow.locator('input').nth(1);
  await nameField.fill(edited);
  // blur to trigger onBlur
  await nameField.press('Tab');

  // Wait for the edited name to appear
  await expect(page.locator(`text=${edited}`)).toBeVisible({ timeout: 5000 });

  // Delete the parking
  page.on('dialog', async dialog => { await dialog.accept(); });
  const deleteButton = parkRow.locator('text=Eliminar');
  await deleteButton.click();

  // Ensure it's gone
  await expect(page.locator(`text=${edited}`)).not.toBeVisible({ timeout: 5000 });
});
