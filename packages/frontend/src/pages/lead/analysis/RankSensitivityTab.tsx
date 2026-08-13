import React, { useState, useMemo, useRef } from 'react';
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

interface RankImpact {
  playerId: string;
  playerName: string;
  playerNumber: string;
  rank: number;
  baseRank: number;
  delta: number;
}

interface LocoResult {
  /** Coach IDs in this combination */
  coachIds: string[];
  /** How many coaches in this combo (1, 2, or 3) */
  level: number;
  /** Rankings when these coaches are removed */
  rankings: RankImpact[];
  /** Spearman rank correlation with base ranking */
  rankCorrelation: number;
  /** Max rank shift for any player */
  maxShift: number;
  /** Average absolute rank shift */
  avgAbsShift: number;
  /** Players with rank shift > 3 */
  significantShifts: RankImpact[];
}

type ViewMode = 'summary' | 'heatmap' | 'outliers';
type ComboLevel = 1 | 2 | 3;

export default function RankSensitivityTab({
  analysis,
  getAnalysisForExclusion,
  coaches,
  currentExcludedCoachIds,
  getCoachDisplayName,
}: Props) {
  const [locoResults, setLocoResults] = useState<LocoResult[]>([]);
  const [comboResults2, setComboResults2] = useState<LocoResult[]>([]);
  const [comboResults3, setComboResults3] = useState<LocoResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingMessage, setLoadingMessage] = useState('');
  const [computed, setComputed] = useState<Set<ComboLevel>>(new Set());
  const [viewMode, setViewMode] = useState<ViewMode>('summary');
  const [outlierMode, setOutlierMode] = useState<'with' | 'without'>('with');
  const [expandedRow, setExpandedRow] = useState<string | null>(null);
  const [activeComboLevel, setActiveComboLevel] = useState<ComboLevel>(1);
  const [stabilityLevel, setStabilityLevel] = useState<ComboLevel>(1);

  // === Analysis response cache ===
  // Keyed by sorted excluded coach IDs string. Survives across re-renders until the tab unmounts.
  const analysisCache = useRef<Map<string, AnalysisResponse>>(new Map());

  /** Cached version of getAnalysisForExclusion */
  const getCachedAnalysis = async (excludedIds: string[]): Promise<AnalysisResponse | null> => {
    const key = [...excludedIds].sort().join('|');
    if (analysisCache.current.has(key)) {
      return analysisCache.current.get(key)!;
    }
    const result = await getAnalysisForExclusion(excludedIds);
    if (result) {
      analysisCache.current.set(key, result);
    }
    return result;
  };

  // Map coach IDs to names for display
  const coachNameMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const c of coaches) {
      map.set(c.id, c.name);
    }
    return map;
  }, [coaches]);

  /** Get display label for a combination of coach IDs, respecting anonymization */
  const getComboLabel = (coachIds: string[]): string => {
    return coachIds
      .map((id) => getCoachDisplayName(id, coachNameMap.get(id) || 'Unknown'))
      .join(' + ');
  };

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

  // Generate combinations of given size
  function combinations<T>(arr: T[], size: number): T[][] {
    if (size === 1) return arr.map((x) => [x]);
    const result: T[][] = [];
    for (let i = 0; i <= arr.length - size; i++) {
      const rest = combinations(arr.slice(i + 1), size - 1);
      for (const combo of rest) {
        result.push([arr[i], ...combo]);
      }
    }
    return result;
  }

  // Compute result for a set of excluded coach IDs
  const computeForCombo = async (coachCombo: { id: string; name: string }[]): Promise<LocoResult | null> => {
    const excludeIds = [...currentExcludedCoachIds, ...coachCombo.map((c) => c.id)];
    const locoAnalysis = await getCachedAnalysis(excludeIds);
    if (!locoAnalysis) return null;

    const rankings: RankImpact[] = locoAnalysis.playerRankings.map((p, idx) => {
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

    const rankCorrelation = spearmanRho(
      rankings.map((r) => r.baseRank),
      rankings.map((r) => r.rank)
    );

    const absDeltas = rankings.map((r) => Math.abs(r.delta));
    const maxShift = Math.max(...absDeltas, 0);
    const avgAbsShift = absDeltas.length > 0 ? absDeltas.reduce((s, v) => s + v, 0) / absDeltas.length : 0;
    const significantShifts = rankings.filter((r) => Math.abs(r.delta) > 3)
      .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));

    return {
      coachIds: coachCombo.map((c) => c.id),
      level: coachCombo.length,
      rankings,
      rankCorrelation: Math.round(rankCorrelation * 1000) / 1000,
      maxShift,
      avgAbsShift: Math.round(avgAbsShift * 100) / 100,
      significantShifts,
    };
  };

  /** Compute results for a single level (does NOT cascade) */
  const computeLevel = async (level: ComboLevel): Promise<LocoResult[]> => {
    const combos = combinations(activeCoaches, level);
    const results: LocoResult[] = [];
    for (const combo of combos) {
      const result = await computeForCombo(combo);
      if (result) results.push(result);
    }
    results.sort((a, b) => a.rankCorrelation - b.rankCorrelation);
    return results;
  };

  /**
   * Run LOCO analysis with cascade:
   * - L3CO also computes L2CO and L1CO
   * - L2CO also computes L1CO
   */
  const runLocoAnalysis = async (targetLevel: ComboLevel) => {
    setLoading(true);

    // Determine which levels need computing
    const levelsToCompute: ComboLevel[] = [];
    for (let l = 1 as ComboLevel; l <= targetLevel; l++) {
      if (!computed.has(l as ComboLevel)) {
        levelsToCompute.push(l as ComboLevel);
      }
    }

    for (const level of levelsToCompute) {
      const totalPerms = comboCount(level);
      setLoadingMessage(`Computing L${level}CO (${totalPerms} permutation${totalPerms > 1 ? 's' : ''})...`);

      const results = await computeLevel(level);

      if (level === 1) setLocoResults(results);
      else if (level === 2) setComboResults2(results);
      else if (level === 3) setComboResults3(results);

      setComputed((prev) => new Set([...prev, level]));
    }

    setLoading(false);
    setLoadingMessage('');
  };

  // Get results for the active combo level in Coach Impact view
  // When viewing L3CO, show ALL levels (L1CO + L2CO + L3CO)
  // When viewing L2CO, show L1CO + L2CO
  // When viewing L1CO, show only L1CO
  const activeResults = useMemo(() => {
    const results: LocoResult[] = [];
    if (activeComboLevel >= 1) results.push(...locoResults);
    if (activeComboLevel >= 2) results.push(...comboResults2);
    if (activeComboLevel >= 3) results.push(...comboResults3);
    // Sort all combined results by impact (lowest correlation first)
    results.sort((a, b) => a.rankCorrelation - b.rankCorrelation);
    return results;
  }, [activeComboLevel, locoResults, comboResults2, comboResults3]);

  // Get cumulative results for Player Stability view
  const stabilityResults = useMemo(() => {
    const results: LocoResult[] = [...locoResults];
    if (stabilityLevel >= 2) results.push(...comboResults2);
    if (stabilityLevel >= 3) results.push(...comboResults3);
    return results;
  }, [stabilityLevel, locoResults, comboResults2, comboResults3]);

  // Combo count info
  const comboCount = (level: ComboLevel) => {
    const n = activeCoaches.length;
    if (level === 1) return n;
    if (level === 2) return (n * (n - 1)) / 2;
    return (n * (n - 1) * (n - 2)) / 6;
  };

  // Total permutations for a cascaded run
  const totalPermsUpTo = (level: ComboLevel) => {
    let total = 0;
    for (let l = 1; l <= level; l++) {
      if (!computed.has(l as ComboLevel)) {
        total += comboCount(l as ComboLevel);
      }
    }
    return total;
  };

  // Toggle detail row
  const toggleExpand = (key: string) => {
    setExpandedRow((prev) => (prev === key ? null : key));
  };

  // Outlier-removed rankings
  const outlierRemovedRankings = useMemo(() => {
    if (!analysis.boxPlots) return [];

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

  // Per-player stability based on selected stability level (cumulative)
  const playerStability = useMemo(() => {
    if (stabilityResults.length === 0) return [];

    const playerRanks = new Map<string, number[]>();

    for (const result of stabilityResults) {
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
  }, [stabilityResults, baseRankings]);

  const isAnyComputed = computed.size > 0;

  /** Label showing which levels are included in the current view */
  const levelBadge = (level: number) => {
    if (level === 1) return 'L1CO';
    if (level === 2) return 'L2CO';
    return 'L3CO';
  };

  return (
    <div>
      <div className="mb-4">
        <h3 className="text-lg font-semibold mb-2">Rank Sensitivity Analysis</h3>
        <p className="text-sm text-gray-600 mb-4">
          How stable are player rankings? This analysis removes coaches (LOCO — Leave-One-Coach-Out)
          to show which coaches or combinations have the most influence on final rankings, and which players' positions are most volatile.
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

      {/* === SUMMARY VIEW: Coach Impact === */}
      {viewMode === 'summary' && (
        <div>
          {/* Combo level selector */}
          <div className="flex items-center gap-2 mb-4">
            <span className="text-sm text-gray-600">View up to:</span>
            {([1, 2, 3] as ComboLevel[]).map((level) => (
              <button
                key={level}
                onClick={() => setActiveComboLevel(level)}
                className={`px-3 py-1.5 text-sm rounded border ${
                  activeComboLevel === level
                    ? 'bg-blue-600 text-white border-blue-600'
                    : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
                }`}
              >
                L{level}CO
                {computed.has(level) && <span className="ml-1 text-xs opacity-75">✓</span>}
              </button>
            ))}
          </div>

          {/* Run button if any level up to activeComboLevel hasn't been computed */}
          {!computed.has(activeComboLevel) && !loading && (
            <div className="text-center py-8">
              <button
                onClick={() => runLocoAnalysis(activeComboLevel)}
                disabled={loading}
                className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
              >
                Compute L{activeComboLevel}CO Analysis
                {activeComboLevel > 1 && !computed.has(1) && ' (includes L1CO'}
                {activeComboLevel === 3 && !computed.has(2) && (computed.has(1) ? ' (includes L2CO)' : ' + L2CO)')}
                {activeComboLevel === 2 && !computed.has(1) && ')'}
              </button>
              <p className="text-xs text-gray-400 mt-2">
                Will compute {totalPermsUpTo(activeComboLevel)} total permutations.
                {activeComboLevel >= 2 && ' Lower levels are computed automatically.'}
                {activeComboLevel === 3 && totalPermsUpTo(3) > 100 && (
                  <span className="text-amber-500 ml-1"> This may take a moment.</span>
                )}
              </p>
            </div>
          )}

          {loading && (
            <div className="text-center py-4 text-gray-400">
              {loadingMessage || 'Computing...'}
            </div>
          )}

          {/* Results table */}
          {computed.has(activeComboLevel) && !loading && (
            <div>
              <h4 className="text-sm font-semibold mb-3 text-gray-700">
                All Coach Combinations up to L{activeComboLevel}CO (sorted by impact)
              </h4>
              <table className="w-full bg-white rounded-lg shadow-sm border text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">
                      Coach(es)
                    </th>
                    <th className="px-3 py-2 text-center text-xs font-medium text-gray-500">Level</th>
                    <th className="px-3 py-2 text-center text-xs font-medium text-gray-500">
                      Rank Correlation
                      <span className="text-gray-400 text-xs ml-1 cursor-help" title="Spearman correlation between base rankings and rankings without these coach(es). 1.0 = no change, lower = more influence.">ⓘ</span>
                    </th>
                    <th className="px-3 py-2 text-center text-xs font-medium text-gray-500">
                      Avg Shift
                      <span className="text-gray-400 text-xs ml-1 cursor-help" title="Average number of rank positions players move when these coach(es) are removed.">ⓘ</span>
                    </th>
                    <th className="px-3 py-2 text-center text-xs font-medium text-gray-500">
                      Max Shift
                      <span className="text-gray-400 text-xs ml-1 cursor-help" title="Largest rank change for any single player when these coach(es) are removed.">ⓘ</span>
                    </th>
                    <th className="px-3 py-2 text-center text-xs font-medium text-gray-500">Impact</th>
                    <th className="px-3 py-2 text-center text-xs font-medium text-gray-500">Details</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {activeResults.map((result) => {
                    const rowKey = result.coachIds.join('|');
                    const isExpanded = expandedRow === rowKey;
                    return (
                      <React.Fragment key={rowKey}>
                        <tr className="hover:bg-gray-50">
                          <td className="px-3 py-2 font-medium">{getComboLabel(result.coachIds)}</td>
                          <td className="px-3 py-2 text-center">
                            <span className={`inline-block px-1.5 py-0.5 text-xs rounded ${
                              result.level === 1 ? 'bg-blue-100 text-blue-700' :
                              result.level === 2 ? 'bg-purple-100 text-purple-700' :
                              'bg-orange-100 text-orange-700'
                            }`}>
                              {levelBadge(result.level)}
                            </span>
                          </td>
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
                          <td className="px-3 py-2 text-center">
                            {result.significantShifts.length > 0 ? (
                              <button
                                onClick={() => toggleExpand(rowKey)}
                                className="text-xs text-blue-600 hover:text-blue-800 underline"
                              >
                                {isExpanded ? 'hide' : `${result.significantShifts.length} player${result.significantShifts.length > 1 ? 's' : ''}`}
                              </button>
                            ) : (
                              <span className="text-xs text-gray-400">—</span>
                            )}
                          </td>
                        </tr>
                        {/* Expanded detail row */}
                        {isExpanded && (
                          <tr>
                            <td colSpan={7} className="px-4 py-3 bg-blue-50 border-l-4 border-blue-300">
                              <p className="text-xs font-semibold text-gray-600 mb-2">
                                Players shifted more than 3 rank positions:
                              </p>
                              <table className="w-full text-xs">
                                <thead>
                                  <tr className="text-gray-500">
                                    <th className="text-left pb-1">#</th>
                                    <th className="text-left pb-1">Player</th>
                                    <th className="text-center pb-1">Base Rank</th>
                                    <th className="text-center pb-1">New Rank</th>
                                    <th className="text-center pb-1">Shift</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {result.significantShifts.map((shift) => (
                                    <tr key={shift.playerId} className="border-t border-blue-100">
                                      <td className="py-1 text-gray-500">{shift.playerNumber}</td>
                                      <td className="py-1 font-medium">{shift.playerName}</td>
                                      <td className="py-1 text-center text-gray-600">{shift.baseRank}</td>
                                      <td className="py-1 text-center text-gray-600">{shift.rank}</td>
                                      <td className="py-1 text-center">
                                        <RankDelta delta={shift.delta} />
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })}
                </tbody>
              </table>

              {activeResults.length > 0 && (
                <div className="mt-3 text-xs text-gray-400">
                  Showing {activeResults.length} total combinations across L1CO
                  {activeComboLevel >= 2 && ' + L2CO'}
                  {activeComboLevel >= 3 && ' + L3CO'}, sorted by impact.
                  Values below 0.95 indicate meaningful influence. Click "Details" to see players shifted &gt;3 positions.
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* === HEATMAP VIEW: Player Stability === */}
      {viewMode === 'heatmap' && (
        <div>
          {!isAnyComputed && !loading && (
            <div className="text-center py-8">
              <button
                onClick={() => runLocoAnalysis(1)}
                disabled={loading}
                className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
              >
                Run L1CO Analysis ({activeCoaches.length} permutations)
              </button>
              <p className="text-xs text-gray-400 mt-2">
                Computes rankings with each coach removed one at a time.
              </p>
            </div>
          )}

          {loading && (
            <div className="text-center py-4 text-gray-400">
              {loadingMessage || 'Computing...'}
            </div>
          )}

          {isAnyComputed && !loading && (
            <div>
              <div className="flex items-center justify-between mb-3">
                <h4 className="text-sm font-semibold text-gray-700">
                  Player Rank Stability (sorted by volatility)
                </h4>
                {/* L1CO / L2CO / L3CO toggle */}
                <div className="flex items-center gap-2">
                  <span className="text-xs text-gray-500">View:</span>
                  {([1, 2, 3] as ComboLevel[]).map((level) => {
                    const isAvailable = computed.has(level);
                    return (
                      <button
                        key={level}
                        onClick={() => {
                          if (isAvailable) {
                            setStabilityLevel(level);
                          } else {
                            runLocoAnalysis(level).then(() => setStabilityLevel(level));
                          }
                        }}
                        disabled={loading}
                        className={`px-2.5 py-1 text-xs rounded border ${
                          stabilityLevel === level
                            ? 'bg-blue-600 text-white border-blue-600'
                            : isAvailable
                            ? 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
                            : 'bg-gray-50 text-gray-400 border-gray-200 hover:bg-gray-100'
                        }`}
                        title={
                          level === 1
                            ? 'Single coach removal only'
                            : level === 2
                            ? 'Includes single + 2-coach combinations'
                            : 'Includes single + 2-coach + 3-coach combinations'
                        }
                      >
                        L{level}CO
                        {!isAvailable && ' ⟳'}
                      </button>
                    );
                  })}
                </div>
              </div>

              <p className="text-xs text-gray-500 mb-3">
                Shows the range of possible ranks for each player across
                {stabilityLevel === 1 && ' all single-coach removals (L1CO).'}
                {stabilityLevel === 2 && ' single + 2-coach combo removals (L1CO + L2CO).'}
                {stabilityLevel === 3 && ' single + 2-coach + 3-coach combo removals (L1CO + L2CO + L3CO).'}
                {' '}Narrow bands = stable position; wide bands = sensitive to evaluator composition.
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
                      <td className="px-3 py-2 text-center font-bold text-blue-700">{player.normalizedTotal.toFixed(2)}</td>
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
                    <td className="px-3 py-2 text-center font-bold text-blue-700">{player.normalizedTotal.toFixed(2)}</td>
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
  const impact = Math.max(0, 1 - correlation);
  const widthPct = Math.min(impact * 500, 100);

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
