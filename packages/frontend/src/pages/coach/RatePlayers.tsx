import React, { useState, useEffect, useRef, useCallback } from 'react';
import { myPlayers, evaluations } from '../../api';

interface PlayerWithEval {
  id: string;
  name: string;
  number: string;
  primaryPosition: string;
  secondaryPosition: string;
  evaluated: boolean;
  evaluation: {
    attitude: number;
    effort: number;
    footballIQ: number;
    generalSkill: number;
    positionSkill: number;
    totalScore: number;
  } | null;
}

type RatingField = 'attitude' | 'effort' | 'footballIQ' | 'generalSkill' | 'positionSkill';

const RATING_FIELDS: { key: RatingField; label: string }[] = [
  { key: 'attitude', label: 'Attitude' },
  { key: 'effort', label: 'Effort' },
  { key: 'footballIQ', label: 'Football IQ' },
  { key: 'generalSkill', label: 'General Skill' },
  { key: 'positionSkill', label: 'Position Skill' },
];

export default function RatePlayers() {
  const [players, setPlayers] = useState<PlayerWithEval[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [localRatings, setLocalRatings] = useState<Record<string, Record<RatingField, string>>>({});
  const [sortBy, setSortBy] = useState<'number' | 'name'>('number');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const savingRef = useRef<Record<string, boolean>>({});

  useEffect(() => {
    loadPlayers();
  }, []);

  const loadPlayers = async () => {
    try {
      const data = await myPlayers.list();
      setPlayers(data.players);
      // Initialize local ratings from loaded data
      const ratings: Record<string, Record<RatingField, string>> = {};
      for (const p of data.players) {
        ratings[p.id] = {
          attitude: p.evaluation ? String(p.evaluation.attitude) : '',
          effort: p.evaluation ? String(p.evaluation.effort) : '',
          footballIQ: p.evaluation ? String(p.evaluation.footballIQ) : '',
          generalSkill: p.evaluation ? String(p.evaluation.generalSkill) : '',
          positionSkill: p.evaluation ? String(p.evaluation.positionSkill) : '',
        };
      }
      setLocalRatings(ratings);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const saveRating = useCallback(async (playerId: string, ratings: Record<RatingField, string>) => {
    // Don't save if any field is empty (incomplete rating)
    const allFilled = RATING_FIELDS.every((f) => ratings[f.key] && ratings[f.key].trim() !== '');
    if (!allFilled) return;
    if (savingRef.current[playerId]) return;
    savingRef.current[playerId] = true;
    try {
      await evaluations.submit({
        playerId,
        ...ratings,
      });
      setError('');
      // Reload to update the evaluated status and total
      const data = await myPlayers.list();
      setPlayers(data.players);
    } catch (err: any) {
      setError(err.message);
    } finally {
      savingRef.current[playerId] = false;
    }
  }, []);

  const handleRatingChange = (playerId: string, field: RatingField, value: string) => {
    setLocalRatings((prev) => ({
      ...prev,
      [playerId]: {
        ...prev[playerId],
        [field]: value,
      },
    }));
  };

  const handleRatingBlur = (playerId: string) => {
    const ratings = localRatings[playerId];
    if (!ratings) return;
    saveRating(playerId, ratings);
  };

  const computeTotal = (playerId: string): number => {
    const ratings = localRatings[playerId];
    if (!ratings) return 0;
    return RATING_FIELDS.reduce((sum, { key }) => {
      const val = parseInt(ratings[key], 10);
      return sum + (isNaN(val) ? 0 : Math.min(10, Math.max(1, val)));
    }, 0);
  };

  const toggleSort = (field: 'number' | 'name') => {
    if (sortBy === field) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortBy(field);
      setSortDir('asc');
    }
  };

  const sortedPlayers = [...players].sort((a, b) => {
    if (sortBy === 'number') {
      const diff = parseInt(a.number, 10) - parseInt(b.number, 10);
      return sortDir === 'asc' ? diff : -diff;
    }
    const cmp = a.name.localeCompare(b.name);
    return sortDir === 'asc' ? cmp : -cmp;
  });

  if (loading) return <div className="text-center py-8">Loading your players...</div>;

  return (
    <div>
      <h2 className="text-2xl font-bold mb-6">Rate Players</h2>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded mb-4">
          {error}
        </div>
      )}

      {players.length === 0 ? (
        <p className="text-gray-500">No players assigned to you yet.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full bg-white rounded-lg shadow-sm border">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase cursor-pointer hover:text-gray-700" onClick={() => toggleSort('name')}>
                  Player Name {sortBy === 'name' && (sortDir === 'asc' ? '▲' : '▼')}
                </th>
                <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase cursor-pointer hover:text-gray-700" onClick={() => toggleSort('number')}>
                  # {sortBy === 'number' && (sortDir === 'asc' ? '▲' : '▼')}
                </th>
                <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase">Primary Pos</th>
                <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase">Secondary Pos</th>
                {RATING_FIELDS.map(({ key, label }) => (
                  <th key={key} className="px-3 py-3 text-center text-xs font-medium text-gray-500 uppercase">{label}</th>
                ))}
                <th className="px-3 py-3 text-center text-xs font-medium text-gray-500 uppercase">Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {sortedPlayers.map((player) => (
                <tr key={player.id} className="hover:bg-gray-50">
                  <td className="px-3 py-2 text-sm font-medium">{player.name}</td>
                  <td className="px-3 py-2 text-sm text-gray-500">{player.number}</td>
                  <td className="px-3 py-2 text-sm text-gray-500">{player.primaryPosition}</td>
                  <td className="px-3 py-2 text-sm text-gray-500">{player.secondaryPosition}</td>
                  {RATING_FIELDS.map(({ key }) => (
                    <td key={key} className="px-2 py-2">
                      <input
                        type="number"
                        min="1"
                        max="10"
                        value={localRatings[player.id]?.[key] ?? '5'}
                        onChange={(e) => handleRatingChange(player.id, key, e.target.value)}
                        onBlur={() => handleRatingBlur(player.id)}
                        className="w-14 px-2 py-1 border rounded text-center text-sm"
                      />
                    </td>
                  ))}
                  <td className="px-3 py-2 text-sm font-bold text-center">{computeTotal(player.id)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
