import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { evaluations, players as playersApi, coaches as coachesApi, team } from '../../api';
import type { NormalizedPlayerScore } from '@player-eval/shared';
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
  const [normalizedData, setNormalizedData] = useState<NormalizedPlayerScore | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [anonymize, setAnonymize] = useState(true);
  const [coachNameMap, setCoachNameMap] = useState<Map<string, string>>(new Map());

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
      setEvalData(data.evaluations);
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

  const calculateAverages = () => {
    if (evalData.length === 0) return null;
    const count = evalData.length;
    return {
      attitude: Math.round((evalData.reduce((s, e) => s + e.attitude, 0) / count) * 10) / 10,
      effort: Math.round((evalData.reduce((s, e) => s + e.effort, 0) / count) * 10) / 10,
      footballIQ: Math.round((evalData.reduce((s, e) => s + e.footballIQ, 0) / count) * 10) / 10,
      generalSkill: Math.round((evalData.reduce((s, e) => s + e.generalSkill, 0) / count) * 10) / 10,
      positionSkill: Math.round((evalData.reduce((s, e) => s + e.positionSkill, 0) / count) * 10) / 10,
      totalScore: Math.round((evalData.reduce((s, e) => s + e.totalScore, 0) / count) * 10) / 10,
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

      {/* Player selector */}
      <div className="mb-6 flex items-center gap-4">
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
        <label className="inline-flex items-center gap-2 text-sm cursor-pointer mt-6">
          <input
            type="checkbox"
            checked={anonymize}
            onChange={(e) => setAnonymize(e.target.checked)}
            className="rounded border-gray-300"
          />
          <span className="text-gray-600">Anonymize coaches</span>
        </label>
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
                  {evalData.map((ev, i) => (
                    <tr key={i} className="hover:bg-gray-50">
                      <td className="px-4 py-3 text-sm font-medium">{getCoachDisplayName(ev.coachId, ev.coachName)}</td>
                      <td className="px-4 py-3 text-sm text-center">{ev.attitude}</td>
                      <td className="px-4 py-3 text-sm text-center">{ev.effort}</td>
                      <td className="px-4 py-3 text-sm text-center">{ev.footballIQ}</td>
                      <td className="px-4 py-3 text-sm text-center">{ev.generalSkill}</td>
                      <td className="px-4 py-3 text-sm text-center">{ev.positionSkill}</td>
                      <td className="px-4 py-3 text-sm text-center font-bold">{ev.totalScore}</td>
                    </tr>
                  ))}
                  {/* Average row */}
                  {averages && (
                    <tr className="bg-blue-50 font-semibold">
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
