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

test.describe('Lead Flow', () => {
  test.beforeEach(async ({ page }) => {
    // Set up auth bypass - store token and user in localStorage
    await page.goto('/');
    await page.evaluate((user) => {
      localStorage.setItem('playereval_token', 'test-bypass-token');
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
});

test.describe('Coach Flow', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.evaluate((user) => {
      localStorage.setItem('playereval_token', 'test-bypass-token');
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
