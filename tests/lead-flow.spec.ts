import { test, expect } from '@playwright/test';

// Test user with bypass auth - simulates a lead user
const leadUser = {
  coachId: 'test-lead-001',
  teamId: 'test-team-001',
  email: 'lead@test.com',
  isLead: true,
};

const coachUser = {
  coachId: 'test-coach-001',
  teamId: 'test-team-001',
  email: 'coach1@test.com',
  isLead: false,
};

function makeBypassToken(user: any): string {
  return btoa(JSON.stringify(user));
}

test.describe('Lead Flow', () => {
  test.beforeEach(async ({ page }) => {
    // Set up auth bypass - store base64 token and user in localStorage
    await page.goto('/');
    await page.evaluate((user) => {
      const token = btoa(JSON.stringify(user));
      localStorage.setItem('playereval_token', token);
      localStorage.setItem('playereval_user', JSON.stringify({ ...user, name: 'Test Lead' }));
    }, leadUser);
  });

  test('can view players page', async ({ page }) => {
    await page.goto('/lead/players');
    await expect(page.locator('h2')).toContainText('Players');
  });

  test('can view coaches page', async ({ page }) => {
    await page.goto('/lead/coaches');
    await expect(page.locator('h2')).toContainText('Coaches');
  });

  test('can view assignments page', async ({ page }) => {
    await page.goto('/lead/assignments');
    await expect(page.locator('h2')).toContainText('Coach Assignments');
  });

  test('can switch between lead and coach view', async ({ page }) => {
    await page.goto('/lead/players');
    await page.click('button:has-text("Switch to Coach View")');
    await expect(page).toHaveURL(/\/coach\//);
  });

  test('can add a player manually', async ({ page }) => {
    // This test requires a running backend - only works against deployed environments
    test.skip(!process.env.BASE_URL, 'Requires deployed backend');
    await page.goto('/lead/players');

    // The new UI uses an editable table with an empty final row for adding players
    // Find the last row in the table (the empty new-player row) and type into its cells
    const newRow = page.locator('table tbody tr').last();
    await newRow.locator('input[placeholder="New player name..."]').fill('Test Player');
    await newRow.locator('input[placeholder="#"]').fill('42');
    await newRow.locator('input[placeholder="Position"]').first().fill('QB');
    await newRow.locator('input[placeholder="Position"]').last().fill('WR');

    // Press Enter to save the new row
    await newRow.locator('input[placeholder="New player name..."]').press('Enter');

    // Player should appear in the table
    await expect(page.locator('table')).toContainText('Test Player');
  });
});

test.describe('Coach Flow', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.evaluate((user) => {
      const token = btoa(JSON.stringify(user));
      localStorage.setItem('playereval_token', token);
      localStorage.setItem('playereval_user', JSON.stringify({ ...user, name: 'Test Coach' }));
    }, coachUser);
  });

  test('can view rate players page', async ({ page }) => {
    await page.goto('/coach/rate');
    await expect(page.locator('h2')).toContainText('Rate Players');
  });

  test('can view results page', async ({ page }) => {
    await page.goto('/coach/results');
    await expect(page.locator('h2')).toContainText('Results Summary');
  });

  test('cannot access lead pages', async ({ page }) => {
    await page.goto('/lead/players');
    // Should redirect to coach view
    await expect(page).toHaveURL(/\/coach\//);
  });
});

test.describe('Auth Flow', () => {
  test('unauthenticated user is redirected to login', async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => {
      localStorage.removeItem('playereval_token');
      localStorage.removeItem('playereval_user');
    });
    await page.goto('/lead/players');
    await expect(page).toHaveURL(/\/login/);
  });

  test('login page renders', async ({ page }) => {
    await page.goto('/login');
    await expect(page.locator('h2')).toContainText('PlayerEval Login');
    await expect(page.locator('input[placeholder="coach@example.com"]')).toBeVisible();
    await expect(page.locator('input[placeholder="Enter PIN"]')).toBeVisible();
    await expect(page.locator('input[placeholder*="team lead"]')).toBeVisible();
  });
});
