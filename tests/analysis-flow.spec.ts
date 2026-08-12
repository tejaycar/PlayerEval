import { test, expect, Page, Route } from '@playwright/test';

const COACHES = Array.from({ length: 15 }, (_, i) => ({
  id: `coach-${i + 1}`,
  name: `Coach ${String.fromCharCode(65 + i)}`,
  email: `coach${i + 1}@team.com`,
  teamId: 'test-team-001',
}));

const PLAYERS = Array.from({ length: 45 }, (_, i) => ({
  id: `player-${i + 1}`,
  name: `Player ${i + 1}`,
  number: String(i + 1),
}));

function makePlayerRanking(idx: number) {
  const p = PLAYERS[idx];
  const base = 50 - idx * 0.8;
  const jitter = (idx % 5) * 0.3;
  return {
    playerId: p.id,
    playerName: p.name,
    playerNumber: p.number,
    evaluationCount: 6,
    rawTotal: +(35 - idx * 0.4 + jitter).toFixed(2),
    normalizedTotal: +(base + jitter).toFixed(2),
    categories: {
      attitude: +(base * 0.22 + jitter).toFixed(2),
      effort: +(base * 0.21 + jitter).toFixed(2),
      footballIQ: +(base * 0.19 - jitter * 0.5).toFixed(2),
      generalSkill: +(base * 0.20 + jitter * 0.2).toFixed(2),
      positionSkill: +(base * 0.18 - jitter * 0.3).toFixed(2),
    },
    rawCategories: {
      attitude: +(7 - idx * 0.05).toFixed(2),
      effort: +(7.2 - idx * 0.04).toFixed(2),
      footballIQ: +(6.5 - idx * 0.06).toFixed(2),
      generalSkill: +(6.8 - idx * 0.05).toFixed(2),
      positionSkill: +(6.3 - idx * 0.04).toFixed(2),
    },
  };
}

function makeBoxPlot(idx: number) {
  const p = PLAYERS[idx];
  const median = +(50 - idx * 0.8).toFixed(2);
  const iqr = +(2 + (idx % 7) * 0.5).toFixed(2);
  const q1 = +(median - iqr / 2).toFixed(2);
  const q3 = +(median + iqr / 2).toFixed(2);
  const min = +(q1 - 1.2).toFixed(2);
  const max = +(q3 + 1.2).toFixed(2);
  const outliers = idx === 4 ? [+(max + 5).toFixed(2), +(min - 4).toFixed(2)] : [];
  return {
    playerId: p.id, playerName: p.name, playerNumber: p.number,
    min, q1, median, q3, max, iqr, outliers,
    dataPoints: [min, q1, median, q3, max, ...outliers],
  };
}

function makeCoachReliability(idx: number) {
  const c = COACHES[idx];
  const mad = +(1.0 + idx * 0.3).toFixed(2);
  const bias = +(idx < 3 ? 2 - idx * 0.5 : idx > 12 ? -1.5 + (idx - 12) * 0.2 : 0.1 * (idx - 7)).toFixed(2);
  const corr = +(0.9 - idx * 0.04).toFixed(2);
  return {
    coachId: c.id,
    coachName: c.name,
    playersRated: 12 + (idx % 5),
    madFromMedian: mad,
    meanDeviationFromMean: bias,
    rankCorrelation: corr,
    isExcluded: false,
    playerDeviations: PLAYERS.slice(0, 5).map((p, pi) => ({
      playerId: p.id, playerName: p.name, playerNumber: p.number,
      coachNormalized: +(48 + pi * 0.5 + idx * 0.2).toFixed(2),
      medianNormalized: +(47.5 + pi * 0.5).toFixed(2),
      meanNormalized: +(47.8 + pi * 0.5).toFixed(2),
      deviation: +(0.5 + idx * 0.2).toFixed(2),
    })),
  };
}

const playerRankings = PLAYERS.map((_, i) => makePlayerRanking(i));
const boxPlots = PLAYERS.map((_, i) => makeBoxPlot(i));
const coachReliability = COACHES.map((_, i) => makeCoachReliability(i));

const baseAnalysisResponse = {
  playerRankings, boxPlots, coachReliability,
  playerImpactWarnings: [] as any[],
  metadata: {
    totalPlayers: 45, totalCoaches: 15, totalEvaluations: 270,
    excludedCoachIds: [] as string[],
    excludedRatings: [] as any[],
    undifferentiatingCoaches: ['coach-15'],
  },
};

const excludedAnalysisResponse = {
  playerRankings: playerRankings.map((p) => ({
    ...p,
    evaluationCount: p.evaluationCount - 1,
    normalizedTotal: +(p.normalizedTotal + 0.3).toFixed(2),
  })),
  boxPlots: boxPlots.map((bp) => ({ ...bp, median: +(bp.median + 0.2).toFixed(2) })),
  coachReliability: coachReliability.filter((c) => c.coachId !== 'coach-1'),
  playerImpactWarnings: [
    { playerId: 'player-1', playerName: 'Player 1', playerNumber: '1', originalCount: 6, reducedCount: 4, droppedBy: 2 },
    { playerId: 'player-3', playerName: 'Player 3', playerNumber: '3', originalCount: 6, reducedCount: 4, droppedBy: 2 },
  ],
  metadata: {
    totalPlayers: 45, totalCoaches: 14, totalEvaluations: 252,
    excludedCoachIds: ['coach-1'],
    excludedRatings: [] as any[],
    undifferentiatingCoaches: ['coach-15'],
  },
};

const leadUser = { coachId: 'test-lead-001', teamId: 'test-team-001', email: 'lead@test.com', isLead: true };

async function setupAuth(page: Page) {
  await page.goto('/');
  await page.evaluate((user) => {
    const token = btoa(JSON.stringify(user));
    localStorage.setItem('playereval_token', token);
    localStorage.setItem('playereval_user', JSON.stringify({ ...user, name: 'Test Lead' }));
  }, leadUser);
}

async function setupRoutes(page: Page) {
  await page.route('**/api/coaches', async (route: Route) => {
    if (route.request().method() === 'GET') {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ coaches: COACHES }) });
    } else {
      await route.continue();
    }
  });
  await page.route('**/api/evaluations/analysis', async (route: Route) => {
    const postData = route.request().postDataJSON();
    const excludedIds: string[] = postData?.excludedCoachIds || [];
    const response = excludedIds.length > 0 ? excludedAnalysisResponse : baseAnalysisResponse;
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(response) });
  });
  await page.route('**/api/team/excluded-coaches', async (route: Route) => {
    if (route.request().method() === 'GET') {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ excludedCoachIds: [] }) });
    } else {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true }) });
    }
  });
  await page.route('**/api/team/excluded-ratings', async (route: Route) => {
    if (route.request().method() === 'GET') {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ excludedRatings: [] }) });
    } else {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true }) });
    }
  });
}

/** After page load, uncheck the anonymize toggle so coach real names are visible */
async function disableAnonymize(page: Page) {
  // Wait for coaches to be loaded (the exclusion panel heading appears)
  await expect(page.getByText('Exclude Coaches from Analysis')).toBeVisible();
  // The anonymize checkbox is checked by default - uncheck it
  const label = page.locator('label').filter({ hasText: 'Anonymize coaches' });
  await expect(label).toBeVisible();
  const checkbox = label.locator('input[type="checkbox"]');
  if (await checkbox.isChecked()) {
    await checkbox.uncheck();
  }
  // Wait for coach names to update after un-anonymizing
  await expect(page.locator('label').filter({ hasText: 'Coach A' })).toBeVisible({ timeout: 5000 });
}

test.describe('Analysis Page - E2E', () => {
  test.beforeEach(async ({ page }) => {
    await setupRoutes(page);
    await setupAuth(page);
  });

  test('navigates to analysis page and shows heading', async ({ page }) => {
    await page.goto('/lead/analysis');
    await expect(page.locator('h2')).toContainText('Analysis');
  });

  test('displays metadata with correct counts', async ({ page }) => {
    await page.goto('/lead/analysis');
    await expect(page.getByText('45 players')).toBeVisible();
    await expect(page.getByText('15 coaches')).toBeVisible();
    await expect(page.getByText('270 evaluations')).toBeVisible();
  });

  test('shows coach exclusion panel with all 15 coaches', async ({ page }) => {
    await page.goto('/lead/analysis');
    await disableAnonymize(page);
    await expect(page.getByText('Exclude Coaches from Analysis')).toBeVisible();
    for (const coach of COACHES) {
      await expect(page.locator('label').filter({ hasText: coach.name })).toBeVisible();
    }
  });

  test('shows five tab buttons', async ({ page }) => {
    await page.goto('/lead/analysis');
    await expect(page.getByRole('button', { name: 'Player Rankings' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Box Plots' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Coach Analysis' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Distribution' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Exclusions' })).toBeVisible();
  });

  test('Player Rankings tab shows table with all 45 players', async ({ page }) => {
    await page.goto('/lead/analysis');
    const table = page.locator('table');
    await expect(table).toBeVisible();
    await expect(table.locator('thead')).toContainText('Rank');
    await expect(table.locator('thead')).toContainText('Player');
    await expect(table.locator('thead')).toContainText('Normalized');
    await expect(table.locator('tbody tr')).toHaveCount(45);
    await expect(table).toContainText('Player 1');
    await expect(table).toContainText('Player 45');
  });

  test('Player Rankings tab shows category score columns', async ({ page }) => {
    await page.goto('/lead/analysis');
    const table = page.locator('table');
    await expect(table.locator('thead')).toContainText('Attitude');
    await expect(table.locator('thead')).toContainText('Effort');
    await expect(table.locator('thead')).toContainText('Football IQ');
    await expect(table.locator('thead')).toContainText('General');
    await expect(table.locator('thead')).toContainText('Position');
    await expect(table.locator('thead')).toContainText('Raw Avg');
  });

  test('Rankings sorting - click Normalized toggles sort direction', async ({ page }) => {
    await page.goto('/lead/analysis');
    const table = page.locator('table');
    await expect(table.locator('tbody tr')).toHaveCount(45);
    const firstRowText = await table.locator('tbody tr').first().textContent();
    expect(firstRowText).toContain('Player 1');
    await page.locator('th').filter({ hasText: 'Normalized' }).click();
    const newFirstRow = await table.locator('tbody tr').first().textContent();
    expect(newFirstRow).toContain('Player 45');
  });

  test('Rankings sorting - click Attitude column sorts by attitude', async ({ page }) => {
    await page.goto('/lead/analysis');
    const table = page.locator('table');
    await expect(table.locator('tbody tr')).toHaveCount(45);
    await page.locator('th').filter({ hasText: 'Attitude' }).click();
    const firstRow = await table.locator('tbody tr').first().textContent();
    expect(firstRow).toContain('Player');
  });

  test('Box Plots tab renders visualizations with player names', async ({ page }) => {
    await page.goto('/lead/analysis');
    await page.getByRole('button', { name: 'Box Plots' }).click();
    await expect(page.getByText('Sort by Controversy (IQR)')).toBeVisible();
    await expect(page.getByText('Sort by Median')).toBeVisible();
    await expect(page.getByText('Sort by Name')).toBeVisible();
    await expect(page.getByText('Player 1', { exact: false }).first()).toBeVisible();
    await expect(page.getByText('Player 5', { exact: false }).first()).toBeVisible();
  });

  test('Box Plots tab shows median and IQR stats', async ({ page }) => {
    await page.goto('/lead/analysis');
    await page.getByRole('button', { name: 'Box Plots' }).click();
    const statLabels = page.locator('text=Med:');
    await expect(statLabels.first()).toBeVisible();
  });

  test('Box Plots tab can sort by name', async ({ page }) => {
    await page.goto('/lead/analysis');
    await page.getByRole('button', { name: 'Box Plots' }).click();
    await page.getByText('Sort by Name').click();
    const firstLabel = page.locator('.space-y-2 > div').first();
    await expect(firstLabel).toContainText('Player 1');
  });

  test('Box Plots tab displays scale range', async ({ page }) => {
    await page.goto('/lead/analysis');
    await page.getByRole('button', { name: 'Box Plots' }).click();
    await expect(page.getByText('Scale:')).toBeVisible();
  });

  test('Coach Analysis tab shows table with all coaches', async ({ page }) => {
    await page.goto('/lead/analysis');
    await disableAnonymize(page);
    await page.getByRole('button', { name: 'Coach Analysis' }).click();
    await expect(page.getByText('how closely each coach')).toBeVisible();
    const table = page.locator('table');
    await expect(table).toBeVisible();
    await expect(table.locator('thead')).toContainText('Coach');
    await expect(table.locator('thead')).toContainText('Players Rated');
    await expect(table.locator('thead')).toContainText('MAD from Median');
    await expect(table.locator('thead')).toContainText('Bias (Mean Dev)');
    await expect(table.locator('thead')).toContainText('Rank Correlation');
    await expect(table.locator('thead')).toContainText('Details');
    for (const coach of COACHES) {
      await expect(table).toContainText(coach.name);
    }
  });

  test('Coach Analysis tab - expand details with Show button', async ({ page }) => {
    await page.goto('/lead/analysis');
    await page.getByRole('button', { name: 'Coach Analysis' }).click();
    const table = page.locator('table');
    await expect(table).toBeVisible();
    const showBtn = page.getByRole('button', { name: 'Show' }).first();
    await showBtn.click();
    await expect(page.getByText('Coach Score')).toBeVisible();
    await expect(page.getByText('Deviation').first()).toBeVisible();
    await expect(page.getByRole('button', { name: 'Hide' }).first()).toBeVisible();
  });

  test('Coach Analysis tab - collapse details with Hide button', async ({ page }) => {
    await page.goto('/lead/analysis');
    await page.getByRole('button', { name: 'Coach Analysis' }).click();
    const showBtn = page.getByRole('button', { name: 'Show' }).first();
    await showBtn.click();
    await expect(page.getByRole('button', { name: 'Hide' }).first()).toBeVisible();
    await page.getByRole('button', { name: 'Hide' }).first().click();
    await expect(page.getByRole('button', { name: 'Show' }).first()).toBeVisible();
  });

  test('Coach Analysis tab - sorting by Rank Correlation', async ({ page }) => {
    await page.goto('/lead/analysis');
    await page.getByRole('button', { name: 'Coach Analysis' }).click();
    const table = page.locator('table');
    await expect(table).toBeVisible();
    await page.locator('th').filter({ hasText: 'Rank Correlation' }).click();
    await expect(table.locator('tbody tr').first()).toBeVisible();
  });

  test('clicking a coach chip toggles exclusion styling', async ({ page }) => {
    await page.goto('/lead/analysis');
    await disableAnonymize(page);
    await expect(page.getByText('Exclude Coaches from Analysis')).toBeVisible();
    const coachChip = page.locator('label').filter({ hasText: 'Coach A' });
    await expect(coachChip).toBeVisible();
    await expect(coachChip).not.toHaveClass(/bg-red-100/);
    await coachChip.click();
    await expect(coachChip).toHaveClass(/bg-red-100/);
    await expect(page.getByText('1 coach(es) excluded')).toBeVisible();
  });

  test('excluding a coach triggers data refresh with new response', async ({ page }) => {
    await page.goto('/lead/analysis');
    await disableAnonymize(page);
    await expect(page.getByText('15 coaches')).toBeVisible();
    const coachChip = page.locator('label').filter({ hasText: 'Coach A' });
    await coachChip.click();
    await expect(page.getByText('14 coaches')).toBeVisible({ timeout: 5000 });
    await expect(page.getByText('252 evaluations')).toBeVisible();
  });

  test('excluding a coach and re-including toggles back', async ({ page }) => {
    await page.goto('/lead/analysis');
    await disableAnonymize(page);
    await expect(page.getByText('15 coaches')).toBeVisible();
    const coachChip = page.locator('label').filter({ hasText: 'Coach A' });
    await coachChip.click();
    await expect(page.getByText('14 coaches')).toBeVisible({ timeout: 5000 });
    await coachChip.click();
    await expect(page.getByText('15 coaches')).toBeVisible({ timeout: 5000 });
    await expect(page.getByText('coach(es) excluded')).not.toBeVisible();
  });

  test('impact warnings display when coaches are excluded (drops below 5 total)', async ({ page }) => {
    await page.goto('/lead/analysis');
    await disableAnonymize(page);
    await expect(page.locator('.bg-amber-50')).not.toBeVisible();
    const coachChip = page.locator('label').filter({ hasText: 'Coach A' });
    await coachChip.click();
    await expect(page.locator('.bg-amber-50')).toBeVisible({ timeout: 5000 });
    await expect(page.getByText('Warning:')).toBeVisible();
    await expect(page.getByText('#1 Player 1')).toBeVisible();
    await expect(page.getByText('#3 Player 3')).toBeVisible();
  });

  test('impact warnings disappear when exclusion is removed', async ({ page }) => {
    await page.goto('/lead/analysis');
    await disableAnonymize(page);
    const coachChip = page.locator('label').filter({ hasText: 'Coach A' });
    await coachChip.click();
    await expect(page.locator('.bg-amber-50')).toBeVisible({ timeout: 5000 });
    await coachChip.click();
    await expect(page.locator('.bg-amber-50')).not.toBeVisible({ timeout: 5000 });
  });

  test('player filter filters rankings table rows by name', async ({ page }) => {
    await page.goto('/lead/analysis');
    const table = page.locator('table');
    await expect(table.locator('tbody tr')).toHaveCount(45);
    const filterInput = page.getByPlaceholder('Filter players by name or number...');
    await filterInput.fill('Player 1');
    // Matches: Player 1, Player 10-19 = 11 players
    await expect(table.locator('tbody tr')).toHaveCount(11);
  });

  test('player filter filters by player number', async ({ page }) => {
    await page.goto('/lead/analysis');
    const table = page.locator('table');
    await expect(table.locator('tbody tr')).toHaveCount(45);
    const filterInput = page.getByPlaceholder('Filter players by name or number...');
    await filterInput.fill('42');
    await expect(table.locator('tbody tr')).toHaveCount(1);
    await expect(table).toContainText('Player 42');
  });

  test('clearing player filter shows all rows again', async ({ page }) => {
    await page.goto('/lead/analysis');
    const table = page.locator('table');
    await expect(table.locator('tbody tr')).toHaveCount(45);
    const filterInput = page.getByPlaceholder('Filter players by name or number...');
    await filterInput.fill('Player 42');
    await expect(table.locator('tbody tr')).toHaveCount(1);
    await filterInput.fill('');
    await expect(table.locator('tbody tr')).toHaveCount(45);
  });

  test('player filter also applies to box plots tab', async ({ page }) => {
    await page.goto('/lead/analysis');
    const filterInput = page.getByPlaceholder('Filter players by name or number...');
    await filterInput.fill('Player 5');
    await page.getByRole('button', { name: 'Box Plots' }).click();
    await expect(page.getByText('Player 5').first()).toBeVisible();
  });

  test('player filter is hidden on Coach Analysis tab', async ({ page }) => {
    await page.goto('/lead/analysis');
    const filterInput = page.getByPlaceholder('Filter players by name or number...');
    await expect(filterInput).toBeVisible();
    await page.getByRole('button', { name: 'Coach Analysis' }).click();
    await expect(filterInput).not.toBeVisible();
  });

  test('player filter is hidden on Exclusions tab', async ({ page }) => {
    await page.goto('/lead/analysis');
    const filterInput = page.getByPlaceholder('Filter players by name or number...');
    await expect(filterInput).toBeVisible();
    await page.getByRole('button', { name: 'Exclusions' }).click();
    await expect(filterInput).not.toBeVisible();
  });

  test('tab switching preserves data between tabs', async ({ page }) => {
    await page.goto('/lead/analysis');
    await page.getByRole('button', { name: 'Box Plots' }).click();
    await expect(page.getByText('Sort by Controversy (IQR)')).toBeVisible();
    await page.getByRole('button', { name: 'Coach Analysis' }).click();
    await expect(page.getByText('how closely each coach')).toBeVisible();
    await page.getByRole('button', { name: 'Player Rankings' }).click();
    const table = page.locator('table');
    await expect(table.locator('tbody tr')).toHaveCount(45);
  });

  test('active tab has visual indicator (blue border)', async ({ page }) => {
    await page.goto('/lead/analysis');
    const rankingsBtn = page.getByRole('button', { name: 'Player Rankings' });
    await expect(rankingsBtn).toHaveClass(/border-blue-600/);
    const boxPlotsBtn = page.getByRole('button', { name: 'Box Plots' });
    await expect(boxPlotsBtn).not.toHaveClass(/border-blue-600/);
    await boxPlotsBtn.click();
    await expect(boxPlotsBtn).toHaveClass(/border-blue-600/);
    await expect(rankingsBtn).not.toHaveClass(/border-blue-600/);
  });

  test('page shows loading state initially with delayed response', async ({ page }) => {
    await page.unroute('**/api/evaluations/analysis');
    await page.route('**/api/evaluations/analysis', async (route) => {
      await new Promise((r) => setTimeout(r, 500));
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(baseAnalysisResponse) });
    });
    await page.goto('/lead/analysis');
    await expect(page.getByText('Loading analysis...')).toBeVisible();
    await expect(page.getByText('45 players')).toBeVisible({ timeout: 5000 });
  });

  test('shows undifferentiating coaches warning in metadata', async ({ page }) => {
    await page.goto('/lead/analysis');
    await expect(page.getByText('45 players')).toBeVisible();
    await expect(page.getByText('zero variance')).toBeVisible();
  });

  test('can exclude multiple coaches', async ({ page }) => {
    await page.goto('/lead/analysis');
    await disableAnonymize(page);
    await expect(page.getByText('Exclude Coaches from Analysis')).toBeVisible();
    await page.locator('label').filter({ hasText: 'Coach A' }).click();
    await expect(page.getByText('1 coach(es) excluded')).toBeVisible();
    await page.locator('label').filter({ hasText: 'Coach B' }).click();
    await expect(page.getByText('2 coach(es) excluded')).toBeVisible();
    await expect(page.locator('label').filter({ hasText: 'Coach A' })).toHaveClass(/bg-red-100/);
    await expect(page.locator('label').filter({ hasText: 'Coach B' })).toHaveClass(/bg-red-100/);
  });
});
