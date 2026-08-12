import React, { useState, useEffect, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { evaluations, players as playersApi, coaches as coachesApi, team } from '../../api';
import type { NormalizedPlayerScore, ExcludedRating } from '@player-eval/shared';
import { RATING_LABELS } from './ratingLabels';

interface PlayerEval {
  coachId: string;
  coachName: string;
  attitude: number;
  effort: number;
  footballIQ: number;
  generalSkill: number;
  positionSkill: number;
  totalScore: number;
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
  const [evalData, setEvalData] = useState<PlayerEval[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [anonymize, setAnonymize] = useState(true);
  const [coachNameMap, setCoachNameMap] = useState<Map<string, string>>(new Map());
  const [excludedCoachIds, setExcludedCoachIds] = useState<string[]>([]);
  const [excludedRatings, setExcludedRatings] = useState<ExcludedRating[]>([]);
  const [allNormalized, setAllNormalized] = useState<NormalizedPlayerScore[]>([]);
  const [exclusionMode, setExclusionMode] = useState<'include_all' | 'exclude_flagged'>('exclude_flagged');

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
      // Ignore - will fall back to real names
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
      setEvalData(data.evaluations || data.normalizedEvals?.map((ne: any) => ({
        coachId: ne.coachId,
        coachName: ne.coachName,
        ...ne.raw,
      })) || []);
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
      // Ignore - normalized data is supplemental
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

  const isRowExcluded = (ev: PlayerEval) => {
    return isCoachExcluded(ev.coachId) || isRatingExcluded(ev.coachId, selectedPlayer);
  };

  // Calculate averages only from non-excluded evaluations
  const calculateAverages = () => {
    const included = evalData.filter((ev) => !isRowExcluded(ev));
    if (included.length === 0) return null;
    const count = included.length;
    return {
      attitude: Math.round((included.reduce((s, e) => s + e.attitude, 0) / count) * 10) / 10,
      effort: Math.round((included.reduce((s, e) => s + e.effort, 0) / count) * 10) / 10,
      footballIQ: Math.round((included.reduce((s, e) => s + e.footballIQ, 0) / count) * 10) / 10,
      generalSkill: Math.round((included.reduce((s, e) => s + e.generalSkill, 0) / count) * 10) / 10,
      positionSkill: Math.round((included.reduce((s, e) => s + e.positionSkill, 0) / count) * 10) / 10,
      totalScore: Math.round((included.reduce((s, e) => s + e.totalScore, 0) / count) * 10) / 10,
    };
  };

  if (loading) return <div className="text-center py-8">Loading...</div>;

  const averages = calculateAverages();
  const selectedPlayerData = playerList.find((p) => p.id === selectedPlayer);
  const normalizedForPlayer = allNormalized.find((p) => p.playerId === selectedPlayer);

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

          {evalData.length === 0 ? (
            <p className="text-gray-500">No evaluations yet for this player.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full bg-white rounded-lg shadow-sm border">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Evaluator</th>
                    <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Attitude</th>
                    <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Effort</th>
                    <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Football IQ</th>
                    <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">General Skill</th>
                    <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Position Skill</th>
                    <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase font-bold">Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {evalData.map((ev, i) => {
                    const excluded = isRowExcluded(ev);
                    return (
                      <tr key={i} className={excluded ? 'bg-red-50' : 'hover:bg-gray-50'}>
                        <td className={`px-4 py-3 text-sm font-medium ${excluded ? 'text-red-400' : ''}`}>
                          {getCoachDisplayName(ev.coachId, ev.coachName)}
                          {excluded && (
                            <span className="ml-2 text-xs text-red-400 italic">(excluded)</span>
                          )}
                        </td>
                        <td className={`px-4 py-3 text-sm text-center ${excluded ? 'text-red-400' : ''}`}>{ev.attitude}</td>
                        <td className={`px-4 py-3 text-sm text-center ${excluded ? 'text-red-400' : ''}`}>{ev.effort}</td>
                        <td className={`px-4 py-3 text-sm text-center ${excluded ? 'text-red-400' : ''}`}>{ev.footballIQ}</td>
                        <td className={`px-4 py-3 text-sm text-center ${excluded ? 'text-red-400' : ''}`}>{ev.generalSkill}</td>
                        <td className={`px-4 py-3 text-sm text-center ${excluded ? 'text-red-400' : ''}`}>{ev.positionSkill}</td>
                        <td className={`px-4 py-3 text-sm text-center font-bold ${excluded ? 'text-red-400' : ''}`}>{ev.totalScore}</td>
                      </tr>
                    );
                  })}
                  {/* Raw Average row (non-excluded only) */}
                  {averages && (
                    <tr className="bg-blue-50 font-semibold border-t-2 border-gray-300">
                      <td className="px-4 py-3 text-sm">Raw Average</td>
                      <td className="px-4 py-3 text-sm text-center">{averages.attitude}</td>
                      <td className="px-4 py-3 text-sm text-center">{averages.effort}</td>
                      <td className="px-4 py-3 text-sm text-center">{averages.footballIQ}</td>
                      <td className="px-4 py-3 text-sm text-center">{averages.generalSkill}</td>
                      <td className="px-4 py-3 text-sm text-center">{averages.positionSkill}</td>
                      <td className="px-4 py-3 text-sm text-center font-bold">{averages.totalScore}</td>
                    </tr>
                  )}
                  {/* Normalized row */}
                  {normalizedForPlayer && (
                    <tr className="bg-green-50 font-semibold">
                      <td className="px-4 py-3 text-sm">Normalized (Z-Score)</td>
                      <td className="px-4 py-3 text-sm text-center">{normalizedForPlayer.categories.attitude}</td>
                      <td className="px-4 py-3 text-sm text-center">{normalizedForPlayer.categories.effort}</td>
                      <td className="px-4 py-3 text-sm text-center">{normalizedForPlayer.categories.footballIQ}</td>
                      <td className="px-4 py-3 text-sm text-center">{normalizedForPlayer.categories.generalSkill}</td>
                      <td className="px-4 py-3 text-sm text-center">{normalizedForPlayer.categories.positionSkill}</td>
                      <td className="px-4 py-3 text-sm text-center font-bold text-green-700">{normalizedForPlayer.normalizedTotal}</td>
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
