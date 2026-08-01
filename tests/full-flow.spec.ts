import { test, expect } from '@playwright/test';

// Helper to create a base64-encoded auth token for the bypass auth system
function makeToken(coachId: string, teamId: string, email: string, isLead: boolean): string {
  return Buffer.from(JSON.stringify({ coachId, teamId, email, isLead })).toString('base64');
}

// Position pool for realistic player data
const POSITIONS = ['QB', 'RB', 'WR', 'TE', 'OL', 'DL', 'LB', 'CB', 'S', 'K'];

// Generate player data with varied positions and required evaluations
function generatePlayers(count: number) {
  const players = [];
  for (let i = 1; i <= count; i++) {
    const primaryIdx = (i - 1) % POSITIONS.length;
    const secondaryIdx = (i + 3) % POSITIONS.length;
    players.push({
      name: `Player ${String(i).padStart(2, '0')}`,
      number: String(i),
      primary_position: POSITIONS[primaryIdx],
      secondary_position: POSITIONS[secondaryIdx],
      required_evaluations: String(((i - 1) % 3) + 2), // Cycles through 2, 3, 4
    });
  }
  return players;
}

// Generate coach data with sufficient max_players to cover all evaluations
function generateCoaches(count: number, totalRequiredEvals: number) {
  const coaches = [];
  const baseMax = Math.ceil(totalRequiredEvals / count);
  for (let i = 1; i <= count; i++) {
    // Give a bit extra to ensure coverage
    const maxPlayers = i <= (totalRequiredEvals % count) ? baseMax + 1 : baseMax;
    coaches.push({
      name: `Coach ${String(i).padStart(2, '0')}`,
      email: `e2e-coach-${i}@test.com`,
      max_players: String(maxPlayers),
    });
  }
  return coaches;
}

test.describe('Full E2E Flow - 45 Players, 16 Coaches, Assignments, Evaluations', () => {
  // This entire test suite requires a running backend
  test.skip(({ }, testInfo) => !process.env.BASE_URL, 'Requires deployed backend');

  const baseURL = process.env.BASE_URL || '';
  let teamId: string;
  let leadCoachId: string;
  let leadToken: string;
  const uniqueSuffix = Date.now().toString(36);

  // Track created coaches for evaluation phase
  let coachRecords: Array<{ id: string; name: string; email: string }> = [];

  test('create team, players, coaches, assign, and evaluate', async () => {
    // ---- Step 1: Create a team via POST /api/setup ----
    const setupRes = await fetch(`${baseURL}/api/setup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        teamName: `E2E Test Team ${uniqueSuffix}`,
        leadName: 'E2E Lead',
        leadEmail: `e2e-lead-${uniqueSuffix}@test.com`,
      }),
    });
    expect(setupRes.ok).toBeTruthy();
    const setupData = await setupRes.json();
    expect(setupData.teamId).toBeTruthy();
    expect(setupData.coachId).toBeTruthy();

    teamId = setupData.teamId;
    leadCoachId = setupData.coachId;
    leadToken = makeToken(leadCoachId, teamId, `e2e-lead-${uniqueSuffix}@test.com`, true);

    // ---- Step 2: Create 45 players via POST /api/players/upload ----
    const playerData = generatePlayers(45);
    // Calculate total required evaluations for coach capacity
    const totalRequiredEvals = playerData.reduce(
      (sum, p) => sum + parseInt(p.required_evaluations, 10),
      0
    );

    const playersRes = await fetch(`${baseURL}/api/players/upload`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${leadToken}`,
      },
      body: JSON.stringify({ players: playerData }),
    });
    expect(playersRes.ok).toBeTruthy();
    const playersResult = await playersRes.json();
    // Verify players were created (API may return count or array)
    expect(playersResult).toBeTruthy();

    // ---- Step 3: Create 16 coaches via POST /api/coaches/upload ----
    const coachData = generateCoaches(16, totalRequiredEvals);

    const coachesRes = await fetch(`${baseURL}/api/coaches/upload`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${leadToken}`,
      },
      body: JSON.stringify({ coaches: coachData }),
    });
    expect(coachesRes.ok).toBeTruthy();
    const coachesResult = await coachesRes.json();
    expect(coachesResult).toBeTruthy();

    // Get the list of coaches to retrieve their IDs
    const coachListRes = await fetch(`${baseURL}/api/coaches`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${leadToken}`,
      },
    });
    expect(coachListRes.ok).toBeTruthy();
    const coachListData = await coachListRes.json();
    // Filter out the lead coach - we only want the 16 uploaded coaches
    coachRecords = (coachListData.coaches || coachListData).filter(
      (c: any) => c.email !== `e2e-lead-${uniqueSuffix}@test.com`
    );
    expect(coachRecords.length).toBeGreaterThanOrEqual(16);

    // ---- Step 4: Run auto-assignment via POST /api/assignments/auto ----
    const assignRes = await fetch(`${baseURL}/api/assignments/auto`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${leadToken}`,
      },
    });
    expect(assignRes.ok).toBeTruthy();

    // ---- Step 5: Verify assignments were made ----
    const assignmentsRes = await fetch(`${baseURL}/api/assignments`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${leadToken}`,
      },
    });
    expect(assignmentsRes.ok).toBeTruthy();
    const assignmentsData = await assignmentsRes.json();
    const assignments = assignmentsData.assignments || assignmentsData;
    expect(assignments.length).toBeGreaterThan(0);

    // ---- Step 6: For each coach, submit evaluations ----
    let totalEvaluationsSubmitted = 0;

    for (const coach of coachRecords) {
      const coachToken = makeToken(coach.id, teamId, coach.email, false);

      // Get this coach's assigned players
      const myPlayersRes = await fetch(`${baseURL}/api/my-players`, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${coachToken}`,
        },
      });
      expect(myPlayersRes.ok).toBeTruthy();
      const myPlayersData = await myPlayersRes.json();
      const assignedPlayers = myPlayersData.players || myPlayersData;

      // Submit an evaluation for each assigned player
      for (const player of assignedPlayers) {
        const playerId = player.id || player.playerId;
        const evalRes = await fetch(`${baseURL}/api/evaluations`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${coachToken}`,
          },
          body: JSON.stringify({
            playerId,
            attitude: Math.floor(Math.random() * 10) + 1,
            effort: Math.floor(Math.random() * 10) + 1,
            footballIQ: Math.floor(Math.random() * 10) + 1,
            generalSkill: Math.floor(Math.random() * 10) + 1,
            positionSkill: Math.floor(Math.random() * 10) + 1,
          }),
        });
        expect(evalRes.ok).toBeTruthy();
        totalEvaluationsSubmitted++;
      }
    }

    // Verify we submitted a meaningful number of evaluations
    expect(totalEvaluationsSubmitted).toBeGreaterThanOrEqual(totalRequiredEvals);
  });
});
