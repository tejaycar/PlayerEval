import React from 'react';
import type { CoachReliabilityMetrics } from '@player-eval/shared';

interface Props {
  reliability: CoachReliabilityMetrics[];
  coaches: { id: string; name: string }[];
  /** Full player list so we can show pre-exclusion checkboxes for un-rated cells */
  players: { id: string; name: string; number: string }[];
  excludedRatings: Array<{ coachId: string; playerId: string }>;
  onExcludedRatingsChange: (ratings: Array<{ coachId: string; playerId: string }>) => void;
}

interface PlayerInfo {
  playerId: string;
  playerName: string;
  playerNumber: string;
}

export default function ExclusionsTab({ reliability, coaches, players, excludedRatings, onExcludedRatingsChange }: Props) {
  // Build a map of coachId -> playerId -> deviation value
  const deviationMap = new Map<string, Map<string, number>>();
  const playerMap = new Map<string, PlayerInfo>();

  // First seed playerMap from the full players list
  for (const p of players) {
    playerMap.set(p.id, { playerId: p.id, playerName: p.name, playerNumber: p.number });
  }

  for (const coach of reliability) {
    const playerDevMap = new Map<string, number>();
    for (const pd of coach.playerDeviations) {
      playerDevMap.set(pd.playerId, pd.deviation);
      // Also add to playerMap in case analysis returned names not in the player list
      if (!playerMap.has(pd.playerId)) {
        playerMap.set(pd.playerId, {
          playerId: pd.playerId,
          playerName: pd.playerName,
          playerNumber: pd.playerNumber,
        });
      }
    }
    deviationMap.set(coach.coachId, playerDevMap);
  }

  // Sort coaches alphabetically by name
  const sortedCoaches = [...coaches].sort((a, b) => a.name.localeCompare(b.name));

  // Sort players alphabetically by name
  const sortedPlayers = Array.from(playerMap.values()).sort((a, b) =>
    a.playerName.localeCompare(b.playerName)
  );

  const isExcluded = (coachId: string, playerId: string) => {
    return excludedRatings.some((r) => r.coachId === coachId && r.playerId === playerId);
  };

  const toggleExclusion = (coachId: string, playerId: string) => {
    const exists = isExcluded(coachId, playerId);
    let updated: Array<{ coachId: string; playerId: string }>;
    if (exists) {
      updated = excludedRatings.filter((r) => !(r.coachId === coachId && r.playerId === playerId));
    } else {
      updated = [...excludedRatings, { coachId, playerId }];
    }
    onExcludedRatingsChange(updated);
  };

  const getCellColor = (dev: number) => {
    const abs = Math.abs(dev);
    if (abs <= 1.5) return 'bg-green-100';
    if (abs <= 3) return 'bg-yellow-100';
    return 'bg-red-100';
  };

  if (sortedPlayers.length === 0) {
    return <p className="text-gray-500">No evaluation data available for exclusion management.</p>;
  }

  return (
    <div>
      <p className="text-sm text-gray-600 mb-4">
        Toggle individual coach-player rating exclusions. Colors indicate deviation from median:
        <span className="inline-block ml-2 px-2 py-0.5 bg-green-100 rounded text-xs">low (&le;1.5)</span>
        <span className="inline-block ml-1 px-2 py-0.5 bg-yellow-100 rounded text-xs">moderate (&le;3)</span>
        <span className="inline-block ml-1 px-2 py-0.5 bg-red-100 rounded text-xs">high (&gt;3)</span>
        <span className="inline-block ml-1 px-2 py-0.5 bg-purple-50 border border-purple-200 rounded text-xs">pre-excluded (no rating yet)</span>
      </p>

      <div className="overflow-x-auto">
        <table className="bg-white rounded-lg shadow-sm border text-xs">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-2 py-2 text-left text-xs font-medium text-gray-500 uppercase sticky left-0 bg-gray-50 z-10">
                Player
              </th>
              {sortedCoaches.map((coach) => (
                <th key={coach.id} className="px-2 py-2 text-center text-xs font-medium text-gray-500 uppercase whitespace-nowrap">
                  {coach.name}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {sortedPlayers.map((player) => (
              <tr key={player.playerId}>
                <td className="px-2 py-1 font-medium whitespace-nowrap sticky left-0 bg-white z-10">
                  #{player.playerNumber} {player.playerName}
                </td>
                {sortedCoaches.map((coach) => {
                  const devMap = deviationMap.get(coach.id);
                  const dev = devMap?.get(player.playerId);
                  const excluded = isExcluded(coach.id, player.playerId);
                  if (dev === undefined) {
                    // No rating exists — show pre-exclusion checkbox
                    return (
                      <td key={coach.id} className={`px-2 py-1 text-center ${excluded ? 'bg-purple-50' : ''}`}>
                        <div className="flex flex-col items-center gap-0.5">
                          <span className="text-xs text-gray-300">—</span>
                          <input
                            type="checkbox"
                            checked={excluded}
                            onChange={() => toggleExclusion(coach.id, player.playerId)}
                            className="w-3 h-3 rounded border-gray-300 accent-purple-500"
                            title={excluded ? 'Pre-excluded: click to remove exclusion' : 'Pre-exclude: will auto-exclude if rated later'}
                          />
                        </div>
                      </td>
                    );
                  }
                  return (
                    <td key={coach.id} className={`px-2 py-1 text-center ${getCellColor(dev)}`}>
                      <div className="flex flex-col items-center gap-0.5">
                        <span className="text-xs font-mono">
                          {dev > 0 ? '+' : ''}{dev.toFixed(1)}
                        </span>
                        <input
                          type="checkbox"
                          checked={excluded}
                          onChange={() => toggleExclusion(coach.id, player.playerId)}
                          className="w-3 h-3 rounded border-gray-400"
                          title={excluded ? 'Click to include this rating' : 'Click to exclude this rating'}
                        />
                      </div>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {excludedRatings.length > 0 && (
        <p className="text-xs text-gray-500 mt-3">
          {excludedRatings.length} individual rating(s) excluded.
        </p>
      )}
    </div>
  );
}
