const { test, expect } = require('@playwright/test');

// Precondition: backend seeded demo user, build served at :5000

test('create support ticket via widget', async ({ page }) => {
  await page.goto('/');
  // Login first
  await page.getByRole('button', { name: 'Login' }).click();
  await page.locator('input[name="username"]').fill('demo');
  await page.locator('input[name="password"]').fill('testpass');
  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect(page.locator('.user-email')).toContainText('demo');

  // Open chat/support widget
  await page.getByRole('button', { name: '🤖' }).click();
  // Switch to Soporte tab
  await page.getByRole('button', { name: /Soporte/ }).click();
  // Ensure Nuevo Ticket view
  await page.getByRole('button', { name: 'Nuevo Ticket' }).click();

  // Fill ticket form
  await page.getByLabel('Asunto *').fill('Problema de prueba');
  await page.getByLabel('Descripción *').fill('Descripción detallada del problema de prueba para e2e.');
  await page.getByRole('button', { name: 'Crear Ticket' }).click();

  // Expect success message
  await expect(page.getByText(/Ticket creado exitosamente/)).toBeVisible();
});
