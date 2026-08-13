import React, { useState, useMemo } from 'react';
import type { NormalizedPlayerScore, AnalysisResponse } from '@player-eval/shared';

interface Props {
  /** Current analysis (with active exclusions applied) */
  analysis: AnalysisResponse;
  /** Function to re-run analysis with a different set of excluded coaches */
  getAnalysisForExclusion: (excludedCoachIds: string[]) => Promise<AnalysisResponse | null>;
  /** List of coaches */
  coaches: { id: string; name: string }[];
  /** Currently excluded coach IDs */
  currentExcludedCoachIds: string[];
  /** Coach display name function (handles anonymization) */
  getCoachDisplayName: (coachId: string, realName: string) => string;
}

interface LocoResult {
  coachId: string;
  coachName: string;
  /** Rankings when this coach is removed */
  rankings: { playerId: string; playerName: string; playerNumber: string; rank: number; baseRank: number; delta: number }[];
  /** Spearman rank correlation with base ranking */
  rankCorrelation: number;
  /** Max rank shift for any player */
  maxShift: number;
  /** Average absolute rank shift */
  avgAbsShift: number;
}

type ViewMode = 'summary' | 'heatmap' | 'outliers';

export default function RankSensitivityTab({
  analysis,
  getAnalysisForExclusion,
  coaches,
  currentExcludedCoachIds,
  getCoachDisplayName,
}: Props) {
  const [locoResults, setLocoResults] = useState<LocoResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [computed, setComputed] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>('summary');
  const [outlierMode, setOutlierMode] = useState<'with' | 'without'>('with');

  // Base rankings from the current analysis
  const baseRankings = useMemo(() => {
    return analysis.playerRankings.map((p, idx) => ({
      playerId: p.playerId,
      playerName: p.playerName,
      playerNumber: p.playerNumber,
      rank: idx + 1,
      normalizedTotal: p.normalizedTotal,
    }));
  }, [analysis]);

  const baseRankMap = useMemo(() => {
    const map = new Map<string, number>();
    baseRankings.forEach((p) => map.set(p.playerId, p.rank));
    return map;
  }, [baseRankings]);

  // Active coaches (not currently excluded)
  const activeCoaches = useMemo(() => {
    const excludedSet = new Set(currentExcludedCoachIds);
    return coaches.filter((c) => !excludedSet.has(c.id));
  }, [coaches, currentExcludedCoachIds]);

  // Run LOCO analysis
  const runLocoAnalysis = async () => {
    setLoading(true);
    const results: LocoResult[] = [];

    for (const coach of activeCoaches) {
      // Exclude this coach on top of any already-excluded coaches
      const excludeIds = [...currentExcludedCoachIds, coach.id];
      const locoAnalysis = await getAnalysisForExclusion(excludeIds);

      if (!locoAnalysis) continue;

      const locoRankings = locoAnalysis.playerRankings.map((p, idx) => {
        const baseRank = baseRankMap.get(p.playerId) || 0;
        return {
          playerId: p.playerId,
          playerName: p.playerName,
          playerNumber: p.playerNumber,
          rank: idx + 1,
          baseRank,
          delta: (idx + 1) - baseRank,
        };
      });

      // Compute rank correlation with base
      const rankCorrelation = spearmanRho(
        locoRankings.map((r) => r.baseRank),
        locoRankings.map((r) => r.rank)
      );

      const absDeltas = locoRankings.map((r) => Math.abs(r.delta));
      const maxShift = Math.max(...absDeltas, 0);
      const avgAbsShift = absDeltas.length > 0 ? absDeltas.reduce((s, v) => s + v, 0) / absDeltas.length : 0;

      results.push({
        coachId: coach.id,
        coachName: getCoachDisplayName(coach.id, coach.name),
        rankings: locoRankings,
        rankCorrelation: Math.round(rankCorrelation * 1000) / 1000,
        maxShift,
        avgAbsShift: Math.round(avgAbsShift * 100) / 100,
      });
    }

    // Sort by impact (lowest correlation = most impact)
    results.sort((a, b) => a.rankCorrelation - b.rankCorrelation);

    setLocoResults(results);
    setComputed(true);
    setLoading(false);
  };

  // Outlier-removed rankings
  const outlierRemovedRankings = useMemo(() => {
    if (!analysis.boxPlots) return [];

    // For each player, compute normalizedTotal without outlier data points
    return analysis.boxPlots
      .map((bp) => {
        const nonOutlierPoints = bp.dataPoints.filter(
          (dp) => !bp.outliers.includes(dp)
        );
        if (nonOutlierPoints.length === 0) return null;
        const avg = nonOutlierPoints.reduce((s, v) => s + v, 0) / nonOutlierPoints.length;
        return {
          playerId: bp.playerId,
          playerName: bp.playerName,
          playerNumber: bp.playerNumber,
          normalizedTotal: Math.round(avg * 100) / 100,
          outlierCount: bp.outliers.length,
          originalN: bp.dataPoints.length,
          trimmedN: nonOutlierPoints.length,
        };
      })
      .filter(Boolean)
      .sort((a, b) => b!.normalizedTotal - a!.normalizedTotal)
      .map((p, idx) => ({
        ...p!,
        rank: idx + 1,
        baseRank: baseRankMap.get(p!.playerId) || 0,
        delta: (idx + 1) - (baseRankMap.get(p!.playerId) || 0),
      }));
  }, [analysis, baseRankMap]);

  // Per-player stability: rank range across all LOCO permutations
  const playerStability = useMemo(() => {
    if (!computed || locoResults.length === 0) return [];

    const playerRanks = new Map<string, number[]>();

    for (const result of locoResults) {
      for (const r of result.rankings) {
        const arr = playerRanks.get(r.playerId) || [];
        arr.push(r.rank);
        playerRanks.set(r.playerId, arr);
      }
    }

    return baseRankings.map((p) => {
      const ranks = playerRanks.get(p.playerId) || [];
      const minRank = ranks.length > 0 ? Math.min(...ranks) : p.rank;
      const maxRank = ranks.length > 0 ? Math.max(...ranks) : p.rank;
      return {
        ...p,
        minRank,
        maxRank,
        rankRange: maxRank - minRank,
      };
    }).sort((a, b) => b.rankRange - a.rankRange);
  }, [computed, locoResults, baseRankings]);

  return (
    <div>
      <div className="mb-4">
        <h3 className="text-lg font-semibold mb-2">Rank Sensitivity Analysis</h3>
        <p className="text-sm text-gray-600 mb-4">
          How stable are player rankings? This analysis removes one coach at a time (LOCO — Leave-One-Coach-Out)
          to show which coaches have the most influence on final rankings, and which players' positions are most volatile.
        </p>
      </div>

      {/* View mode tabs */}
      <div className="flex gap-1 mb-4 border-b border-gray-200">
        {([
          { id: 'summary' as ViewMode, label: 'Coach Impact' },
          { id: 'heatmap' as ViewMode, label: 'Player Stability' },
          { id: 'outliers' as ViewMode, label: 'Outlier Removal' },
        ]).map((tab) => (
          <button
            key={tab.id}
            onClick={() => setViewMode(tab.id)}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px ${
              viewMode === tab.id
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* LOCO Computation */}
      {(viewMode === 'summary' || viewMode === 'heatmap') && !computed && (
        <div className="text-center py-8">
          <button
            onClick={runLocoAnalysis}
            disabled={loading}
            className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
          >
            {loading ? 'Computing...' : `Run LOCO Analysis (${activeCoaches.length} coaches)`}
          </button>
          <p className="text-xs text-gray-400 mt-2">
            This re-computes rankings {activeCoaches.length} times, once for each coach removed.
          </p>
        </div>
      )}

      {loading && (
        <div className="text-center py-4 text-gray-400">
          Computing LOCO permutations...
        </div>
      )}

      {/* === SUMMARY VIEW: Coach Impact === */}
      {viewMode === 'summary' && computed && (
        <div>
          <h4 className="text-sm font-semibold mb-3 text-gray-700">
            Coach Influence on Rankings (sorted by impact)
          </h4>
          <table className="w-full bg-white rounded-lg shadow-sm border text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">Coach</th>
                <th className="px-3 py-2 text-center text-xs font-medium text-gray-500">
                  Rank Correlation
                  <span className="text-gray-400 text-xs ml-1 cursor-help" title="Spearman correlation between base rankings and rankings without this coach. 1.0 = no change, lower = more influence.">ⓘ</span>
                </th>
                <th className="px-3 py-2 text-center text-xs font-medium text-gray-500">Avg Shift</th>
                <th className="px-3 py-2 text-center text-xs font-medium text-gray-500">Max Shift</th>
                <th className="px-3 py-2 text-center text-xs font-medium text-gray-500">Impact</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {locoResults.map((result) => (
                <tr key={result.coachId} className="hover:bg-gray-50">
                  <td className="px-3 py-2 font-medium">{result.coachName}</td>
                  <td className="px-3 py-2 text-center">
                    <span className={result.rankCorrelation < 0.95 ? 'text-amber-600 font-medium' : 'text-gray-600'}>
                      {result.rankCorrelation.toFixed(3)}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-center text-gray-600">{result.avgAbsShift.toFixed(1)}</td>
                  <td className="px-3 py-2 text-center">
                    <span className={result.maxShift >= 3 ? 'text-red-600 font-medium' : 'text-gray-600'}>
                      {result.maxShift}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-center">
                    <ImpactBar correlation={result.rankCorrelation} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {locoResults.length > 0 && (
            <div className="mt-3 text-xs text-gray-400">
              Interpretation: A rank correlation of 1.000 means removing the coach doesn't change rankings at all.
              Values below 0.95 indicate meaningful influence. Below 0.90 = strong "swing vote" coach.
            </div>
          )}
        </div>
      )}

      {/* === HEATMAP VIEW: Player Stability === */}
      {viewMode === 'heatmap' && computed && (
        <div>
          <h4 className="text-sm font-semibold mb-3 text-gray-700">
            Player Rank Stability (sorted by volatility)
          </h4>
          <p className="text-xs text-gray-500 mb-3">
            Shows the range of possible ranks for each player across all LOCO permutations.
            Narrow bands = stable position; wide bands = sensitive to who evaluates them.
          </p>

          <div className="space-y-1.5">
            {playerStability.map((player) => {
              const totalPlayers = baseRankings.length;
              return (
                <div key={player.playerId} className="flex items-center gap-3">
                  <div className="w-40 text-sm text-right flex-shrink-0">
                    <span className="text-gray-500">#{player.playerNumber}</span>{' '}
                    <span className="font-medium">{player.playerName}</span>
                  </div>

                  {/* Rank range visualization */}
                  <div className="flex-1 relative h-6 bg-gray-50 rounded border border-gray-200">
                    {/* Range bar */}
                    <div
                      className={`absolute top-1/2 h-3 rounded ${
                        player.rankRange >= 4 ? 'bg-red-300' : player.rankRange >= 2 ? 'bg-amber-200' : 'bg-green-200'
                      }`}
                      style={{
                        left: `${((player.minRank - 1) / totalPlayers) * 100}%`,
                        width: `${Math.max(((player.rankRange + 1) / totalPlayers) * 100, 1)}%`,
                        transform: 'translateY(-50%)',
                      }}
                    />
                    {/* Base rank marker */}
                    <div
                      className="absolute top-1/2 w-2 h-4 bg-blue-600 rounded-sm"
                      style={{
                        left: `${((player.rank - 1) / totalPlayers) * 100}%`,
                        transform: 'translate(-50%, -50%)',
                      }}
                    />
                  </div>

                  {/* Stats */}
                  <div className="w-48 text-xs text-gray-500 flex-shrink-0">
                    Rank {player.rank} (range: {player.minRank}–{player.maxRank}, Δ{player.rankRange})
                  </div>
                </div>
              );
            })}
          </div>

          {playerStability.length > 0 && (
            <div className="mt-3 flex items-center gap-4 text-xs text-gray-400">
              <span className="flex items-center gap-1"><span className="w-3 h-3 bg-green-200 rounded inline-block"></span> Stable (Δ0–1)</span>
              <span className="flex items-center gap-1"><span className="w-3 h-3 bg-amber-200 rounded inline-block"></span> Moderate (Δ2–3)</span>
              <span className="flex items-center gap-1"><span className="w-3 h-3 bg-red-300 rounded inline-block"></span> Volatile (Δ4+)</span>
              <span className="flex items-center gap-1"><span className="w-2 h-3 bg-blue-600 rounded-sm inline-block"></span> Current rank</span>
            </div>
          )}
        </div>
      )}

      {/* === OUTLIER VIEW: Rankings with/without outliers === */}
      {viewMode === 'outliers' && (
        <div>
          <div className="flex items-center gap-4 mb-4">
            <h4 className="text-sm font-semibold text-gray-700">
              Ranking Comparison: With vs. Without Outliers
            </h4>
            <div className="flex gap-1">
              <button
                onClick={() => setOutlierMode('with')}
                className={`px-3 py-1 text-xs rounded border ${
                  outlierMode === 'with' ? 'bg-blue-600 text-white border-blue-600' : 'border-gray-300 text-gray-700'
                }`}
              >
                Current (with outliers)
              </button>
              <button
                onClick={() => setOutlierMode('without')}
                className={`px-3 py-1 text-xs rounded border ${
                  outlierMode === 'without' ? 'bg-blue-600 text-white border-blue-600' : 'border-gray-300 text-gray-700'
                }`}
              >
                Outliers removed
              </button>
            </div>
          </div>

          <p className="text-xs text-gray-500 mb-3">
            Outliers are scores beyond 1.5×IQR from the quartiles. Removing them shows how rankings change
            when extreme evaluations are excluded.
          </p>

          {outlierMode === 'with' ? (
            <table className="w-full bg-white rounded-lg shadow-sm border text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">Rank</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">#</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">Player</th>
                  <th className="px-3 py-2 text-center text-xs font-medium text-gray-500">Score</th>
                  <th className="px-3 py-2 text-center text-xs font-medium text-gray-500">Outliers</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {baseRankings.map((player) => {
                  const bp = analysis.boxPlots.find((b) => b.playerId === player.playerId);
                  return (
                    <tr key={player.playerId} className="hover:bg-gray-50">
                      <td className="px-3 py-2 text-gray-400">{player.rank}</td>
                      <td className="px-3 py-2 text-gray-500">{player.playerNumber}</td>
                      <td className="px-3 py-2 font-medium">{player.playerName}</td>
                      <td className="px-3 py-2 text-center font-bold text-blue-700">{player.normalizedTotal}</td>
                      <td className="px-3 py-2 text-center">
                        {bp && bp.outliers.length > 0 ? (
                          <span className="text-red-500 text-xs">{bp.outliers.length} outlier{bp.outliers.length > 1 ? 's' : ''}</span>
                        ) : (
                          <span className="text-gray-300">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          ) : (
            <table className="w-full bg-white rounded-lg shadow-sm border text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">New Rank</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">#</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">Player</th>
                  <th className="px-3 py-2 text-center text-xs font-medium text-gray-500">Trimmed Score</th>
                  <th className="px-3 py-2 text-center text-xs font-medium text-gray-500">n (orig → trim)</th>
                  <th className="px-3 py-2 text-center text-xs font-medium text-gray-500">Rank Δ</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {outlierRemovedRankings.map((player) => (
                  <tr key={player.playerId} className={`hover:bg-gray-50 ${Math.abs(player.delta) >= 3 ? 'bg-amber-50' : ''}`}>
                    <td className="px-3 py-2 text-gray-400">{player.rank}</td>
                    <td className="px-3 py-2 text-gray-500">{player.playerNumber}</td>
                    <td className="px-3 py-2 font-medium">{player.playerName}</td>
                    <td className="px-3 py-2 text-center font-bold text-blue-700">{player.normalizedTotal}</td>
                    <td className="px-3 py-2 text-center text-xs text-gray-500">
                      {player.originalN} → {player.trimmedN}
                      {player.outlierCount > 0 && (
                        <span className="text-red-400 ml-1">(-{player.outlierCount})</span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-center">
                      <RankDelta delta={player.delta} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
}

/** Visual impact bar based on rank correlation */
function ImpactBar({ correlation }: { correlation: number }) {
  // Impact is 1 - correlation (0 = no impact, 1 = total reshuffling)
  const impact = Math.max(0, 1 - correlation);
  const widthPct = Math.min(impact * 500, 100); // scale up for visibility

  let color: string;
  if (correlation >= 0.98) color = 'bg-green-400';
  else if (correlation >= 0.95) color = 'bg-yellow-400';
  else if (correlation >= 0.90) color = 'bg-amber-500';
  else color = 'bg-red-500';

  return (
    <div className="w-20 h-3 bg-gray-100 rounded overflow-hidden inline-block" title={`Impact: ${(impact * 100).toFixed(1)}%`}>
      <div className={`h-full ${color} rounded`} style={{ width: `${widthPct}%` }} />
    </div>
  );
}

/** Rank change indicator */
function RankDelta({ delta }: { delta: number }) {
  if (delta === 0) return <span className="text-gray-400">—</span>;
  if (delta < 0) {
    return <span className={`font-medium ${Math.abs(delta) >= 3 ? 'text-green-700' : 'text-green-600'}`}>▲{Math.abs(delta)}</span>;
  }
  return <span className={`font-medium ${delta >= 3 ? 'text-red-700' : 'text-red-600'}`}>▼{delta}</span>;
}

/** Spearman rank correlation */
function spearmanRho(x: number[], y: number[]): number {
  const n = x.length;
  if (n < 3) return 1;

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
  return 1 - (6 * dSquaredSum) / (n * (n * n - 1));
}
