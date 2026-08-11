import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { evaluations, players as playersApi, coaches as coachesApi, team } from '../../api';
import type { NormalizedPlayerScore } from '@player-eval/shared';
import { RATING_LABELS } from './ratingLabels';

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
  const [normalizedForPlayer, setNormalizedForPlayer] = useState<NormalizedPlayerScore | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [anonymize, setAnonymize] = useState(true);
  const [coachNameMap, setCoachNameMap] = useState<Map<string, string>>(new Map());
  const [showRaw, setShowRaw] = useState(false);

  useEffect(() => {
    loadPlayers();
    loadCoachesForAnonymization();
    loadNormalizedScores();
  }, []);

  useEffect(() => {
    if (selectedPlayer) {
      loadEvaluations(selectedPlayer);
    }
  }, [selectedPlayer]);

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

  const [allNormalized, setAllNormalized] = useState<NormalizedPlayerScore[]>([]);

  const loadNormalizedScores = async () => {
    try {
      const exclusionData = await team.getExcludedCoaches();
      const excludedIds = exclusionData.excludedCoachIds || [];
      const data = await evaluations.analysis(excludedIds);
      setAllNormalized(data.playerRankings);
    } catch {
      // Ignore - normalized data is supplemental
    }
  };

  const handlePlayerSelect = (pid: string) => {
    setSelectedPlayer(pid);
    navigate(`/lead/player-summary/${pid}`, { replace: true });
  };

  const calculateNormalizedAverages = () => {
    if (normalizedEvals.length === 0) return null;
    const count = normalizedEvals.length;
    return {
      attitude: Math.round((normalizedEvals.reduce((s, e) => s + e.normalized.attitude, 0) / count) * 100) / 100,
      effort: Math.round((normalizedEvals.reduce((s, e) => s + e.normalized.effort, 0) / count) * 100) / 100,
      footballIQ: Math.round((normalizedEvals.reduce((s, e) => s + e.normalized.footballIQ, 0) / count) * 100) / 100,
      generalSkill: Math.round((normalizedEvals.reduce((s, e) => s + e.normalized.generalSkill, 0) / count) * 100) / 100,
      positionSkill: Math.round((normalizedEvals.reduce((s, e) => s + e.normalized.positionSkill, 0) / count) * 100) / 100,
      totalScore: Math.round((normalizedEvals.reduce((s, e) => s + e.normalized.totalScore, 0) / count) * 100) / 100,
    };
  };

  const calculateRawAverages = () => {
    if (normalizedEvals.length === 0) return null;
    const count = normalizedEvals.length;
    return {
      attitude: Math.round((normalizedEvals.reduce((s, e) => s + e.raw.attitude, 0) / count) * 10) / 10,
      effort: Math.round((normalizedEvals.reduce((s, e) => s + e.raw.effort, 0) / count) * 10) / 10,
      footballIQ: Math.round((normalizedEvals.reduce((s, e) => s + e.raw.footballIQ, 0) / count) * 10) / 10,
      generalSkill: Math.round((normalizedEvals.reduce((s, e) => s + e.raw.generalSkill, 0) / count) * 10) / 10,
      positionSkill: Math.round((normalizedEvals.reduce((s, e) => s + e.raw.positionSkill, 0) / count) * 10) / 10,
      totalScore: Math.round((normalizedEvals.reduce((s, e) => s + e.raw.totalScore, 0) / count) * 10) / 10,
    };
  };

  if (loading) return <div className="text-center py-8">Loading...</div>;

  const normalizedAverages = calculateNormalizedAverages();
  const rawAverages = calculateRawAverages();
  const selectedPlayerData = playerList.find((p) => p.id === selectedPlayer);
  const playerNormalized = allNormalized.find((p) => p.playerId === selectedPlayer);

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
                  {normalizedEvals.map((ev, i) => (
                    <React.Fragment key={i}>
                      {/* Normalized row (always shown) */}
                      <tr className="hover:bg-gray-50">
                        <td className="px-4 py-2 font-medium">
                          {getCoachDisplayName(ev.coachId, ev.coachName)}
                        </td>
                        <td className="px-4 py-2 text-center">{ev.normalized.attitude}</td>
                        <td className="px-4 py-2 text-center">{ev.normalized.effort}</td>
                        <td className="px-4 py-2 text-center">{ev.normalized.footballIQ}</td>
                        <td className="px-4 py-2 text-center">{ev.normalized.generalSkill}</td>
                        <td className="px-4 py-2 text-center">{ev.normalized.positionSkill}</td>
                        <td className="px-4 py-2 text-center font-bold">{ev.normalized.totalScore}</td>
                      </tr>
                      {/* Raw row (toggled) */}
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
                  ))}
                  {/* Normalized Average row */}
                  {normalizedAverages && (
                    <tr className="bg-green-50 font-semibold border-t-2 border-gray-300">
                      <td className="px-4 py-3">Normalized Average</td>
                      <td className="px-4 py-3 text-center">{normalizedAverages.attitude}</td>
                      <td className="px-4 py-3 text-center">{normalizedAverages.effort}</td>
                      <td className="px-4 py-3 text-center">{normalizedAverages.footballIQ}</td>
                      <td className="px-4 py-3 text-center">{normalizedAverages.generalSkill}</td>
                      <td className="px-4 py-3 text-center">{normalizedAverages.positionSkill}</td>
                      <td className="px-4 py-3 text-center font-bold text-green-700">{normalizedAverages.totalScore}</td>
                    </tr>
                  )}
                  {/* Raw Average row (toggled) */}
                  {showRaw && rawAverages && (
                    <tr className="bg-blue-50 font-semibold">
                      <td className="px-4 py-3">Raw Average</td>
                      <td className="px-4 py-3 text-center">{rawAverages.attitude}</td>
                      <td className="px-4 py-3 text-center">{rawAverages.effort}</td>
                      <td className="px-4 py-3 text-center">{rawAverages.footballIQ}</td>
                      <td className="px-4 py-3 text-center">{rawAverages.generalSkill}</td>
                      <td className="px-4 py-3 text-center">{rawAverages.positionSkill}</td>
                      <td className="px-4 py-3 text-center font-bold">{rawAverages.totalScore}</td>
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
