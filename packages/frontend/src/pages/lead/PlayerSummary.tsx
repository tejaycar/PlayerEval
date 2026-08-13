import React, { useState, useEffect, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { evaluations, players as playersApi, coaches as coachesApi, team } from '../../api';
import type { NormalizedPlayerScore, ExcludedRating } from '@player-eval/shared';
import { RATING_LABELS } from './ratingLabels';

/** Format number to at most 2 decimal places, no trailing zeros */
const fmt = (n: number) => +n.toFixed(2);

interface NormalizedIndividualEval {
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

interface Player {
  id: string;
  name: string;
  number: string;
}

export default function PlayerSummary() {
  const { playerId } = useParams();
  const navigate = useNavigate();
  const [playerList, setPlayerList] = useState<Player[]>([]);
  const [selectedPlayer, setSelectedPlayer] = useState<string>(playerId || '');
  const [normalizedEvals, setNormalizedEvals] = useState<NormalizedIndividualEval[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [anonymize, setAnonymize] = useState(true);
  const [showRaw, setShowRaw] = useState(false);
  const [coachNameMap, setCoachNameMap] = useState<Map<string, string>>(new Map());
  const [excludedCoachIds, setExcludedCoachIds] = useState<string[]>([]);
  const [excludedRatings, setExcludedRatings] = useState<ExcludedRating[]>([]);
  const [allNormalized, setAllNormalized] = useState<NormalizedPlayerScore[]>([]);
  const [exclusionMode, setExclusionMode] = useState<'include_all' | 'exclude_flagged'>('exclude_flagged');

  // Sort state for the evaluations table
  type SortField = 'coachName' | 'attitude' | 'effort' | 'footballIQ' | 'generalSkill' | 'positionSkill' | 'totalScore';
  const [sortBy, setSortBy] = useState<SortField>('coachName');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');

  const handleSort = (field: SortField) => {
    if (sortBy === field) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortBy(field);
      setSortDir(field === 'coachName' ? 'asc' : 'desc');
    }
  };

  useEffect(() => {
    loadPlayers();
    loadCoachesForAnonymization();
    loadExclusions();
  }, []);

  useEffect(() => {
    if (selectedPlayer) {
      loadEvaluations(selectedPlayer);
    }
  }, [selectedPlayer]);

  useEffect(() => {
    loadNormalizedScores();
  }, [excludedCoachIds, excludedRatings, exclusionMode]);

  const loadPlayers = async () => {
    try {
      const data = await playersApi.list();
      const sorted = [...data.players].sort((a: Player, b: Player) => a.name.localeCompare(b.name));
      setPlayerList(sorted);
      if (!selectedPlayer && sorted.length > 0) {
        setSelectedPlayer(sorted[0].id);
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const loadCoachesForAnonymization = async () => {
    try {
      const data = await coachesApi.list();
      const sortedCoaches = [...data.coaches].sort((a: any, b: any) => a.name.localeCompare(b.name));
      const map = new Map<string, string>();
      sortedCoaches.forEach((c: any, i: number) => {
        map.set(c.id, `Coach ${i + 1}`);
      });
      setCoachNameMap(map);
    } catch {
      // Ignore
    }
  };

  const loadExclusions = async () => {
    try {
      const [coachData, ratingsData, modeData] = await Promise.all([
        team.getExcludedCoaches(),
        team.getExcludedRatings(),
        team.getExclusionMode(),
      ]);
      setExcludedCoachIds(coachData.excludedCoachIds || []);
      setExcludedRatings(ratingsData.excludedRatings || []);
      setExclusionMode(modeData.exclusionMode || 'exclude_flagged');
    } catch {
      // Ignore
    }
  };

  const getCoachDisplayName = (coachId: string, realName: string) => {
    if (!anonymize) return realName;
    return coachNameMap.get(coachId) || realName;
  };

  const loadEvaluations = async (pid: string) => {
    try {
      const data = await evaluations.playerDetail(pid);
      setNormalizedEvals(data.normalizedEvals || []);
    } catch (err: any) {
      setError(err.message);
    }
  };

  const loadNormalizedScores = async () => {
    try {
      const coachIds = exclusionMode === 'include_all' ? [] : excludedCoachIds;
      const ratings = exclusionMode === 'include_all' ? [] : excludedRatings;
      const data = await evaluations.analysis(coachIds, ratings);
      setAllNormalized(data.playerRankings);
    } catch {
      // Ignore
    }
  };

  const handlePlayerSelect = (pid: string) => {
    setSelectedPlayer(pid);
    navigate(`/lead/player-summary/${pid}`, { replace: true });
  };

  const isCoachExcluded = (coachId: string) => {
    if (exclusionMode === 'include_all') return false;
    return excludedCoachIds.includes(coachId);
  };

  const isRatingExcluded = (coachId: string, playerId: string) => {
    if (exclusionMode === 'include_all') return false;
    return excludedRatings.some((r) => r.coachId === coachId && r.playerId === playerId);
  };

  const isRowExcluded = (ev: NormalizedIndividualEval) => {
    return isCoachExcluded(ev.coachId) || isRatingExcluded(ev.coachId, selectedPlayer);
  };

  // Calculate normalized averages only from non-excluded evaluations
  const calculateNormalizedAverages = () => {
    const included = normalizedEvals.filter((ev) => !isRowExcluded(ev));
    if (included.length === 0) return null;
    const count = included.length;
    return {
      attitude: Math.round((included.reduce((s, e) => s + e.normalized.attitude, 0) / count) * 100) / 100,
      effort: Math.round((included.reduce((s, e) => s + e.normalized.effort, 0) / count) * 100) / 100,
      footballIQ: Math.round((included.reduce((s, e) => s + e.normalized.footballIQ, 0) / count) * 100) / 100,
      generalSkill: Math.round((included.reduce((s, e) => s + e.normalized.generalSkill, 0) / count) * 100) / 100,
      positionSkill: Math.round((included.reduce((s, e) => s + e.normalized.positionSkill, 0) / count) * 100) / 100,
      totalScore: Math.round((included.reduce((s, e) => s + e.normalized.totalScore, 0) / count) * 100) / 100,
    };
  };

  const calculateRawAverages = () => {
    const included = normalizedEvals.filter((ev) => !isRowExcluded(ev));
    if (included.length === 0) return null;
    const count = included.length;
    return {
      attitude: Math.round((included.reduce((s, e) => s + e.raw.attitude, 0) / count) * 10) / 10,
      effort: Math.round((included.reduce((s, e) => s + e.raw.effort, 0) / count) * 10) / 10,
      footballIQ: Math.round((included.reduce((s, e) => s + e.raw.footballIQ, 0) / count) * 10) / 10,
      generalSkill: Math.round((included.reduce((s, e) => s + e.raw.generalSkill, 0) / count) * 10) / 10,
      positionSkill: Math.round((included.reduce((s, e) => s + e.raw.positionSkill, 0) / count) * 10) / 10,
      totalScore: Math.round((included.reduce((s, e) => s + e.raw.totalScore, 0) / count) * 10) / 10,
    };
  };

  const medianOf = (arr: number[]) => {
    if (arr.length === 0) return 0;
    const sorted = [...arr].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
  };

  const calculateNormalizedMedians = () => {
    const included = normalizedEvals.filter((ev) => !isRowExcluded(ev));
    if (included.length === 0) return null;
    return {
      attitude: fmt(medianOf(included.map((e) => e.normalized.attitude))),
      effort: fmt(medianOf(included.map((e) => e.normalized.effort))),
      footballIQ: fmt(medianOf(included.map((e) => e.normalized.footballIQ))),
      generalSkill: fmt(medianOf(included.map((e) => e.normalized.generalSkill))),
      positionSkill: fmt(medianOf(included.map((e) => e.normalized.positionSkill))),
      totalScore: fmt(medianOf(included.map((e) => e.normalized.totalScore))),
    };
  };

  if (loading) return <div className="text-center py-8">Loading...</div>;

  const normalizedAverages = calculateNormalizedAverages();
  const rawAverages = calculateRawAverages();
  const selectedPlayerData = playerList.find((p) => p.id === selectedPlayer);
  const playerNormalized = allNormalized.find((p) => p.playerId === selectedPlayer);

  // Sort evaluations
  const sortedEvals = [...normalizedEvals].sort((a, b) => {
    const useRaw = showRaw; // when showRaw toggle is on, we might want to sort by shown values
    let cmp: number;
    if (sortBy === 'coachName') {
      const nameA = getCoachDisplayName(a.coachId, a.coachName);
      const nameB = getCoachDisplayName(b.coachId, b.coachName);
      cmp = nameA.localeCompare(nameB);
    } else {
      cmp = a.normalized[sortBy] - b.normalized[sortBy];
    }
    return sortDir === 'asc' ? cmp : -cmp;
  });

  const SortHeader = ({ field, label }: { field: SortField; label: string }) => (
    <th
      className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase cursor-pointer hover:text-gray-700"
      onClick={() => handleSort(field)}
    >
      {label} {sortBy === field && (sortDir === 'asc' ? '↑' : '↓')}
    </th>
  );

  return (
    <div>
      <h2 className="text-2xl font-bold mb-6">Player Summary</h2>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded mb-4">
          {error}
        </div>
      )}

      {/* Player selector + toggles */}
      <div className="mb-6 flex items-center gap-4 flex-wrap">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Select Player</label>
          <select
            value={selectedPlayer}
            onChange={(e) => handlePlayerSelect(e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded w-64"
          >
            <option value="">-- Select a player --</option>
            {playerList.map((p) => (
              <option key={p.id} value={p.id}>
                #{p.number} {p.name}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-2 mt-6">
          <label className="inline-flex items-center gap-2 text-sm cursor-pointer">
            <input
              type="checkbox"
              checked={anonymize}
              onChange={(e) => setAnonymize(e.target.checked)}
              className="rounded border-gray-300"
            />
            <span className="text-gray-600">Anonymize coaches</span>
          </label>
          <label className="inline-flex items-center gap-2 text-sm cursor-pointer">
            <input
              type="checkbox"
              checked={showRaw}
              onChange={(e) => setShowRaw(e.target.checked)}
              className="rounded border-gray-300"
            />
            <span className="text-gray-600">Show raw scores</span>
          </label>
        </div>
        {/* Exclusion mode toggle */}
        <div className="mt-6">
          <div className="inline-flex rounded-md shadow-sm" role="group">
            <button
              onClick={() => { setExclusionMode('include_all'); team.saveExclusionMode('include_all').catch(() => {}); }}
              className={`px-3 py-1.5 text-xs font-medium border ${
                exclusionMode === 'include_all'
                  ? 'bg-blue-600 text-white border-blue-600'
                  : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
              } rounded-l-md`}
            >
              Include all
            </button>
            <button
              onClick={() => { setExclusionMode('exclude_flagged'); team.saveExclusionMode('exclude_flagged').catch(() => {}); }}
              className={`px-3 py-1.5 text-xs font-medium border-t border-b border-r ${
                exclusionMode === 'exclude_flagged'
                  ? 'bg-blue-600 text-white border-blue-600'
                  : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
              } rounded-r-md`}
            >
              Exclude flagged
            </button>
          </div>
        </div>
      </div>

      {selectedPlayer && selectedPlayerData && (
        <div>
          <h3 className="text-lg font-semibold mb-4">
            #{selectedPlayerData.number} {selectedPlayerData.name}
          </h3>

          {normalizedEvals.length === 0 ? (
            <p className="text-gray-500">No evaluations yet for this player.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full bg-white rounded-lg shadow-sm border text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    <th
                      className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase cursor-pointer hover:text-gray-700"
                      onClick={() => handleSort('coachName')}
                    >
                      Evaluator {sortBy === 'coachName' && (sortDir === 'asc' ? '↑' : '↓')}
                    </th>
                    <SortHeader field="attitude" label="Attitude" />
                    <SortHeader field="effort" label="Effort" />
                    <SortHeader field="footballIQ" label="Football IQ" />
                    <SortHeader field="generalSkill" label="General Skill" />
                    <SortHeader field="positionSkill" label="Position Skill" />
                    <SortHeader field="totalScore" label="Total" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {sortedEvals.map((ev, i) => {
                    const excluded = isRowExcluded(ev);
                    return (
                      <React.Fragment key={i}>
                        {/* Normalized row (default) */}
                        <tr className={excluded ? 'bg-red-50' : 'hover:bg-gray-50'}>
                          <td className={`px-4 py-2 font-medium ${excluded ? 'text-red-400' : ''}`}>
                            {getCoachDisplayName(ev.coachId, ev.coachName)}
                            {excluded && (
                              <span className="ml-2 text-xs text-red-400 italic">(excluded)</span>
                            )}
                          </td>
                          <td className={`px-4 py-2 text-center ${excluded ? 'text-red-400' : ''}`}>{fmt(ev.normalized.attitude)}</td>
                          <td className={`px-4 py-2 text-center ${excluded ? 'text-red-400' : ''}`}>{fmt(ev.normalized.effort)}</td>
                          <td className={`px-4 py-2 text-center ${excluded ? 'text-red-400' : ''}`}>{fmt(ev.normalized.footballIQ)}</td>
                          <td className={`px-4 py-2 text-center ${excluded ? 'text-red-400' : ''}`}>{fmt(ev.normalized.generalSkill)}</td>
                          <td className={`px-4 py-2 text-center ${excluded ? 'text-red-400' : ''}`}>{fmt(ev.normalized.positionSkill)}</td>
                          <td className={`px-4 py-2 text-center font-bold ${excluded ? 'text-red-400' : ''}`}>{fmt(ev.normalized.totalScore)}</td>
                        </tr>
                        {/* Raw sub-row (toggled) */}
                        {showRaw && (
                          <tr className="bg-gray-50 text-gray-400 text-xs">
                            <td className="px-4 py-1 italic">raw</td>
                            <td className="px-4 py-1 text-center">{ev.raw.attitude}</td>
                            <td className="px-4 py-1 text-center">{ev.raw.effort}</td>
                            <td className="px-4 py-1 text-center">{ev.raw.footballIQ}</td>
                            <td className="px-4 py-1 text-center">{ev.raw.generalSkill}</td>
                            <td className="px-4 py-1 text-center">{ev.raw.positionSkill}</td>
                            <td className="px-4 py-1 text-center">{ev.raw.totalScore}</td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })}
                  {/* Normalized Average row */}
                  {normalizedAverages && (
                    <tr className="bg-green-50 font-semibold border-t-2 border-gray-300">
                      <td className="px-4 py-3">Normalized Mean</td>
                      <td className="px-4 py-3 text-center">{fmt(normalizedAverages.attitude)}</td>
                      <td className="px-4 py-3 text-center">{fmt(normalizedAverages.effort)}</td>
                      <td className="px-4 py-3 text-center">{fmt(normalizedAverages.footballIQ)}</td>
                      <td className="px-4 py-3 text-center">{fmt(normalizedAverages.generalSkill)}</td>
                      <td className="px-4 py-3 text-center">{fmt(normalizedAverages.positionSkill)}</td>
                      <td className="px-4 py-3 text-center font-bold text-green-700">{fmt(normalizedAverages.totalScore)}</td>
                    </tr>
                  )}
                  {/* Normalized Median row */}
                  {calculateNormalizedMedians() && (() => {
                    const medians = calculateNormalizedMedians()!;
                    return (
                      <tr className="bg-green-50 font-semibold">
                        <td className="px-4 py-3">Normalized Median</td>
                        <td className="px-4 py-3 text-center">{medians.attitude}</td>
                        <td className="px-4 py-3 text-center">{medians.effort}</td>
                        <td className="px-4 py-3 text-center">{medians.footballIQ}</td>
                        <td className="px-4 py-3 text-center">{medians.generalSkill}</td>
                        <td className="px-4 py-3 text-center">{medians.positionSkill}</td>
                        <td className="px-4 py-3 text-center font-bold text-green-600">{medians.totalScore}</td>
                      </tr>
                    );
                  })()}
                  {/* Raw Average row (toggled) */}
                  {showRaw && rawAverages && (
                    <tr className="bg-blue-50 font-semibold">
                      <td className="px-4 py-3">Raw Average</td>
                      <td className="px-4 py-3 text-center">{fmt(rawAverages.attitude)}</td>
                      <td className="px-4 py-3 text-center">{fmt(rawAverages.effort)}</td>
                      <td className="px-4 py-3 text-center">{fmt(rawAverages.footballIQ)}</td>
                      <td className="px-4 py-3 text-center">{fmt(rawAverages.generalSkill)}</td>
                      <td className="px-4 py-3 text-center">{fmt(rawAverages.positionSkill)}</td>
                      <td className="px-4 py-3 text-center font-bold">{fmt(rawAverages.totalScore)}</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
