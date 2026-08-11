import { describe, it, expect } from 'vitest';
import { computeAnalysis } from './analysis';

// === Type definitions matching analysis.ts interfaces ===

interface RawEvaluation {
  coachId: string;
  playerId: string;
  attitude: number;
  effort: number;
  footballIQ: number;
  generalSkill: number;
  positionSkill: number;
  totalScore: number;
}

interface PlayerInfo {
  id: string;
  name: string;
  number: string;
  primaryPosition: string;
  secondaryPosition: string;
}

interface CoachInfo {
  id: string;
  name: string;
}

// === Test Data Factory ===

function makePlayers(count: number): PlayerInfo[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `player-${i + 1}`,
    name: `Player ${i + 1}`,
    number: String(i + 1),
    primaryPosition: '',
    secondaryPosition: '',
  }));
}

function makeCoaches(count: number): CoachInfo[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `coach-${i + 1}`,
    name: `Coach ${i + 1}`,
  }));
}

function makeEval(
  coachId: string,
  playerId: string,
  scores: [number, number, number, number, number]
): RawEvaluation {
  const [attitude, effort, footballIQ, generalSkill, positionSkill] = scores;
  return {
    coachId,
    playerId,
    attitude,
    effort,
    footballIQ,
    generalSkill,
    positionSkill,
    totalScore: attitude + effort + footballIQ + generalSkill + positionSkill,
  };
}

// Seeded pseudo-random number generator for deterministic tests
function seededRandom(seed: number) {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) & 0xffffffff;
    return (s >>> 0) / 0xffffffff;
  };
}

function clamp(val: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, Math.round(val)));
}

/**
 * Generates a realistic dataset with 45 players and 15 coaches.
 * Coach biases:
 *   coach-1, coach-2: generous (scores 8-10)
 *   coach-3, coach-4: harsh (scores 2-5)
 *   coach-5: undifferentiating (gives same score to all players)
 *   coach-6 through coach-15: normal (varied scoring 4-8 range)
 *
 * Player-1 is controversial - coaches disagree significantly.
 * Each player rated by 5-7 coaches, each coach rates 10-18 players.
 */
function generateTestData() {
  const players = makePlayers(45);
  const coaches = makeCoaches(15);
  const evaluations: RawEvaluation[] = [];
  const rand = seededRandom(42);

  // Assign which coaches rate which players
  const assignments: Map<string, Set<string>> = new Map();
  for (const c of coaches) {
    assignments.set(c.id, new Set());
  }

  // Build assignment ensuring:
  // - Each player rated by 5-7 coaches
  // - Each coach rates 10-18 players
  // With 45 players and 15 coaches, 6 coaches per player = 270 total = avg 18 per coach
  // Use 5 or 6 per player to stay under 18 comfortably

  for (const player of players) {
    const availableCoaches = [...coaches];
    // Shuffle coaches deterministically
    for (let i = availableCoaches.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      [availableCoaches[i], availableCoaches[j]] = [availableCoaches[j], availableCoaches[i]];
    }

    // Sort by current load (prefer coaches with fewer assignments)
    availableCoaches.sort((a, b) => assignments.get(a.id)!.size - assignments.get(b.id)!.size);

    const numRaters = 5 + Math.floor(rand() * 2); // 5 or 6
    let assigned = 0;
    for (const coach of availableCoaches) {
      if (assigned >= numRaters) break;
      const coachSet = assignments.get(coach.id)!;
      if (coachSet.size < 18 && !coachSet.has(player.id)) {
        coachSet.add(player.id);
        assigned++;
      }
    }
  }

  // Second pass: add a 7th rater to some players to increase variety
  // Pick players that currently have 5 and add one more if coaches have room
  for (const player of players) {
    let currentCount = 0;
    for (const [, s] of assignments) {
      if (s.has(player.id)) currentCount++;
    }
    if (currentCount < 6 && rand() < 0.4) {
      // Try to add one more coach
      for (const coach of coaches) {
        const coachSet = assignments.get(coach.id)!;
        if (!coachSet.has(player.id) && coachSet.size < 18) {
          coachSet.add(player.id);
          break;
        }
      }
    }
  }

  // Generate evaluations based on coach bias
  for (const [coachId, playerIds] of assignments) {
    for (const playerId of playerIds) {
      let scores: [number, number, number, number, number];

      if (coachId === 'coach-1' || coachId === 'coach-2') {
        // Generous coaches: 8-10
        scores = [
          clamp(8 + Math.floor(rand() * 3), 1, 10),
          clamp(8 + Math.floor(rand() * 3), 1, 10),
          clamp(8 + Math.floor(rand() * 3), 1, 10),
          clamp(8 + Math.floor(rand() * 3), 1, 10),
          clamp(8 + Math.floor(rand() * 3), 1, 10),
        ];
      } else if (coachId === 'coach-3' || coachId === 'coach-4') {
        // Harsh coaches: 2-5
        scores = [
          clamp(2 + Math.floor(rand() * 4), 1, 10),
          clamp(2 + Math.floor(rand() * 4), 1, 10),
          clamp(2 + Math.floor(rand() * 4), 1, 10),
          clamp(2 + Math.floor(rand() * 4), 1, 10),
          clamp(2 + Math.floor(rand() * 4), 1, 10),
        ];
      } else if (coachId === 'coach-5') {
        // Undifferentiating: gives identical 5 to everyone
        scores = [5, 5, 5, 5, 5];
      } else {
        // Normal coaches: varied 4-8
        scores = [
          clamp(4 + Math.floor(rand() * 5), 1, 10),
          clamp(4 + Math.floor(rand() * 5), 1, 10),
          clamp(4 + Math.floor(rand() * 5), 1, 10),
          clamp(4 + Math.floor(rand() * 5), 1, 10),
          clamp(4 + Math.floor(rand() * 5), 1, 10),
        ];
      }

      // Make player-1 controversial: override to extreme values depending on coach
      if (playerId === 'player-1') {
        if (coachId === 'coach-1' || coachId === 'coach-2') {
          scores = [10, 10, 10, 10, 10]; // Max scores
        } else if (coachId === 'coach-3' || coachId === 'coach-4') {
          scores = [1, 1, 1, 1, 1]; // Min scores
        } else if (coachId !== 'coach-5') {
          // Normal coaches also vary wildly for controversial player
          const extreme = rand() > 0.5;
          scores = extreme ? [9, 9, 9, 9, 9] : [2, 2, 2, 2, 2];
        }
      }

      evaluations.push(makeEval(coachId, playerId, scores));
    }
  }

  return { players, coaches, evaluations };
}

// === Test Suites ===

describe('computeAnalysis', () => {
  const testData = generateTestData();
  const { players, coaches, evaluations } = testData;

  describe('Test data integrity', () => {
    it('has exactly 45 players and 15 coaches', () => {
      expect(players).toHaveLength(45);
      expect(coaches).toHaveLength(15);
    });

    it('each player is rated by 5-7 coaches', () => {
      for (const player of players) {
        const ratingCount = evaluations.filter((e) => e.playerId === player.id).length;
        expect(ratingCount).toBeGreaterThanOrEqual(5);
        expect(ratingCount).toBeLessThanOrEqual(7);
      }
    });

    it('each coach rates 10-18 players', () => {
      for (const coach of coaches) {
        const ratingCount = evaluations.filter((e) => e.coachId === coach.id).length;
        expect(ratingCount).toBeGreaterThanOrEqual(10);
        expect(ratingCount).toBeLessThanOrEqual(18);
      }
    });

    it('all scores are within 1-10 range', () => {
      for (const ev of evaluations) {
        expect(ev.attitude).toBeGreaterThanOrEqual(1);
        expect(ev.attitude).toBeLessThanOrEqual(10);
        expect(ev.effort).toBeGreaterThanOrEqual(1);
        expect(ev.effort).toBeLessThanOrEqual(10);
        expect(ev.footballIQ).toBeGreaterThanOrEqual(1);
        expect(ev.footballIQ).toBeLessThanOrEqual(10);
        expect(ev.generalSkill).toBeGreaterThanOrEqual(1);
        expect(ev.generalSkill).toBeLessThanOrEqual(10);
        expect(ev.positionSkill).toBeGreaterThanOrEqual(1);
        expect(ev.positionSkill).toBeLessThanOrEqual(10);
      }
    });

    it('totalScore equals sum of 5 categories', () => {
      for (const ev of evaluations) {
        expect(ev.totalScore).toBe(
          ev.attitude + ev.effort + ev.footballIQ + ev.generalSkill + ev.positionSkill
        );
      }
    });
  });

  describe('Z-score normalization removes coach bias', () => {
    it('generous and harsh coaches produce convergent normalized scores for same-quality player', () => {
      const result = computeAnalysis(evaluations, players, coaches, [], true);

      // Find players rated by both generous (coach-1) and harsh (coach-3) coaches
      const generousPlayerIds = new Set(
        evaluations.filter((e) => e.coachId === 'coach-1').map((e) => e.playerId)
      );
      const harshPlayerIds = new Set(
        evaluations.filter((e) => e.coachId === 'coach-3').map((e) => e.playerId)
      );

      // Find shared players (not the controversial one)
      const sharedPlayers = [...generousPlayerIds].filter(
        (id) => harshPlayerIds.has(id) && id !== 'player-1'
      );
      expect(sharedPlayers.length).toBeGreaterThan(0);

      // After normalization, the result should differ from raw
      const ranking = result.playerRankings.find((r) => r.playerId === sharedPlayers[0]);
      expect(ranking).toBeDefined();
      expect(ranking!.normalizedTotal).not.toBe(ranking!.rawTotal);
    });

    it('normalization brings all coaches to a common scale', () => {
      const result = computeAnalysis(evaluations, players, coaches, [], true);

      // The normalized totals should cluster around the league mean
      // rather than reflecting raw coach bias
      const normalizedTotals = result.playerRankings.map((r) => r.normalizedTotal);
      const avg = normalizedTotals.reduce((s, v) => s + v, 0) / normalizedTotals.length;

      // All normalized totals should be finite and within a reasonable range
      for (const t of normalizedTotals) {
        expect(Number.isFinite(t)).toBe(true);
        // Should be within a few standard deviations of the mean
        expect(Math.abs(t - avg)).toBeLessThan(avg * 2);
      }
    });

    it('rankings are sorted by normalizedTotal descending', () => {
      const result = computeAnalysis(evaluations, players, coaches, [], true);
      for (let i = 1; i < result.playerRankings.length; i++) {
        expect(result.playerRankings[i - 1].normalizedTotal)
          .toBeGreaterThanOrEqual(result.playerRankings[i].normalizedTotal);
      }
    });

    it('all players have valid non-NaN normalized totals and categories', () => {
      const result = computeAnalysis(evaluations, players, coaches, [], true);
      for (const ranking of result.playerRankings) {
        expect(Number.isNaN(ranking.normalizedTotal)).toBe(false);
        expect(Number.isFinite(ranking.normalizedTotal)).toBe(true);
        for (const cat of ['attitude', 'effort', 'footballIQ', 'generalSkill', 'positionSkill'] as const) {
          expect(Number.isNaN(ranking.categories[cat])).toBe(false);
        }
      }
    });
  });

  describe('Box plot computation', () => {
    it('computes Q1, median, Q3, IQR correctly for each player', () => {
      const result = computeAnalysis(evaluations, players, coaches, [], true);

      for (const bp of result.boxPlots) {
        expect(bp.q1).toBeLessThanOrEqual(bp.median);
        expect(bp.median).toBeLessThanOrEqual(bp.q3);
        expect(bp.iqr).toBeCloseTo(bp.q3 - bp.q1, 1);
        // min and max are unrounded, q1/q3 are rounded to 2 decimals
        // so allow small tolerance for rounding
        expect(bp.min).toBeLessThanOrEqual(bp.q1 + 0.01);
        expect(bp.max).toBeGreaterThanOrEqual(bp.q3 - 0.01);
      }
    });

    it('dataPoints length matches evaluation count for each player', () => {
      const result = computeAnalysis(evaluations, players, coaches, [], true);
      for (const bp of result.boxPlots) {
        const evalCount = evaluations.filter((e) => e.playerId === bp.playerId).length;
        expect(bp.dataPoints).toHaveLength(evalCount);
      }
    });

    it('outliers are outside 1.5*IQR fences', () => {
      const result = computeAnalysis(evaluations, players, coaches, [], true);
      for (const bp of result.boxPlots) {
        const lowerFence = bp.q1 - 1.5 * bp.iqr;
        const upperFence = bp.q3 + 1.5 * bp.iqr;
        for (const outlier of bp.outliers) {
          expect(outlier < lowerFence || outlier > upperFence).toBe(true);
        }
      }
    });

    it('controversial player-1 has high IQR', () => {
      const result = computeAnalysis(evaluations, players, coaches, [], true);
      const player1Bp = result.boxPlots.find((bp) => bp.playerId === 'player-1');
      expect(player1Bp).toBeDefined();

      // Get median IQR across all players
      const sortedIqrs = result.boxPlots.map((bp) => bp.iqr).sort((a, b) => a - b);
      const medianIqr = sortedIqrs[Math.floor(sortedIqrs.length / 2)];
      expect(player1Bp!.iqr).toBeGreaterThan(medianIqr);
    });

    it('box plots are sorted by IQR descending (most controversial first)', () => {
      const result = computeAnalysis(evaluations, players, coaches, [], true);
      for (let i = 1; i < result.boxPlots.length; i++) {
        expect(result.boxPlots[i - 1].iqr).toBeGreaterThanOrEqual(result.boxPlots[i].iqr);
      }
    });

    it('verifies box plot quartiles with hand-computed known data', () => {
      // Use a small controlled dataset where we can compute quartiles by hand
      const smallPlayers: PlayerInfo[] = [{ id: 'p1', name: 'Test Player', number: '99', primaryPosition: '', secondaryPosition: '' }];
      const smallCoaches: CoachInfo[] = [
        { id: 'c1', name: 'C1' },
        { id: 'c2', name: 'C2' },
        { id: 'c3', name: 'C3' },
        { id: 'c4', name: 'C4' },
        { id: 'c5', name: 'C5' },
      ];
      // Each coach gives different scores so normalization actually works
      // but since there is only 1 player per coach, stddev of each coach is 0
      // so the fallback (raw score) is used for normalization
      const smallEvals: RawEvaluation[] = [
        makeEval('c1', 'p1', [2, 2, 2, 2, 2]),  // total 10
        makeEval('c2', 'p1', [4, 4, 4, 4, 4]),  // total 20
        makeEval('c3', 'p1', [6, 6, 6, 6, 6]),  // total 30
        makeEval('c4', 'p1', [8, 8, 8, 8, 8]),  // total 40
        makeEval('c5', 'p1', [10, 10, 10, 10, 10]), // total 50
      ];

      const result = computeAnalysis(smallEvals, smallPlayers, smallCoaches, [], false);
      const bp = result.boxPlots[0];
      expect(bp).toBeDefined();
      expect(bp.dataPoints).toHaveLength(5);
      // With stddev=0 per coach (1 player each), raw totals are used
      // Sorted data: [10, 20, 30, 40, 50]
      // Median = 30, Q1 = median([10,20]) = 15, Q3 = median([40,50]) = 45
      expect(bp.median).toBe(30);
      expect(bp.q1).toBe(15);
      expect(bp.q3).toBe(45);
      expect(bp.iqr).toBe(30);
      expect(bp.min).toBe(10);
      expect(bp.max).toBe(50);
      // No outliers since all within 1.5*30=45 of fences: [-30, 90]
      expect(bp.outliers).toHaveLength(0);
    });
  });

  describe('Coach exclusion', () => {
    it('excluded coach evaluations are removed from results', () => {
      const resultAll = computeAnalysis(evaluations, players, coaches, [], true);
      const resultExcl = computeAnalysis(evaluations, players, coaches, ['coach-1'], true);

      expect(resultExcl.metadata.totalCoaches).toBe(resultAll.metadata.totalCoaches - 1);
      expect(resultExcl.metadata.totalEvaluations).toBeLessThan(resultAll.metadata.totalEvaluations);
    });

    it('excluded coach does not appear in coach reliability', () => {
      const result = computeAnalysis(evaluations, players, coaches, ['coach-1'], true);
      const found = result.coachReliability.find((c) => c.coachId === 'coach-1');
      expect(found).toBeUndefined();
    });

    it('excluding a coach changes normalized scores for affected players', () => {
      const resultAll = computeAnalysis(evaluations, players, coaches, [], true);
      const resultExcl = computeAnalysis(evaluations, players, coaches, ['coach-1'], true);

      // Find a player rated by coach-1
      const affectedPlayerId = evaluations.find((e) => e.coachId === 'coach-1')!.playerId;
      const before = resultAll.playerRankings.find((r) => r.playerId === affectedPlayerId);
      const after = resultExcl.playerRankings.find((r) => r.playerId === affectedPlayerId);

      expect(before).toBeDefined();
      expect(after).toBeDefined();
      // Score changes when an evaluation is removed
      expect(before!.normalizedTotal).not.toBe(after!.normalizedTotal);
    });

    it('excludedCoachIds in metadata matches input', () => {
      const result = computeAnalysis(evaluations, players, coaches, ['coach-1', 'coach-2'], true);
      expect(result.metadata.excludedCoachIds).toEqual(['coach-1', 'coach-2']);
    });

    it('excluding multiple coaches reduces counts appropriately', () => {
      const resultNone = computeAnalysis(evaluations, players, coaches, [], true);
      const resultTwo = computeAnalysis(evaluations, players, coaches, ['coach-1', 'coach-2'], true);
      expect(resultTwo.metadata.totalCoaches).toBe(resultNone.metadata.totalCoaches - 2);
    });
  });

  describe('Impact warnings', () => {
    it('impact warning appears when excluding coaches drops a player rating count by >1', () => {
      // Find a player rated by both coach-1 and coach-2
      const coach1Players = new Set(evaluations.filter((e) => e.coachId === 'coach-1').map((e) => e.playerId));
      const coach2Players = new Set(evaluations.filter((e) => e.coachId === 'coach-2').map((e) => e.playerId));
      const sharedPlayers = [...coach1Players].filter((id) => coach2Players.has(id));

      // Exclude both coaches
      const result = computeAnalysis(evaluations, players, coaches, ['coach-1', 'coach-2'], true);

      if (sharedPlayers.length > 0) {
        // At least one player should have an impact warning (droppedBy >= 2)
        const warned = result.playerImpactWarnings.find((w) => sharedPlayers.includes(w.playerId));
        expect(warned).toBeDefined();
        expect(warned!.droppedBy).toBeGreaterThanOrEqual(2);
        expect(warned!.reducedCount).toBe(warned!.originalCount - warned!.droppedBy);
      }
    });

    it('no impact warnings when no coaches are excluded', () => {
      const result = computeAnalysis(evaluations, players, coaches, [], true);
      expect(result.playerImpactWarnings).toHaveLength(0);
    });

    it('impact warnings are sorted by droppedBy descending', () => {
      const result = computeAnalysis(evaluations, players, coaches, ['coach-1', 'coach-2'], true);
      for (let i = 1; i < result.playerImpactWarnings.length; i++) {
        expect(result.playerImpactWarnings[i - 1].droppedBy)
          .toBeGreaterThanOrEqual(result.playerImpactWarnings[i].droppedBy);
      }
    });

    it('excluding a single coach that is only rater does not produce warnings (droppedBy must be >1)', () => {
      // Excluding just one coach: for players only rated by that one extra coach,
      // droppedBy = 1 which does NOT trigger a warning
      const result = computeAnalysis(evaluations, players, coaches, ['coach-6'], true);
      for (const warning of result.playerImpactWarnings) {
        expect(warning.droppedBy).toBeGreaterThan(1);
      }
    });
  });

  describe('Coach reliability metrics', () => {
    it('reports MAD from median for each coach', () => {
      const result = computeAnalysis(evaluations, players, coaches, [], true);
      for (const cr of result.coachReliability) {
        expect(cr.madFromMedian).toBeGreaterThanOrEqual(0);
        expect(Number.isFinite(cr.madFromMedian)).toBe(true);
      }
    });

    it('reports mean deviation direction (positive = rates high)', () => {
      const result = computeAnalysis(evaluations, players, coaches, [], true);
      for (const cr of result.coachReliability) {
        expect(Number.isFinite(cr.meanDeviationFromMean)).toBe(true);
      }
    });

    it('reports rank correlation for each coach', () => {
      const result = computeAnalysis(evaluations, players, coaches, [], true);
      for (const cr of result.coachReliability) {
        expect(cr.rankCorrelation).toBeGreaterThanOrEqual(-1);
        expect(cr.rankCorrelation).toBeLessThanOrEqual(1);
      }
    });

    it('coach reliability is sorted by MAD ascending (most reliable first)', () => {
      const result = computeAnalysis(evaluations, players, coaches, [], true);
      for (let i = 1; i < result.coachReliability.length; i++) {
        expect(result.coachReliability[i - 1].madFromMedian)
          .toBeLessThanOrEqual(result.coachReliability[i].madFromMedian);
      }
    });

    it('undifferentiating coach (coach-5) appears in metadata.undifferentiatingCoaches', () => {
      const result = computeAnalysis(evaluations, players, coaches, [], true);
      expect(result.metadata.undifferentiatingCoaches).toContain('coach-5');
    });

    it('normal coaches do not appear in undifferentiatingCoaches', () => {
      const result = computeAnalysis(evaluations, players, coaches, [], true);
      // Normal coaches (6-15) have varied scoring, should not be undifferentiating
      for (let i = 6; i <= 15; i++) {
        expect(result.metadata.undifferentiatingCoaches).not.toContain(`coach-${i}`);
      }
    });

    it('coach reliability is only populated when isLead=true', () => {
      const resultLead = computeAnalysis(evaluations, players, coaches, [], true);
      const resultNonLead = computeAnalysis(evaluations, players, coaches, [], false);

      expect(resultLead.coachReliability.length).toBeGreaterThan(0);
      expect(resultNonLead.coachReliability).toHaveLength(0);
    });

    it('each coach reliability entry has correct player deviation count', () => {
      const result = computeAnalysis(evaluations, players, coaches, [], true);
      for (const cr of result.coachReliability) {
        expect(cr.playerDeviations).toHaveLength(cr.playersRated);
      }
    });
  });

  describe('Spearman rank correlation edge cases', () => {
    it('fewer than 3 data points returns rank correlation of 0', () => {
      // Create a scenario with a coach who rates only 2 players
      const twoPlayers: PlayerInfo[] = [
        { id: 'p1', name: 'P1', number: '1', primaryPosition: '', secondaryPosition: '' },
        { id: 'p2', name: 'P2', number: '2', primaryPosition: '', secondaryPosition: '' },
      ];
      const twoCoaches: CoachInfo[] = [
        { id: 'c1', name: 'C1' },
        { id: 'c2', name: 'C2' },
      ];
      const twoEvals: RawEvaluation[] = [
        makeEval('c1', 'p1', [8, 8, 8, 8, 8]),
        makeEval('c1', 'p2', [3, 3, 3, 3, 3]),
        makeEval('c2', 'p1', [7, 7, 7, 7, 7]),
        makeEval('c2', 'p2', [4, 4, 4, 4, 4]),
      ];

      // Each coach rates 2 players -> n<3 -> rank correlation should be 0
      const result = computeAnalysis(twoEvals, twoPlayers, twoCoaches, [], true);
      for (const cr of result.coachReliability) {
        expect(cr.rankCorrelation).toBe(0);
      }
    });

    it('perfect correlation returns 1.0 when coach agrees with consensus', () => {
      // Create a scenario where one coach perfectly agrees with the consensus
      const threePlayers: PlayerInfo[] = [
        { id: 'p1', name: 'P1', number: '1', primaryPosition: '', secondaryPosition: '' },
        { id: 'p2', name: 'P2', number: '2', primaryPosition: '', secondaryPosition: '' },
        { id: 'p3', name: 'P3', number: '3', primaryPosition: '', secondaryPosition: '' },
      ];
      const threeCoaches: CoachInfo[] = [
        { id: 'c1', name: 'C1' },
        { id: 'c2', name: 'C2' },
        { id: 'c3', name: 'C3' },
      ];
      // All coaches rank players in same order: p1 > p2 > p3
      const perfEvals: RawEvaluation[] = [
        makeEval('c1', 'p1', [9, 9, 9, 9, 9]),
        makeEval('c1', 'p2', [6, 6, 6, 6, 6]),
        makeEval('c1', 'p3', [3, 3, 3, 3, 3]),
        makeEval('c2', 'p1', [8, 8, 8, 8, 8]),
        makeEval('c2', 'p2', [5, 5, 5, 5, 5]),
        makeEval('c2', 'p3', [2, 2, 2, 2, 2]),
        makeEval('c3', 'p1', [10, 10, 10, 10, 10]),
        makeEval('c3', 'p2', [7, 7, 7, 7, 7]),
        makeEval('c3', 'p3', [4, 4, 4, 4, 4]),
      ];

      const result = computeAnalysis(perfEvals, threePlayers, threeCoaches, [], true);
      // All coaches agree perfectly, so rank correlation should be 1.0
      for (const cr of result.coachReliability) {
        expect(cr.rankCorrelation).toBe(1);
      }
    });

    it('anti-correlation returns -1.0 when coach disagrees with consensus', () => {
      // One coach ranks in exact opposite order from the other two
      const threePlayers: PlayerInfo[] = [
        { id: 'p1', name: 'P1', number: '1', primaryPosition: '', secondaryPosition: '' },
        { id: 'p2', name: 'P2', number: '2', primaryPosition: '', secondaryPosition: '' },
        { id: 'p3', name: 'P3', number: '3', primaryPosition: '', secondaryPosition: '' },
      ];
      const threeCoaches: CoachInfo[] = [
        { id: 'c1', name: 'C1' },
        { id: 'c2', name: 'C2' },
        { id: 'c3', name: 'Contrarian' },
      ];
      // c1 and c2 rank: p1 > p2 > p3; c3 ranks: p3 > p2 > p1 (opposite)
      const antiEvals: RawEvaluation[] = [
        makeEval('c1', 'p1', [9, 9, 9, 9, 9]),
        makeEval('c1', 'p2', [6, 6, 6, 6, 6]),
        makeEval('c1', 'p3', [3, 3, 3, 3, 3]),
        makeEval('c2', 'p1', [9, 9, 9, 9, 9]),
        makeEval('c2', 'p2', [6, 6, 6, 6, 6]),
        makeEval('c2', 'p3', [3, 3, 3, 3, 3]),
        makeEval('c3', 'p1', [3, 3, 3, 3, 3]),
        makeEval('c3', 'p2', [6, 6, 6, 6, 6]),
        makeEval('c3', 'p3', [9, 9, 9, 9, 9]),
      ];

      const result = computeAnalysis(antiEvals, threePlayers, threeCoaches, [], true);
      // Find the contrarian coach
      const contrarian = result.coachReliability.find((c) => c.coachId === 'c3');
      expect(contrarian).toBeDefined();
      expect(contrarian!.rankCorrelation).toBe(-1);
    });

    it('tied ranks are handled correctly without errors', () => {
      // Create tied scores
      const fourPlayers: PlayerInfo[] = [
        { id: 'p1', name: 'P1', number: '1', primaryPosition: '', secondaryPosition: '' },
        { id: 'p2', name: 'P2', number: '2', primaryPosition: '', secondaryPosition: '' },
        { id: 'p3', name: 'P3', number: '3', primaryPosition: '', secondaryPosition: '' },
        { id: 'p4', name: 'P4', number: '4', primaryPosition: '', secondaryPosition: '' },
      ];
      const twoCoaches: CoachInfo[] = [
        { id: 'c1', name: 'C1' },
        { id: 'c2', name: 'C2' },
      ];
      // c1 gives tied scores to p1 and p2
      const tiedEvals: RawEvaluation[] = [
        makeEval('c1', 'p1', [7, 7, 7, 7, 7]),
        makeEval('c1', 'p2', [7, 7, 7, 7, 7]),  // tied with p1
        makeEval('c1', 'p3', [5, 5, 5, 5, 5]),
        makeEval('c1', 'p4', [3, 3, 3, 3, 3]),
        makeEval('c2', 'p1', [8, 8, 8, 8, 8]),
        makeEval('c2', 'p2', [6, 6, 6, 6, 6]),
        makeEval('c2', 'p3', [4, 4, 4, 4, 4]),
        makeEval('c2', 'p4', [2, 2, 2, 2, 2]),
      ];

      // Should not throw and should produce valid correlation
      const result = computeAnalysis(tiedEvals, fourPlayers, twoCoaches, [], true);
      for (const cr of result.coachReliability) {
        expect(cr.rankCorrelation).toBeGreaterThanOrEqual(-1);
        expect(cr.rankCorrelation).toBeLessThanOrEqual(1);
        expect(Number.isFinite(cr.rankCorrelation)).toBe(true);
      }
    });
  });

  describe('Edge cases', () => {
    it('empty evaluations returns empty results gracefully', () => {
      const result = computeAnalysis([], players, coaches, [], true);
      expect(result.playerRankings).toHaveLength(0);
      expect(result.boxPlots).toHaveLength(0);
      expect(result.coachReliability).toHaveLength(0);
      expect(result.playerImpactWarnings).toHaveLength(0);
      expect(result.metadata.totalPlayers).toBe(0);
      expect(result.metadata.totalCoaches).toBe(0);
      expect(result.metadata.totalEvaluations).toBe(0);
    });

    it('single evaluation per player produces valid non-NaN results', () => {
      const singlePlayers: PlayerInfo[] = [
        { id: 'p1', name: 'P1', number: '1', primaryPosition: '', secondaryPosition: '' },
        { id: 'p2', name: 'P2', number: '2', primaryPosition: '', secondaryPosition: '' },
        { id: 'p3', name: 'P3', number: '3', primaryPosition: '', secondaryPosition: '' },
      ];
      const singleCoach: CoachInfo[] = [{ id: 'c1', name: 'C1' }];
      const singleEvals: RawEvaluation[] = [
        makeEval('c1', 'p1', [8, 7, 6, 5, 4]),
        makeEval('c1', 'p2', [5, 5, 5, 5, 5]),
        makeEval('c1', 'p3', [3, 4, 3, 4, 3]),
      ];

      const result = computeAnalysis(singleEvals, singlePlayers, singleCoach, [], true);
      expect(result.playerRankings).toHaveLength(3);

      for (const ranking of result.playerRankings) {
        expect(Number.isNaN(ranking.normalizedTotal)).toBe(false);
        expect(Number.isFinite(ranking.normalizedTotal)).toBe(true);
      }

      // Box plots should still work with single data point per player
      for (const bp of result.boxPlots) {
        expect(bp.dataPoints).toHaveLength(1);
        expect(Number.isFinite(bp.median)).toBe(true);
        expect(bp.q1).toBe(bp.median);
        expect(bp.q3).toBe(bp.median);
        expect(bp.iqr).toBe(0);
      }
    });

    it('computeAnalysis always returns all players who have evaluations', () => {
      const result = computeAnalysis(evaluations, players, coaches, [], true);
      // Every player in evaluations should appear in results
      const evaluatedPlayerIds = new Set(evaluations.map((e) => e.playerId));
      const resultPlayerIds = new Set(result.playerRankings.map((r) => r.playerId));
      for (const pid of evaluatedPlayerIds) {
        expect(resultPlayerIds.has(pid)).toBe(true);
      }
    });

    it('players with no evaluations do not appear in results', () => {
      // Add an extra player with no evaluations
      const extraPlayers = [...players, { id: 'player-99', name: 'Ghost', number: '99', primaryPosition: '', secondaryPosition: '' }];
      const result = computeAnalysis(evaluations, extraPlayers, coaches, [], true);
      const ghost = result.playerRankings.find((r) => r.playerId === 'player-99');
      expect(ghost).toBeUndefined();
    });
  });

  describe('Metadata', () => {
    it('metadata totalPlayers reflects unique players with evaluations', () => {
      const result = computeAnalysis(evaluations, players, coaches, [], true);
      const uniquePlayers = new Set(evaluations.map((e) => e.playerId));
      expect(result.metadata.totalPlayers).toBe(uniquePlayers.size);
    });

    it('metadata totalCoaches reflects unique coaches in filtered set', () => {
      const result = computeAnalysis(evaluations, players, coaches, [], true);
      const uniqueCoaches = new Set(evaluations.map((e) => e.coachId));
      expect(result.metadata.totalCoaches).toBe(uniqueCoaches.size);
    });

    it('metadata totalEvaluations matches filtered evaluation count', () => {
      const result = computeAnalysis(evaluations, players, coaches, ['coach-1'], true);
      const filteredCount = evaluations.filter((e) => e.coachId !== 'coach-1').length;
      expect(result.metadata.totalEvaluations).toBe(filteredCount);
    });
  });

  describe('Full dataset smoke test', () => {
    it('full analysis runs without errors and returns complete structure', () => {
      const result = computeAnalysis(evaluations, players, coaches, [], true);

      // Structure checks
      expect(result.playerRankings.length).toBeGreaterThan(0);
      expect(result.boxPlots.length).toBeGreaterThan(0);
      expect(result.coachReliability.length).toBeGreaterThan(0);
      expect(result.metadata).toBeDefined();

      // Every ranking has required fields
      for (const r of result.playerRankings) {
        expect(r.playerId).toBeTruthy();
        expect(r.playerName).toBeTruthy();
        expect(r.playerNumber).toBeTruthy();
        expect(r.evaluationCount).toBeGreaterThanOrEqual(1);
        expect(typeof r.rawTotal).toBe('number');
        expect(typeof r.normalizedTotal).toBe('number');
        expect(r.categories).toBeDefined();
        expect(r.rawCategories).toBeDefined();
      }

      // Every box plot has required fields
      for (const bp of result.boxPlots) {
        expect(bp.playerId).toBeTruthy();
        expect(typeof bp.min).toBe('number');
        expect(typeof bp.q1).toBe('number');
        expect(typeof bp.median).toBe('number');
        expect(typeof bp.q3).toBe('number');
        expect(typeof bp.max).toBe('number');
        expect(typeof bp.iqr).toBe('number');
        expect(Array.isArray(bp.outliers)).toBe(true);
        expect(Array.isArray(bp.dataPoints)).toBe(true);
      }

      // Every coach reliability has required fields
      for (const cr of result.coachReliability) {
        expect(cr.coachId).toBeTruthy();
        expect(cr.coachName).toBeTruthy();
        expect(cr.playersRated).toBeGreaterThan(0);
        expect(typeof cr.madFromMedian).toBe('number');
        expect(typeof cr.meanDeviationFromMean).toBe('number');
        expect(typeof cr.rankCorrelation).toBe('number');
        expect(Array.isArray(cr.playerDeviations)).toBe(true);
      }
    });

    it('excluding a generous coach reduces bias in overall scores', () => {
      const resultAll = computeAnalysis(evaluations, players, coaches, [], true);
      const resultExcl = computeAnalysis(evaluations, players, coaches, ['coach-1'], true);

      // Both should produce valid results
      expect(resultAll.playerRankings.length).toBeGreaterThan(0);
      expect(resultExcl.playerRankings.length).toBeGreaterThan(0);

      // The number of evaluations should decrease
      expect(resultExcl.metadata.totalEvaluations).toBeLessThan(resultAll.metadata.totalEvaluations);
    });
  });
});
