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
    await page.click('button:has-text("+ Add Player")');
    await page.fill('input[type="text"]:first-of-type', 'Test Player');
    // Fill number field
    const inputs = page.locator('form input[type="text"]');
    await inputs.nth(0).fill('Test Player');
    await inputs.nth(1).fill('42');
    await inputs.nth(2).fill('QB');
    await inputs.nth(3).fill('WR');
    await page.click('button:has-text("Save")');
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
  });

  test('signup page renders with invite code', async ({ page }) => {
    await page.goto('/signup?invite=test123');
    await expect(page.locator('h2')).toContainText('Coach Signup');
    await expect(page.locator('input[placeholder*="Invite code"]')).toHaveValue('test123');
  });
});
