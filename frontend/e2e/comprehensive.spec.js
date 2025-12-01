const { test, expect } = require('@playwright/test');

test.describe('Auto-Checkout System E2E', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to the app
    await page.goto('/');
    
    // Mock geolocation API
    await page.addInitScript(() => {
      window.navigator.geolocation = {
        getCurrentPosition: (success) => {
          success({
            coords: {
              latitude: 18.4861,
              longitude: -69.9312,
              accuracy: 10
            }
          });
        },
        watchPosition: (success) => {
          success({
            coords: {
              latitude: 18.4861,
              longitude: -69.9312,
              accuracy: 10
            }
          });
          return 1;
        },
        clearWatch: () => {}
      };
    });
    
    // Login first
    await page.click('[data-testid="login-button"]');
    await page.fill('[data-testid="email-input"]', 'test@example.com');
    await page.fill('[data-testid="password-input"]', 'password123');
    await page.click('[data-testid="submit-button"]');
    await expect(page.locator('.sidebar')).toBeVisible();
  });

  test('should access auto-checkout from navigation menu', async ({ page }) => {
    // Open navigation menu
    await page.click('[data-testid="nav-menu-button"]');
    
    // Click on auto-checkout option
    await page.click('text=Auto-Checkout');
    
    // Should display auto-checkout interface
    await expect(page.locator('text=Auto-Checkout')).toBeVisible();
    await expect(page.locator('text=Estado')).toBeVisible();
    await expect(page.locator('text=Historial')).toBeVisible();
    await expect(page.locator('text=Notificaciones')).toBeVisible();
  });

  test('should enable location tracking for auto-checkout', async ({ page }) => {
    await page.click('[data-testid="nav-menu-button"]');
    await page.click('text=Auto-Checkout');
    
    // Enable location tracking
    await page.click('text=Habilitar Seguimiento');
    
    // Should show tracking enabled state
    await expect(page.locator('text=Seguimiento Activo')).toBeVisible();
    await expect(page.locator('text=Detener Seguimiento')).toBeVisible();
  });

  test('should perform manual checkout for active tickets', async ({ page }) => {
    await page.click('[data-testid="nav-menu-button"]');
    await page.click('text=Auto-Checkout');
    
    // Wait for active tickets to load
    await page.waitForSelector('[data-testid="active-tickets"]');
    
    // If there are active tickets, test manual checkout
    const ticketExists = await page.locator('[data-testid="manual-checkout-button"]').first().isVisible();
    
    if (ticketExists) {
      await page.click('[data-testid="manual-checkout-button"]');
      
      // Should show confirmation or success message
      await expect(page.locator('text=Checkout exitoso')).toBeVisible({ timeout: 5000 });
    }
  });

  test('should display checkout history', async ({ page }) => {
    await page.click('[data-testid="nav-menu-button"]');
    await page.click('text=Auto-Checkout');
    
    // Switch to history tab
    await page.click('text=Historial');
    
    // Should display history interface
    await expect(page.locator('text=Historial de Salida Automática')).toBeVisible();
    
    // Should have filter options
    await expect(page.locator('[data-testid="history-filter"]')).toBeVisible();
  });

  test('should handle notifications', async ({ page }) => {
    await page.click('[data-testid="nav-menu-button"]');
    await page.click('text=Auto-Checkout');
    
    // Switch to notifications tab
    await page.click('text=Notificaciones');
    
    // Should display notifications interface
    await expect(page.locator('text=Notificaciones de Auto-Checkout')).toBeVisible();
    
    // Should be able to mark notifications as read
    const notificationExists = await page.locator('[data-testid="notification-item"]').first().isVisible();
    
    if (notificationExists) {
      await page.click('[data-testid="mark-read-button"]');
    }
  });
});

test.describe('Search and Comparison E2E', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    
    // Login
    await page.click('[data-testid="login-button"]');
    await page.fill('[data-testid="email-input"]', 'test@example.com');
    await page.fill('[data-testid="password-input"]', 'password123');
    await page.click('[data-testid="submit-button"]');
    await expect(page.locator('.sidebar')).toBeVisible();
  });

  test('should use intelligent search with filters', async ({ page }) => {
    // Open search filters
    await page.click('[data-testid="search-filters-toggle"]');
    
    // Apply filters
    await page.fill('[data-testid="min-price-input"]', '10');
    await page.fill('[data-testid="max-price-input"]', '50');
    
    // Select amenities
    await page.click('[data-testid="amenity-security"]');
    await page.click('[data-testid="amenity-covered"]');
    
    // Apply filters
    await page.click('[data-testid="apply-filters-button"]');
    
    // Should display filtered results
    await expect(page.locator('[data-testid="search-results"]')).toBeVisible();
  });

  test('should add parking to comparison list', async ({ page }) => {
    // Find a parking marker
    const parkingMarker = page.locator('.marker-dot').first();
    await parkingMarker.click();
    
    // Should show parking details popup
    await expect(page.locator('[data-testid="parking-details"]')).toBeVisible();
    
    // Add to comparison
    await page.click('[data-testid="add-to-comparison"]');
    
    // Should show confirmation
    await expect(page.locator('text=Agregado a comparación')).toBeVisible();
  });

  test('should access comparison center', async ({ page }) => {
    await page.click('[data-testid="nav-menu-button"]');
    await page.click('text=Comparar Estacionamientos');
    
    // Should display comparison interface
    await expect(page.locator('text=Centro de Comparación')).toBeVisible();
    
    // Should be able to create new comparison list
    await page.click('[data-testid="create-list-button"]');
    await page.fill('[data-testid="list-name-input"]', 'Mi Lista de Prueba');
    await page.click('[data-testid="save-list-button"]');
    
    await expect(page.locator('text=Mi Lista de Prueba')).toBeVisible();
  });
});

test.describe('Smart Reminders E2E', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    
    // Login
    await page.click('[data-testid="login-button"]');
    await page.fill('[data-testid="email-input"]', 'test@example.com');
    await page.fill('[data-testid="password-input"]', 'password123');
    await page.click('[data-testid="submit-button"]');
    await expect(page.locator('.sidebar')).toBeVisible();
  });

  test('should configure reminder preferences', async ({ page }) => {
    await page.click('[data-testid="nav-menu-button"]');
    await page.click('text=Recordatorios');
    
    // Should display reminders interface
    await expect(page.locator('text=Recordatorios Inteligentes')).toBeVisible();
    
    // Configure preferences
    await page.check('[data-testid="email-enabled"]');
    await page.check('[data-testid="push-enabled"]');
    
    // Set timing preferences
    await page.selectOption('[data-testid="reminder-timing"]', '15');
    
    // Save preferences
    await page.click('[data-testid="save-preferences"]');
    
    await expect(page.locator('text=Preferencias guardadas')).toBeVisible();
  });

  test('should display active reminders', async ({ page }) => {
    await page.click('[data-testid="nav-menu-button"]');
    await page.click('text=Recordatorios');
    
    // Switch to active reminders tab
    await page.click('text=Activos');
    
    // Should display active reminders
    await expect(page.locator('[data-testid="active-reminders"]')).toBeVisible();
  });
});

test.describe('Support System E2E', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    
    // Login
    await page.click('[data-testid="login-button"]');
    await page.fill('[data-testid="email-input"]', 'test@example.com');
    await page.fill('[data-testid="password-input"]', 'password123');
    await page.click('[data-testid="submit-button"]');
    await expect(page.locator('.sidebar')).toBeVisible();
  });

  test('should open chat widget', async ({ page }) => {
    // Click on support chat button
    await page.click('[data-testid="chat-widget-button"]');
    
    // Should display chat interface
    await expect(page.locator('[data-testid="chat-interface"]')).toBeVisible();
    
    // Send a test message
    await page.fill('[data-testid="chat-input"]', 'Hola, necesito ayuda');
    await page.click('[data-testid="send-message"]');
    
    // Should display the message
    await expect(page.locator('text=Hola, necesito ayuda')).toBeVisible();
  });

  test('should create support ticket', async ({ page }) => {
    await page.click('[data-testid="support-button"]');
    
    // Should display support center
    await expect(page.locator('text=Centro de Soporte')).toBeVisible();
    
    // Create new ticket
    await page.click('[data-testid="create-ticket"]');
    await page.selectOption('[data-testid="ticket-category"]', 'technical');
    await page.fill('[data-testid="ticket-subject"]', 'Problema con la aplicación');
    await page.fill('[data-testid="ticket-description"]', 'La aplicación no carga correctamente');
    
    await page.click('[data-testid="submit-ticket"]');
    
    await expect(page.locator('text=Ticket creado exitosamente')).toBeVisible();
  });
});

test.describe('PWA Features E2E', () => {
  test('should work offline', async ({ page, context }) => {
    // Go online first
    await page.goto('/');
    
    // Login
    await page.click('[data-testid="login-button"]');
    await page.fill('[data-testid="email-input"]', 'test@example.com');
    await page.fill('[data-testid="password-input"]', 'password123');
    await page.click('[data-testid="submit-button"]');
    
    // Go offline
    await context.setOffline(true);
    
    // Should still be able to navigate
    await page.reload();
    
    // Should show offline indicator
    await expect(page.locator('[data-testid="offline-indicator"]')).toBeVisible();
    
    // Map should still be visible (cached)
    await expect(page.locator('.leaflet-container')).toBeVisible();
  });

  test('should show install prompt', async ({ page }) => {
    await page.goto('/');
    
    // Mock PWA install prompt
    await page.addInitScript(() => {
      window.addEventListener('beforeinstallprompt', (e) => {
        e.preventDefault();
        window.deferredPrompt = e;
        
        // Trigger install button visibility
        document.dispatchEvent(new CustomEvent('pwa-installable'));
      });
    });
    
    // Trigger the event
    await page.evaluate(() => {
      const event = new Event('beforeinstallprompt');
      event.preventDefault = () => {};
      window.dispatchEvent(event);
    });
    
    // Should show install button
    await expect(page.locator('[data-testid="pwa-install-button"]')).toBeVisible();
  });
});