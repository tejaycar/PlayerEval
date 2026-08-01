import { test, expect } from '@playwright/test';

test('setup flow works end-to-end', async ({ page }) => {
  test.skip(!process.env.BASE_URL, 'Requires deployed backend');
  await page.goto('/setup');
  await expect(page.locator('h2')).toContainText('Create Your Team');

  await page.fill('input[placeholder*="Wildcats"]', 'Test Eagles');
  await page.fill('input[placeholder*="full name"]', 'Coach Test');
  await page.fill('input[placeholder*="you@"]', 'test-setup@example.com');
  await page.click('button:has-text("Create Team")');

  // Should redirect to lead dashboard
  await expect(page).toHaveURL(/\/lead\/players/, { timeout: 10000 });
  await expect(page.locator('h2')).toContainText('Players');
});
