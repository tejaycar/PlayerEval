import React, { useState, useEffect } from 'react';
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

interface RatingForm {
  attitude: string;
  effort: string;
  footballIQ: string;
  generalSkill: string;
  positionSkill: string;
}

export default function RatePlayers() {
  const [players, setPlayers] = useState<PlayerWithEval[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [editingPlayer, setEditingPlayer] = useState<string | null>(null);
  const [ratingForm, setRatingForm] = useState<RatingForm>({
    attitude: '5',
    effort: '5',
    footballIQ: '5',
    generalSkill: '5',
    positionSkill: '5',
  });

  useEffect(() => {
    loadPlayers();
  }, []);

  const loadPlayers = async () => {
    try {
      const data = await myPlayers.list();
      setPlayers(data.players);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const startRating = (player: PlayerWithEval) => {
    setEditingPlayer(player.id);
    if (player.evaluation) {
      setRatingForm({
        attitude: String(player.evaluation.attitude),
        effort: String(player.evaluation.effort),
        footballIQ: String(player.evaluation.footballIQ),
        generalSkill: String(player.evaluation.generalSkill),
        positionSkill: String(player.evaluation.positionSkill),
      });
    } else {
      setRatingForm({ attitude: '5', effort: '5', footballIQ: '5', generalSkill: '5', positionSkill: '5' });
    }
  };

  const submitRating = async () => {
    if (!editingPlayer) return;
    try {
      await evaluations.submit({
        playerId: editingPlayer,
        ...ratingForm,
      });
      setEditingPlayer(null);
      await loadPlayers();
      setError('');
    } catch (err: any) {
      setError(err.message);
    }
  };

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
        <div className="space-y-3">
          {players.map((player) => (
            <div
              key={player.id}
              className={`bg-white rounded-lg shadow-sm border p-4 ${
                player.evaluated ? 'border-green-200' : 'border-gray-200'
              }`}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <span className="text-lg font-bold text-gray-400">#{player.number}</span>
                  <div>
                    <div className="font-medium">{player.name}</div>
                    <div className="text-xs text-gray-500">
                      {player.primaryPosition}
                      {player.secondaryPosition && ` / ${player.secondaryPosition}`}
                    </div>
                  </div>
                  {player.evaluated && (
                    <span className="px-2 py-0.5 bg-green-100 text-green-700 rounded text-xs">
                      Rated ({player.evaluation?.totalScore}/50)
                    </span>
                  )}
                </div>
                <button
                  onClick={() => startRating(player)}
                  className={`px-4 py-2 rounded text-sm font-medium ${
                    player.evaluated
                      ? 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                      : 'bg-blue-600 text-white hover:bg-blue-700'
                  }`}
                >
                  {player.evaluated ? 'Edit Rating' : 'Rate'}
                </button>
              </div>

              {editingPlayer === player.id && (
                <div className="mt-4 pt-4 border-t">
                  <div className="grid grid-cols-5 gap-4">
                    {(['attitude', 'effort', 'footballIQ', 'generalSkill', 'positionSkill'] as const).map((cat) => (
                      <div key={cat}>
                        <label className="block text-xs font-medium text-gray-600 mb-1">
                          {cat === 'footballIQ' ? 'Football IQ' : cat === 'generalSkill' ? 'General Skill' : cat === 'positionSkill' ? 'Position Skill' : cat.charAt(0).toUpperCase() + cat.slice(1)}
                        </label>
                        <input
                          type="number"
                          min="1"
                          max="10"
                          value={ratingForm[cat]}
                          onChange={(e) => setRatingForm({ ...ratingForm, [cat]: e.target.value })}
                          className="w-full px-2 py-1 border rounded text-center text-sm"
                        />
                      </div>
                    ))}
                  </div>
                  <div className="mt-3 flex gap-2">
                    <button
                      onClick={submitRating}
                      className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 text-sm"
                    >
                      Save Rating
                    </button>
                    <button
                      onClick={() => setEditingPlayer(null)}
                      className="px-4 py-2 bg-gray-200 text-gray-700 rounded hover:bg-gray-300 text-sm"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
