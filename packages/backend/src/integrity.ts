import type { RatingCategory, RatingHistoryEntry } from '@player-eval/shared';
import type {
  LargeChange,
  CoordinatedChange,
  VarianceChange,
  RankShift,
  CoachIntegritySummary,
  IntegrityAnalysisResponse,
} from '@player-eval/shared';

const CATEGORIES: RatingCategory[] = ['attitude', 'effort', 'footballIQ', 'generalSkill', 'positionSkill'];

// Thresholds
const LARGE_CHANGE_TOTAL_THRESHOLD = 5;
const LARGE_CHANGE_CATEGORY_THRESHOLD = 3;
const COORDINATED_WINDOW_MS = 48 * 60 * 60 * 1000; // 48 hours
const VARIANCE_DECREASE_THRESHOLD = 2;
const RANK_SHIFT_THRESHOLD = 2;

// === Input Types ===

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
}

interface CoachInfo {
  id: string;
  name: string;
}

// === Statistical Helpers ===

function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((s, v) => s + v, 0) / values.length;
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    return (sorted[mid - 1] + sorted[mid]) / 2;
  }
  return sorted[mid];
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

// === Detection Algorithms ===

/**
 * Detects large rating changes: |delta totalScore| >= 5 OR |delta in any single category| >= 3
 */
function detectLargeChanges(history: RatingHistoryEntry[]): LargeChange[] {
  const results: LargeChange[] = [];

  for (const entry of history) {
    if (!entry.previousScores) continue;

    const delta = entry.totalScore - entry.previousScores.totalScore;
    const categoryDeltas: Record<string, number> = {};
    let hasLargeCategoryDelta = false;

    for (const cat of CATEGORIES) {
      const catDelta = entry[cat] - entry.previousScores[cat];
      categoryDeltas[cat] = catDelta;
      if (Math.abs(catDelta) >= LARGE_CHANGE_CATEGORY_THRESHOLD) {
        hasLargeCategoryDelta = true;
      }
    }

    if (Math.abs(delta) >= LARGE_CHANGE_TOTAL_THRESHOLD || hasLargeCategoryDelta) {
      results.push({
        coachId: entry.coachId,
        playerId: entry.playerId,
        timestamp: entry.timestamp,
        oldTotal: entry.previousScores.totalScore,
        newTotal: entry.totalScore,
        delta,
        categoryDeltas: categoryDeltas as Record<RatingCategory, number>,
      });
    }
  }

  return results;
}

/**
 * Detects coordinated changes (potential collusion):
 * Within a 48-hour window, if 2+ different coaches changed the same player
 * in the same direction (both increased or both decreased), flag it.
 */
function detectCoordinatedChanges(
  history: RatingHistoryEntry[],
  players: PlayerInfo[]
): CoordinatedChange[] {
  const playerMap = new Map(players.map((p) => [p.id, p]));
  const results: CoordinatedChange[] = [];

  // Only look at changes (entries with previousScores)
  const changes = history.filter((e) => e.previousScores !== null);

  // Group changes by player
  const changesByPlayer = new Map<string, RatingHistoryEntry[]>();
  for (const change of changes) {
    const arr = changesByPlayer.get(change.playerId) || [];
    arr.push(change);
    changesByPlayer.set(change.playerId, arr);
  }

  for (const [playerId, playerChanges] of changesByPlayer) {
    if (playerChanges.length < 2) continue;

    // Sort by timestamp
    const sorted = [...playerChanges].sort(
      (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
    );

    // Sliding window approach
    for (let i = 0; i < sorted.length; i++) {
      const windowStart = new Date(sorted[i].timestamp).getTime();
      const windowEnd = windowStart + COORDINATED_WINDOW_MS;

      const windowChanges = sorted.filter((c) => {
        const t = new Date(c.timestamp).getTime();
        return t >= windowStart && t <= windowEnd;
      });

      // Need 2+ different coaches
      const uniqueCoaches = new Set(windowChanges.map((c) => c.coachId));
      if (uniqueCoaches.size < 2) continue;

      // Group by direction
      const increases = windowChanges.filter(
        (c) => c.totalScore - (c.previousScores?.totalScore || 0) > 0
      );
      const decreases = windowChanges.filter(
        (c) => c.totalScore - (c.previousScores?.totalScore || 0) < 0
      );

      // Check if same-direction changes come from different coaches
      for (const [dirChanges, direction] of [
        [increases, 'increase'] as const,
        [decreases, 'decrease'] as const,
      ]) {
        const dirCoaches = new Set(dirChanges.map((c) => c.coachId));
        if (dirCoaches.size >= 2) {
          const player = playerMap.get(playerId);
          const coordinated: CoordinatedChange = {
            playerId,
            playerName: player?.name || 'Unknown',
            playerNumber: player?.number || '',
            changes: dirChanges.map((c) => ({
              coachId: c.coachId,
              timestamp: c.timestamp,
              delta: c.totalScore - (c.previousScores?.totalScore || 0),
            })),
            direction,
            windowStart: sorted[i].timestamp,
            windowEnd: new Date(windowEnd).toISOString(),
          };

          // Avoid duplicate entries for the same set of changes
          const key = `${playerId}|${direction}|${dirChanges.map((c) => c.id).sort().join(',')}`;
          const existing = results.find(
            (r) =>
              r.playerId === playerId &&
              r.direction === direction &&
              r.changes.length === coordinated.changes.length &&
              r.changes.every((rc) =>
                coordinated.changes.some(
                  (cc) => cc.coachId === rc.coachId && cc.timestamp === rc.timestamp
                )
              )
          );
          if (!existing) {
            results.push(coordinated);
          }
        }
      }
    }
  }

  return results;
}

/**
 * Detects variance changes (both increases and decreases).
 * For each change, compute the coach's deviation from the player's mean/median
 * BEFORE and AFTER. If deviation increased, it is suspicious (variance increase).
 * If deviation decreased >= 2 points, it suggests peer pressure (variance decrease).
 */
function detectVarianceChanges(
  history: RatingHistoryEntry[],
  evaluations: RawEvaluation[]
): { increases: VarianceChange[]; decreases: VarianceChange[] } {
  const increases: VarianceChange[] = [];
  const decreases: VarianceChange[] = [];

  // Changes only (entries with previousScores)
  const changes = history.filter((e) => e.previousScores !== null);

  // Current totals per player (from evaluations)
  const evalsByPlayer = new Map<string, RawEvaluation[]>();
  for (const ev of evaluations) {
    const arr = evalsByPlayer.get(ev.playerId) || [];
    arr.push(ev);
    evalsByPlayer.set(ev.playerId, arr);
  }

  for (const change of changes) {
    const playerEvals = evalsByPlayer.get(change.playerId);
    if (!playerEvals || playerEvals.length < 2) continue;

    // Compute the player's mean total from all coaches (current state)
    const allTotals = playerEvals.map((e) => e.totalScore);
    const playerMedian = median(allTotals);

    // The coach's new score
    const newTotal = change.totalScore;
    // The coach's old score
    const oldTotal = change.previousScores!.totalScore;

    // Deviation before and after
    const deviationBefore = Math.abs(oldTotal - playerMedian);
    const deviationAfter = Math.abs(newTotal - playerMedian);
    const deviationChange = round2(deviationAfter - deviationBefore);

    if (deviationChange > 0) {
      // Moved away from consensus
      increases.push({
        coachId: change.coachId,
        playerId: change.playerId,
        timestamp: change.timestamp,
        deviationBefore: round2(deviationBefore),
        deviationAfter: round2(deviationAfter),
        change: deviationChange,
      });
    } else if (deviationChange <= -VARIANCE_DECREASE_THRESHOLD) {
      // Moved significantly toward consensus (peer pressure)
      decreases.push({
        coachId: change.coachId,
        playerId: change.playerId,
        timestamp: change.timestamp,
        deviationBefore: round2(deviationBefore),
        deviationAfter: round2(deviationAfter),
        change: deviationChange,
      });
    }
  }

  return { increases, decreases };
}

/**
 * Detects rank shifts: simulates rankings without a change vs with it.
 * If a player moved more than 2 rank positions, flag it.
 */
function detectRankShifts(
  history: RatingHistoryEntry[],
  evaluations: RawEvaluation[]
): RankShift[] {
  const results: RankShift[] = [];

  // Changes only
  const changes = history.filter((e) => e.previousScores !== null);

  // Build current evaluation map: coachId|playerId -> totalScore
  const evalMap = new Map<string, number>();
  for (const ev of evaluations) {
    evalMap.set(`${ev.coachId}|${ev.playerId}`, ev.totalScore);
  }

  // Compute current average totals per player (the actual rankings)
  const playerTotals = new Map<string, number[]>();
  for (const ev of evaluations) {
    const arr = playerTotals.get(ev.playerId) || [];
    arr.push(ev.totalScore);
    playerTotals.set(ev.playerId, arr);
  }

  function computeRankings(totalsMap: Map<string, number[]>): Map<string, number> {
    const avgTotals: Array<{ playerId: string; avg: number }> = [];
    for (const [playerId, totals] of totalsMap) {
      if (totals.length > 0) {
        avgTotals.push({ playerId, avg: mean(totals) });
      }
    }
    avgTotals.sort((a, b) => b.avg - a.avg);
    const rankings = new Map<string, number>();
    avgTotals.forEach((item, index) => rankings.set(item.playerId, index + 1));
    return rankings;
  }

  // Current rankings (with all current scores)
  const currentRankings = computeRankings(playerTotals);

  for (const change of changes) {
    if (!change.previousScores) continue;

    // Simulate "before" state: replace the current score with the old score
    const simulatedTotals = new Map<string, number[]>();
    for (const [playerId, totals] of playerTotals) {
      simulatedTotals.set(playerId, [...totals]);
    }

    const playerScores = simulatedTotals.get(change.playerId);
    if (!playerScores) continue;

    // Find and replace the coach's current score with the previous score
    const key = `${change.coachId}|${change.playerId}`;
    const currentScore = evalMap.get(key);
    if (currentScore === undefined) continue;

    const scoreIndex = playerScores.indexOf(currentScore);
    if (scoreIndex === -1) continue;

    // Replace current score with old score for simulation
    playerScores[scoreIndex] = change.previousScores.totalScore;
    simulatedTotals.set(change.playerId, playerScores);

    const simulatedRankings = computeRankings(simulatedTotals);

    const rankBefore = simulatedRankings.get(change.playerId) || 0;
    const rankAfter = currentRankings.get(change.playerId) || 0;
    const positionsChanged = Math.abs(rankBefore - rankAfter);

    if (positionsChanged > RANK_SHIFT_THRESHOLD) {
      results.push({
        coachId: change.coachId,
        playerId: change.playerId,
        timestamp: change.timestamp,
        rankBefore,
        rankAfter,
        positionsChanged,
      });
    }
  }

  return results;
}

/**
 * Compute per-coach integrity summaries.
 */
function computeCoachSummaries(
  history: RatingHistoryEntry[],
  coaches: CoachInfo[],
  flaggedEntries: Set<string> // Set of "coachId|playerId|timestamp" keys that are flagged
): CoachIntegritySummary[] {
  const coachMap = new Map(coaches.map((c) => [c.id, c]));
  const summaries: CoachIntegritySummary[] = [];

  // Changes only
  const changes = history.filter((e) => e.previousScores !== null);

  // Group by coach
  const changesByCoach = new Map<string, RatingHistoryEntry[]>();
  for (const change of changes) {
    const arr = changesByCoach.get(change.coachId) || [];
    arr.push(change);
    changesByCoach.set(change.coachId, arr);
  }

  // Include all coaches, even those with no changes
  for (const coach of coaches) {
    const coachChanges = changesByCoach.get(coach.id) || [];
    const deltas = coachChanges.map(
      (c) => c.totalScore - (c.previousScores?.totalScore || 0)
    );

    const flagCount = coachChanges.filter((c) =>
      flaggedEntries.has(`${c.coachId}|${c.playerId}|${c.timestamp}`)
    ).length;

    const lastChange = coachChanges.length > 0
      ? coachChanges.sort((a, b) => b.timestamp.localeCompare(a.timestamp))[0].timestamp
      : null;

    summaries.push({
      coachId: coach.id,
      coachName: coach.name,
      totalChanges: coachChanges.length,
      avgMagnitude: coachChanges.length > 0
        ? round2(mean(deltas.map(Math.abs)))
        : 0,
      flagCount,
      lastChangeTimestamp: lastChange,
      netDirection: round2(deltas.reduce((s, d) => s + d, 0)),
    });
  }

  return summaries;
}

// === Main Entry Point ===

export function computeIntegrityAnalysis(
  history: RatingHistoryEntry[],
  evaluations: RawEvaluation[],
  coaches: CoachInfo[],
  players: PlayerInfo[]
): IntegrityAnalysisResponse {
  const largeChanges = detectLargeChanges(history);
  const coordinatedChanges = detectCoordinatedChanges(history, players);
  const { increases: varianceIncreases, decreases: varianceDecreases } =
    detectVarianceChanges(history, evaluations);
  const rankShifts = detectRankShifts(history, evaluations);

  // Build set of all flagged entries for coach summaries
  const flaggedEntries = new Set<string>();
  for (const lc of largeChanges) {
    flaggedEntries.add(`${lc.coachId}|${lc.playerId}|${lc.timestamp}`);
  }
  for (const cc of coordinatedChanges) {
    for (const ch of cc.changes) {
      flaggedEntries.add(`${ch.coachId}|${cc.playerId}|${ch.timestamp}`);
    }
  }
  for (const vi of varianceIncreases) {
    flaggedEntries.add(`${vi.coachId}|${vi.playerId}|${vi.timestamp}`);
  }
  for (const vd of varianceDecreases) {
    flaggedEntries.add(`${vd.coachId}|${vd.playerId}|${vd.timestamp}`);
  }
  for (const rs of rankShifts) {
    flaggedEntries.add(`${rs.coachId}|${rs.playerId}|${rs.timestamp}`);
  }

  const coachSummaries = computeCoachSummaries(history, coaches, flaggedEntries);

  return {
    history,
    largeChanges,
    coordinatedChanges,
    varianceIncreases,
    varianceDecreases,
    rankShifts,
    coachSummaries,
  };
}
