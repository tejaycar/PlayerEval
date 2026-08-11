import type { RatingCategory } from '@player-eval/shared';
import type {
  AnalysisResponse,
  NormalizedPlayerScore,
  BoxPlotStats,
  CoachReliabilityMetrics,
  PlayerDeviation,
  PlayerImpactWarning,
  AnalysisMetadata,
} from '@player-eval/shared';

const CATEGORIES: RatingCategory[] = ['attitude', 'effort', 'footballIQ', 'generalSkill', 'positionSkill'];

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

// === Statistical Helpers ===

function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((s, v) => s + v, 0) / values.length;
}

function stddev(values: number[]): number {
  if (values.length < 2) return 0;
  const m = mean(values);
  const variance = values.reduce((s, v) => s + (v - m) ** 2, 0) / (values.length - 1);
  return Math.sqrt(variance);
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

function quartiles(values: number[]): { q1: number; median: number; q3: number } {
  const sorted = [...values].sort((a, b) => a - b);
  const n = sorted.length;
  if (n === 0) return { q1: 0, median: 0, q3: 0 };
  if (n === 1) return { q1: sorted[0], median: sorted[0], q3: sorted[0] };

  const med = median(sorted);

  // Lower half (exclusive of median for odd n)
  const lowerHalf = sorted.slice(0, Math.floor(n / 2));
  const upperHalf = sorted.slice(n % 2 === 0 ? n / 2 : Math.floor(n / 2) + 1);

  return {
    q1: median(lowerHalf),
    median: med,
    q3: median(upperHalf),
  };
}

/**
 * Spearman rank correlation between two arrays.
 * Returns value in [-1, 1]. Returns 0 if insufficient data.
 */
function spearmanRankCorrelation(x: number[], y: number[]): number {
  const n = x.length;
  if (n < 3) return 0;

  function rank(arr: number[]): number[] {
    const indexed = arr.map((v, i) => ({ v, i }));
    indexed.sort((a, b) => a.v - b.v);
    const ranks = new Array(n);
    let i = 0;
    while (i < n) {
      let j = i;
      while (j < n - 1 && indexed[j + 1].v === indexed[j].v) j++;
      const avgRank = (i + j) / 2 + 1;
      for (let k = i; k <= j; k++) {
        ranks[indexed[k].i] = avgRank;
      }
      i = j + 1;
    }
    return ranks;
  }

  const rankX = rank(x);
  const rankY = rank(y);

  const dSquaredSum = rankX.reduce((s, rx, i) => s + (rx - rankY[i]) ** 2, 0);
  const rho = 1 - (6 * dSquaredSum) / (n * (n * n - 1));
  return Math.round(rho * 1000) / 1000;
}

// === Core Analysis Computation ===

interface CoachCategoryStats {
  mean: number;
  stddev: number;
}

export function computeAnalysis(
  evaluations: RawEvaluation[],
  players: PlayerInfo[],
  coaches: CoachInfo[],
  excludedCoachIds: string[],
  isLead: boolean
): AnalysisResponse {
  const excludedSet = new Set(excludedCoachIds);
  const playerMap = new Map(players.map((p) => [p.id, p]));
  const coachMap = new Map(coaches.map((c) => [c.id, c]));

  // All evaluations (for computing impact warnings)
  const allEvalsByPlayer = new Map<string, RawEvaluation[]>();
  for (const ev of evaluations) {
    const arr = allEvalsByPlayer.get(ev.playerId) || [];
    arr.push(ev);
    allEvalsByPlayer.set(ev.playerId, arr);
  }

  // Filtered evaluations (excluding removed coaches)
  const filteredEvals = evaluations.filter((e) => !excludedSet.has(e.coachId));

  // Group by coach for Z-score computation
  const evalsByCoach = new Map<string, RawEvaluation[]>();
  for (const ev of filteredEvals) {
    const arr = evalsByCoach.get(ev.coachId) || [];
    arr.push(ev);
    evalsByCoach.set(ev.coachId, arr);
  }

  // === Step 1: Compute per-coach mean and stddev for each category + total ===
  const coachStats = new Map<string, { categories: Record<RatingCategory, CoachCategoryStats>; total: CoachCategoryStats }>();
  const undifferentiatingCoaches: string[] = [];

  for (const [coachId, coachEvals] of evalsByCoach) {
    const categoryStats: Record<string, CoachCategoryStats> = {} as any;
    let hasZeroStddev = false;

    for (const cat of CATEGORIES) {
      const values = coachEvals.map((e) => e[cat]);
      const m = mean(values);
      const sd = stddev(values);
      categoryStats[cat] = { mean: m, stddev: sd };
      if (sd === 0) hasZeroStddev = true;
    }

    const totalValues = coachEvals.map((e) => e.totalScore);
    const totalStats = { mean: mean(totalValues), stddev: stddev(totalValues) };
    if (totalStats.stddev === 0) hasZeroStddev = true;

    if (hasZeroStddev) {
      undifferentiatingCoaches.push(coachId);
    }

    coachStats.set(coachId, {
      categories: categoryStats as Record<RatingCategory, CoachCategoryStats>,
      total: totalStats,
    });
  }

  // === Step 2: Compute league-wide mean and stddev per category + total ===
  // (across all filtered evaluations, used for rescaling)
  const leagueStats: Record<string, { mean: number; stddev: number }> = {};
  for (const cat of CATEGORIES) {
    const allValues = filteredEvals.map((e) => e[cat]);
    leagueStats[cat] = { mean: mean(allValues), stddev: stddev(allValues) };
  }
  const allTotals = filteredEvals.map((e) => e.totalScore);
  leagueStats['total'] = { mean: mean(allTotals), stddev: stddev(allTotals) };

  // === Step 3: Z-normalize each evaluation and rescale ===
  interface NormalizedEval {
    coachId: string;
    playerId: string;
    normalizedTotal: number;
    normalizedCategories: Record<RatingCategory, number>;
  }

  const normalizedEvals: NormalizedEval[] = [];

  for (const ev of filteredEvals) {
    const stats = coachStats.get(ev.coachId);
    if (!stats) continue;

    const normalizedCategories: Record<string, number> = {} as any;
    for (const cat of CATEGORIES) {
      const catStats = stats.categories[cat];
      const leagueCat = leagueStats[cat];
      if (catStats.stddev > 0 && leagueCat.stddev > 0) {
        const z = (ev[cat] - catStats.mean) / catStats.stddev;
        normalizedCategories[cat] = leagueCat.mean + z * leagueCat.stddev;
      } else {
        // Fallback: use raw score if can't normalize
        normalizedCategories[cat] = ev[cat];
      }
    }

    let normalizedTotal: number;
    if (stats.total.stddev > 0 && leagueStats['total'].stddev > 0) {
      const zTotal = (ev.totalScore - stats.total.mean) / stats.total.stddev;
      normalizedTotal = leagueStats['total'].mean + zTotal * leagueStats['total'].stddev;
    } else {
      normalizedTotal = ev.totalScore;
    }

    normalizedEvals.push({
      coachId: ev.coachId,
      playerId: ev.playerId,
      normalizedTotal,
      normalizedCategories: normalizedCategories as Record<RatingCategory, number>,
    });
  }

  // === Step 4: Aggregate per player for rankings ===
  const evalsByPlayer = new Map<string, NormalizedEval[]>();
  for (const ne of normalizedEvals) {
    const arr = evalsByPlayer.get(ne.playerId) || [];
    arr.push(ne);
    evalsByPlayer.set(ne.playerId, arr);
  }

  const playerRankings: NormalizedPlayerScore[] = [];
  const boxPlots: BoxPlotStats[] = [];

  for (const [playerId, playerNormEvals] of evalsByPlayer) {
    const player = playerMap.get(playerId);
    if (!player) continue;

    const normalizedTotals = playerNormEvals.map((e) => e.normalizedTotal);
    const avgNormalizedTotal = mean(normalizedTotals);

    // Raw averages
    const rawPlayerEvals = filteredEvals.filter((e) => e.playerId === playerId);
    const rawCategories: Record<string, number> = {} as any;
    const normalizedCategoryAverages: Record<string, number> = {} as any;

    for (const cat of CATEGORIES) {
      rawCategories[cat] = mean(rawPlayerEvals.map((e) => e[cat]));
      normalizedCategoryAverages[cat] = mean(playerNormEvals.map((e) => e.normalizedCategories[cat]));
    }

    playerRankings.push({
      playerId,
      playerName: player.name,
      playerNumber: player.number,
      primaryPosition: player.primaryPosition || '',
      secondaryPosition: player.secondaryPosition || '',
      evaluationCount: playerNormEvals.length,
      rawTotal: mean(rawPlayerEvals.map((e) => e.totalScore)),
      normalizedTotal: round2(avgNormalizedTotal),
      categories: roundRecord(normalizedCategoryAverages) as Record<RatingCategory, number>,
      rawCategories: roundRecord(rawCategories) as Record<RatingCategory, number>,
    });

    // Box plot for this player
    const q = quartiles(normalizedTotals);
    const iqr = q.q3 - q.q1;
    const lowerFence = q.q1 - 1.5 * iqr;
    const upperFence = q.q3 + 1.5 * iqr;
    const outliers = normalizedTotals.filter((v) => v < lowerFence || v > upperFence);

    boxPlots.push({
      playerId,
      playerName: player.name,
      playerNumber: player.number,
      min: Math.min(...normalizedTotals),
      q1: round2(q.q1),
      median: round2(q.median),
      q3: round2(q.q3),
      max: Math.max(...normalizedTotals),
      iqr: round2(iqr),
      outliers: outliers.map(round2),
      dataPoints: normalizedTotals.map(round2),
    });
  }

  // Sort rankings by normalizedTotal descending
  playerRankings.sort((a, b) => b.normalizedTotal - a.normalizedTotal);
  // Sort box plots by IQR descending (most controversial first)
  boxPlots.sort((a, b) => b.iqr - a.iqr);

  // === Step 5: Coach reliability (lead only) ===
  let coachReliability: CoachReliabilityMetrics[] = [];

  if (isLead) {
    // For each player, compute median and mean of normalized totals
    const playerMedians = new Map<string, number>();
    const playerMeans = new Map<string, number>();

    for (const [playerId, playerNormEvals] of evalsByPlayer) {
      const totals = playerNormEvals.map((e) => e.normalizedTotal);
      playerMedians.set(playerId, median(totals));
      playerMeans.set(playerId, mean(totals));
    }

    for (const [coachId, coachEvals] of evalsByCoach) {
      const coach = coachMap.get(coachId);
      if (!coach) continue;

      const coachNormEvals = normalizedEvals.filter((e) => e.coachId === coachId);
      if (coachNormEvals.length === 0) continue;

      const deviations: PlayerDeviation[] = [];
      const absDeviationsFromMedian: number[] = [];
      const deviationsFromMean: number[] = [];
      const coachScores: number[] = [];
      const consensusScores: number[] = [];

      for (const ne of coachNormEvals) {
        const playerMed = playerMedians.get(ne.playerId);
        const playerMean = playerMeans.get(ne.playerId);
        if (playerMed === undefined || playerMean === undefined) continue;

        const devFromMedian = ne.normalizedTotal - playerMed;
        const devFromMean = ne.normalizedTotal - playerMean;

        absDeviationsFromMedian.push(Math.abs(devFromMedian));
        deviationsFromMean.push(devFromMean);
        coachScores.push(ne.normalizedTotal);
        consensusScores.push(playerMed);

        const player = playerMap.get(ne.playerId);
        deviations.push({
          playerId: ne.playerId,
          playerName: player?.name || 'Unknown',
          playerNumber: player?.number || '',
          coachNormalized: round2(ne.normalizedTotal),
          medianNormalized: round2(playerMed),
          meanNormalized: round2(playerMean),
          deviation: round2(devFromMedian),
        });
      }

      const rankCorr = spearmanRankCorrelation(coachScores, consensusScores);

      coachReliability.push({
        coachId,
        coachName: coach.name,
        playersRated: coachNormEvals.length,
        madFromMedian: round2(mean(absDeviationsFromMedian)),
        meanDeviationFromMean: round2(mean(deviationsFromMean)),
        rankCorrelation: rankCorr,
        playerDeviations: deviations,
      });
    }

    // Sort by MAD ascending (most reliable first)
    coachReliability.sort((a, b) => a.madFromMedian - b.madFromMedian);
  }

  // === Step 6: Player impact warnings ===
  const playerImpactWarnings: PlayerImpactWarning[] = [];

  if (excludedCoachIds.length > 0) {
    for (const [playerId, allEvals] of allEvalsByPlayer) {
      const originalCount = allEvals.length;
      const reducedCount = allEvals.filter((e) => !excludedSet.has(e.coachId)).length;
      const droppedBy = originalCount - reducedCount;

      if (droppedBy > 1) {
        const player = playerMap.get(playerId);
        playerImpactWarnings.push({
          playerId,
          playerName: player?.name || 'Unknown',
          playerNumber: player?.number || '',
          originalCount,
          reducedCount,
          droppedBy,
        });
      }
    }

    playerImpactWarnings.sort((a, b) => b.droppedBy - a.droppedBy);
  }

  // === Build response ===
  const metadata: AnalysisMetadata = {
    totalPlayers: evalsByPlayer.size,
    totalCoaches: evalsByCoach.size,
    totalEvaluations: filteredEvals.length,
    excludedCoachIds,
    undifferentiatingCoaches,
  };

  return {
    playerRankings,
    boxPlots,
    coachReliability,
    playerImpactWarnings,
    metadata,
  };
}

// === Utility ===

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function roundRecord(rec: Record<string, number>): Record<string, number> {
  const result: Record<string, number> = {};
  for (const [k, v] of Object.entries(rec)) {
    result[k] = round2(v);
  }
  return result;
}

// === Per-player normalized evaluations (for player detail view) ===

export interface NormalizedIndividualEval {
  coachId: string;
  coachName: string;
  raw: {
    attitude: number;
    effort: number;
    footballIQ: number;
    generalSkill: number;
    positionSkill: number;
    totalScore: number;
  };
  normalized: {
    attitude: number;
    effort: number;
    footballIQ: number;
    generalSkill: number;
    positionSkill: number;
    totalScore: number;
  };
}

/**
 * Computes the per-coach normalized evaluations for a specific player.
 * Uses the same z-score normalization as computeAnalysis.
 */
export function computePlayerNormalizedEvals(
  allEvaluations: RawEvaluation[],
  playerId: string,
  coaches: CoachInfo[],
  excludedCoachIds: string[]
): NormalizedIndividualEval[] {
  const excludedSet = new Set(excludedCoachIds);
  const coachMap = new Map(coaches.map((c) => [c.id, c]));

  // Filtered evaluations (excluding removed coaches)
  const filteredEvals = allEvaluations.filter((e) => !excludedSet.has(e.coachId));

  // Group by coach
  const evalsByCoach = new Map<string, RawEvaluation[]>();
  for (const ev of filteredEvals) {
    const arr = evalsByCoach.get(ev.coachId) || [];
    arr.push(ev);
    evalsByCoach.set(ev.coachId, arr);
  }

  // Compute per-coach stats
  const coachStats = new Map<string, { categories: Record<RatingCategory, CoachCategoryStats>; total: CoachCategoryStats }>();
  for (const [coachId, coachEvals] of evalsByCoach) {
    const categoryStats: Record<string, CoachCategoryStats> = {} as any;
    for (const cat of CATEGORIES) {
      const values = coachEvals.map((e) => e[cat]);
      categoryStats[cat] = { mean: mean(values), stddev: stddev(values) };
    }
    const totalValues = coachEvals.map((e) => e.totalScore);
    coachStats.set(coachId, {
      categories: categoryStats as Record<RatingCategory, CoachCategoryStats>,
      total: { mean: mean(totalValues), stddev: stddev(totalValues) },
    });
  }

  // Compute league-wide stats
  const leagueStats: Record<string, { mean: number; stddev: number }> = {};
  for (const cat of CATEGORIES) {
    const allValues = filteredEvals.map((e) => e[cat]);
    leagueStats[cat] = { mean: mean(allValues), stddev: stddev(allValues) };
  }
  const allTotals = filteredEvals.map((e) => e.totalScore);
  leagueStats['total'] = { mean: mean(allTotals), stddev: stddev(allTotals) };

  // Get evaluations for this specific player
  const playerEvals = filteredEvals.filter((e) => e.playerId === playerId);

  return playerEvals.map((ev) => {
    const stats = coachStats.get(ev.coachId);
    const coach = coachMap.get(ev.coachId);

    const normalized: Record<string, number> = {} as any;
    for (const cat of CATEGORIES) {
      if (stats && stats.categories[cat].stddev > 0 && leagueStats[cat].stddev > 0) {
        const z = (ev[cat] - stats.categories[cat].mean) / stats.categories[cat].stddev;
        normalized[cat] = round2(leagueStats[cat].mean + z * leagueStats[cat].stddev);
      } else {
        normalized[cat] = ev[cat];
      }
    }

    let normalizedTotal: number;
    if (stats && stats.total.stddev > 0 && leagueStats['total'].stddev > 0) {
      const zTotal = (ev.totalScore - stats.total.mean) / stats.total.stddev;
      normalizedTotal = round2(leagueStats['total'].mean + zTotal * leagueStats['total'].stddev);
    } else {
      normalizedTotal = ev.totalScore;
    }

    return {
      coachId: ev.coachId,
      coachName: coach?.name || 'Unknown',
      raw: {
        attitude: ev.attitude,
        effort: ev.effort,
        footballIQ: ev.footballIQ,
        generalSkill: ev.generalSkill,
        positionSkill: ev.positionSkill,
        totalScore: ev.totalScore,
      },
      normalized: {
        attitude: normalized['attitude'],
        effort: normalized['effort'],
        footballIQ: normalized['footballIQ'],
        generalSkill: normalized['generalSkill'],
        positionSkill: normalized['positionSkill'],
        totalScore: normalizedTotal,
      },
    };
  });
}
