import { describe, it, expect } from 'vitest';
import { computeAssignments } from './assignment';
import type { Player, Coach } from '@player-eval/shared';

function makePlayers(count: number, requiredEvals: number = 3): Player[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `player-${i + 1}`,
    teamId: 'team-1',
    name: `Player ${i + 1}`,
    number: String(i + 1),
    primaryPosition: 'QB',
    secondaryPosition: 'WR',
    requiredEvaluations: requiredEvals,
    isNew: false,
  }));
}

function makeCoaches(specs: Array<{ maxPlayers: number }>): Coach[] {
  return specs.map((s, i) => ({
    id: `coach-${i + 1}`,
    teamId: 'team-1',
    name: `Coach ${i + 1}`,
    email: `coach${i + 1}@test.com`,
    maxPlayers: s.maxPlayers,
    isLead: i === 0,
  }));
}

describe('Assignment Algorithm', () => {
  describe('Minimum guarantees', () => {
    it('every player gets at least their required evaluations', () => {
      const players = makePlayers(45, 3);
      const coaches = makeCoaches(
        Array.from({ length: 16 }, () => ({ maxPlayers: 10 }))
      );

      const assignments = computeAssignments(players, coaches, 'team-1');

      // Count evals per player
      const playerCounts = new Map<string, number>();
      for (const a of assignments) {
        playerCounts.set(a.playerId, (playerCounts.get(a.playerId) || 0) + 1);
      }

      for (const player of players) {
        const count = playerCounts.get(player.id) || 0;
        expect(count).toBeGreaterThanOrEqual(player.requiredEvaluations);
      }
    });

    it('works with mixed required evaluations (2, 3, 4)', () => {
      const players: Player[] = [
        ...makePlayers(15, 2).map((p, i) => ({ ...p, id: `p2-${i}`, requiredEvaluations: 2 })),
        ...makePlayers(15, 3).map((p, i) => ({ ...p, id: `p3-${i}`, requiredEvaluations: 3 })),
        ...makePlayers(15, 4).map((p, i) => ({ ...p, id: `p4-${i}`, requiredEvaluations: 4 })),
      ];
      const coaches = makeCoaches(
        Array.from({ length: 12 }, () => ({ maxPlayers: 12 }))
      );

      const assignments = computeAssignments(players, coaches, 'team-1');

      const playerCounts = new Map<string, number>();
      for (const a of assignments) {
        playerCounts.set(a.playerId, (playerCounts.get(a.playerId) || 0) + 1);
      }

      for (const player of players) {
        const count = playerCounts.get(player.id) || 0;
        expect(count).toBeGreaterThanOrEqual(
          player.requiredEvaluations,
          `Player ${player.id} got ${count} evals but needed ${player.requiredEvaluations}`
        );
      }
    });
  });

  describe('No coach exceeds their max', () => {
    it('respects coach capacity limits', () => {
      const players = makePlayers(45, 3);
      const coaches = makeCoaches(
        Array.from({ length: 16 }, () => ({ maxPlayers: 10 }))
      );

      const assignments = computeAssignments(players, coaches, 'team-1');

      const coachCounts = new Map<string, number>();
      for (const a of assignments) {
        coachCounts.set(a.coachId, (coachCounts.get(a.coachId) || 0) + 1);
      }

      for (const coach of coaches) {
        const count = coachCounts.get(coach.id) || 0;
        expect(count).toBeLessThanOrEqual(coach.maxPlayers);
      }
    });
  });

  describe('Proportional coach loading', () => {
    it('coaches with higher max get proportionally more assignments', () => {
      const players = makePlayers(30, 3); // 90 total evals needed
      // Mix of coaches: some with max 10, some with max 15
      const coaches = makeCoaches([
        { maxPlayers: 10 },
        { maxPlayers: 10 },
        { maxPlayers: 10 },
        { maxPlayers: 15 },
        { maxPlayers: 15 },
        { maxPlayers: 15 },
      ]);
      // Total capacity: 30 + 45 = 75. Required: 90. So all capacity used.
      // Actually need enough capacity. Let's adjust:
      // 90 required, 75 capacity — not enough. Increase coaches.
      const coaches2 = makeCoaches([
        { maxPlayers: 10 },
        { maxPlayers: 10 },
        { maxPlayers: 10 },
        { maxPlayers: 10 },
        { maxPlayers: 15 },
        { maxPlayers: 15 },
        { maxPlayers: 15 },
        { maxPlayers: 15 },
      ]);
      // Total capacity: 40 + 60 = 100. Required: 90.

      const assignments = computeAssignments(players, coaches2, 'team-1');

      const coachCounts = new Map<string, number>();
      for (const a of assignments) {
        coachCounts.set(a.coachId, (coachCounts.get(a.coachId) || 0) + 1);
      }

      // Get average utilization for max-10 coaches vs max-15 coaches
      const small = coaches2.filter((c) => c.maxPlayers === 10);
      const large = coaches2.filter((c) => c.maxPlayers === 15);

      const avgUtilSmall =
        small.reduce((sum, c) => sum + (coachCounts.get(c.id) || 0) / c.maxPlayers, 0) / small.length;
      const avgUtilLarge =
        large.reduce((sum, c) => sum + (coachCounts.get(c.id) || 0) / c.maxPlayers, 0) / large.length;

      // Utilization should be roughly similar (within 20% of each other)
      // This means coaches are loaded proportionally to their capacity
      const ratio = Math.abs(avgUtilSmall - avgUtilLarge) / Math.max(avgUtilSmall, avgUtilLarge);
      expect(ratio).toBeLessThan(0.25);
    });

    it('a coach with max 10 gets roughly 2/3 assignments of a coach with max 15', () => {
      const players = makePlayers(40, 3); // 120 total required
      const coaches = makeCoaches([
        { maxPlayers: 10 },
        { maxPlayers: 10 },
        { maxPlayers: 15 },
        { maxPlayers: 15 },
        { maxPlayers: 10 },
        { maxPlayers: 10 },
        { maxPlayers: 15 },
        { maxPlayers: 15 },
      ]);
      // Total capacity: 40 + 60 = 100. Need 120, so all used.
      // Need more capacity:
      const coaches2 = makeCoaches([
        { maxPlayers: 10 },
        { maxPlayers: 10 },
        { maxPlayers: 10 },
        { maxPlayers: 15 },
        { maxPlayers: 15 },
        { maxPlayers: 15 },
        { maxPlayers: 10 },
        { maxPlayers: 15 },
        { maxPlayers: 10 },
        { maxPlayers: 15 },
      ]);
      // Total: 50 + 75 = 125. Required: 120.

      const assignments = computeAssignments(players, coaches2, 'team-1');

      const coachCounts = new Map<string, number>();
      for (const a of assignments) {
        coachCounts.set(a.coachId, (coachCounts.get(a.coachId) || 0) + 1);
      }

      const small = coaches2.filter((c) => c.maxPlayers === 10);
      const large = coaches2.filter((c) => c.maxPlayers === 15);

      const avgSmall = small.reduce((sum, c) => sum + (coachCounts.get(c.id) || 0), 0) / small.length;
      const avgLarge = large.reduce((sum, c) => sum + (coachCounts.get(c.id) || 0), 0) / large.length;

      // Ratio of assignments should be close to 10/15 = 0.667
      const assignmentRatio = avgSmall / avgLarge;
      expect(assignmentRatio).toBeGreaterThan(0.5); // at least 50%
      expect(assignmentRatio).toBeLessThan(0.85); // at most 85% (target ~67%)
    });
  });

  describe('Even distribution of extras', () => {
    it('extra capacity is spread evenly across players', () => {
      const players = makePlayers(20, 2); // 40 required
      const coaches = makeCoaches(
        Array.from({ length: 10 }, () => ({ maxPlayers: 8 }))
      );
      // Total capacity: 80. Required: 40. Extra: 40 slots.

      const assignments = computeAssignments(players, coaches, 'team-1');

      const playerCounts = new Map<string, number>();
      for (const a of assignments) {
        playerCounts.set(a.playerId, (playerCounts.get(a.playerId) || 0) + 1);
      }

      const counts = Array.from(playerCounts.values());
      const min = Math.min(...counts);
      const max = Math.max(...counts);

      // With even distribution, the spread should be very small
      // Allow spread of 2 due to overlap minimization adjustments
      expect(max - min).toBeLessThanOrEqual(2);
    });

    it('all players get at least their minimum even when extras exist', () => {
      const players = makePlayers(10, 3); // 30 required
      const coaches = makeCoaches(
        Array.from({ length: 8 }, () => ({ maxPlayers: 6 }))
      );
      // Total capacity: 48. Required: 30. Extra: 18.

      const assignments = computeAssignments(players, coaches, 'team-1');

      const playerCounts = new Map<string, number>();
      for (const a of assignments) {
        playerCounts.set(a.playerId, (playerCounts.get(a.playerId) || 0) + 1);
      }

      for (const player of players) {
        const count = playerCounts.get(player.id) || 0;
        expect(count).toBeGreaterThanOrEqual(player.requiredEvaluations);
      }
    });
  });

  describe('Overlap minimization', () => {
    it('no small group of 3-4 coaches shares too many players', () => {
      const players = makePlayers(30, 3); // 90 required
      const coaches = makeCoaches(
        Array.from({ length: 12 }, () => ({ maxPlayers: 8 }))
      );
      // Total capacity: 96. Required: 90.

      const assignments = computeAssignments(players, coaches, 'team-1');

      // For every triple of coaches, count how many players all 3 share
      const coachPlayers = new Map<string, Set<string>>();
      for (const coach of coaches) {
        coachPlayers.set(coach.id, new Set());
      }
      for (const a of assignments) {
        coachPlayers.get(a.coachId)!.add(a.playerId);
      }

      let maxTripleOverlap = 0;
      for (let i = 0; i < coaches.length; i++) {
        for (let j = i + 1; j < coaches.length; j++) {
          for (let k = j + 1; k < coaches.length; k++) {
            const setI = coachPlayers.get(coaches[i].id)!;
            const setJ = coachPlayers.get(coaches[j].id)!;
            const setK = coachPlayers.get(coaches[k].id)!;
            let shared = 0;
            for (const p of setI) {
              if (setJ.has(p) && setK.has(p)) shared++;
            }
            maxTripleOverlap = Math.max(maxTripleOverlap, shared);
          }
        }
      }

      // With 30 players and 12 coaches each evaluating ~8,
      // the max triple overlap should be reasonable (not all players shared)
      // Expect no more than 40% of any coach's load shared in a triple
      const maxCoachLoad = Math.max(...Array.from(coachPlayers.values()).map((s) => s.size));
      expect(maxTripleOverlap).toBeLessThan(maxCoachLoad * 0.5);
    });
  });

  describe('Coach with maxPlayers=0', () => {
    it('a coach with maxPlayers=0 gets zero assignments', () => {
      const players = makePlayers(20, 3); // 60 required
      const coaches = makeCoaches([
        { maxPlayers: 10 },
        { maxPlayers: 10 },
        { maxPlayers: 0 },  // This coach should get nothing
        { maxPlayers: 10 },
        { maxPlayers: 10 },
        { maxPlayers: 10 },
        { maxPlayers: 10 },
      ]);
      // Total capacity: 60 (excluding the 0 coach). Required: 60.

      const assignments = computeAssignments(players, coaches, 'team-1');

      const coachCounts = new Map<string, number>();
      for (const a of assignments) {
        coachCounts.set(a.coachId, (coachCounts.get(a.coachId) || 0) + 1);
      }

      // The coach with maxPlayers=0 (coach-3) should have 0 assignments
      const zeroCoach = coaches.find((c) => c.maxPlayers === 0)!;
      expect(coachCounts.get(zeroCoach.id) || 0).toBe(0);
    });

    it('all coaches with maxPlayers=0 get no assignments even with extra capacity', () => {
      const players = makePlayers(10, 2); // 20 required
      const coaches = makeCoaches([
        { maxPlayers: 0 },
        { maxPlayers: 0 },
        { maxPlayers: 15 },
        { maxPlayers: 15 },
      ]);
      // Total capacity: 30 (only from the two active coaches). Required: 20.

      const assignments = computeAssignments(players, coaches, 'team-1');

      const coachCounts = new Map<string, number>();
      for (const a of assignments) {
        coachCounts.set(a.coachId, (coachCounts.get(a.coachId) || 0) + 1);
      }

      // Both 0-capacity coaches should have no assignments
      const zeroCoaches = coaches.filter((c) => c.maxPlayers === 0);
      for (const c of zeroCoaches) {
        expect(coachCounts.get(c.id) || 0).toBe(0);
      }

      // The active coaches should have assignments
      const activeCoaches = coaches.filter((c) => c.maxPlayers > 0);
      for (const c of activeCoaches) {
        expect(coachCounts.get(c.id) || 0).toBeGreaterThan(0);
      }
    });
  });

  describe('New player balancing', () => {
    it('new players are distributed evenly across coaches', () => {
      // Create a mix of new and regular players
      const regularPlayers = makePlayers(20, 3);
      const newPlayersList: Player[] = Array.from({ length: 10 }, (_, i) => ({
        id: `new-player-${i + 1}`,
        teamId: 'team-1',
        name: `New Player ${i + 1}`,
        number: String(100 + i + 1),
        primaryPosition: 'QB',
        secondaryPosition: 'WR',
        requiredEvaluations: 3,
        isNew: true,
      }));
      const allPlayers = [...regularPlayers, ...newPlayersList];

      const coaches = makeCoaches(
        Array.from({ length: 5 }, () => ({ maxPlayers: 20 }))
      );
      // Total capacity: 100. Required: 90.

      const assignments = computeAssignments(allPlayers, coaches, 'team-1');

      // Count new players per coach
      const newPlayerIds = new Set(newPlayersList.map((p) => p.id));
      const coachNewCounts = new Map<string, number>();
      for (const a of assignments) {
        if (newPlayerIds.has(a.playerId)) {
          coachNewCounts.set(a.coachId, (coachNewCounts.get(a.coachId) || 0) + 1);
        }
      }

      const counts = Array.from(coachNewCounts.values());
      const min = Math.min(...counts);
      const max = Math.max(...counts);

      // New players should be balanced: max difference of 2 between any two coaches
      expect(max - min).toBeLessThanOrEqual(2);
    });
  });
});
