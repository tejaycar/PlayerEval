import React from 'react';
import type { CoachReliabilityMetrics } from '@player-eval/shared';

interface Props {
  reliability: CoachReliabilityMetrics[];
  coaches: { id: string; name: string }[];
  players: { id: string; name: string; number: string }[];
  assignments: { coachId: string; playerId: string }[];
  excludedRatings: Array<{ coachId: string; playerId: string }>;
  onExcludedRatingsChange: (ratings: Array<{ coachId: string; playerId: string }>) => void;
}

export default function ExclusionsTab({ reliability, coaches, players, assignments, excludedRatings, onExcludedRatingsChange }: Props) {
  // Build a map of coachId -> playerId -> deviation value (from existing evaluations)
  const deviationMap = new Map<string, Map<string, number>>();
  for (const coach of reliability) {
    const playerDevMap = new Map<string, number>();
    for (const pd of coach.playerDeviations) {
      playerDevMap.set(pd.playerId, pd.deviation);
    }
    deviationMap.set(coach.coachId, playerDevMap);
  }

  // Build assignment set for quick lookup
  const assignmentSet = new Set(assignments.map((a) => `${a.coachId}|${a.playerId}`));

  // A cell is relevant if the coach is assigned to the player OR an evaluation exists
  const isRelevantCell = (coachId: string, playerId: string) => {
    return assignmentSet.has(`${coachId}|${playerId}`) || deviationMap.get(coachId)?.has(playerId);
  };

  // Sort coaches alphabetically by name
  const sortedCoaches = [...coaches].sort((a, b) => a.name.localeCompare(b.name));

  // Sort players alphabetically by name
  const sortedPlayers = [...players].sort((a, b) => a.name.localeCompare(b.name));

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

  const getCellColor = (dev: number | undefined) => {
    if (dev === undefined) return '';
    const abs = Math.abs(dev);
    if (abs <= 1.5) return 'bg-green-100';
    if (abs <= 3) return 'bg-yellow-100';
    return 'bg-red-100';
  };

  if (sortedPlayers.length === 0) {
    return <p className="text-gray-500">No players available for exclusion management.</p>;
  }

  return (
    <div>
      <p className="text-sm text-gray-600 mb-4">
        Toggle individual coach-player rating exclusions. Check a box to pre-exclude a rating even before it's submitted.
        Colors indicate deviation from median (where an evaluation exists):
        <span className="inline-block ml-2 px-2 py-0.5 bg-green-100 rounded text-xs">low (&le;1.5)</span>
        <span className="inline-block ml-1 px-2 py-0.5 bg-yellow-100 rounded text-xs">moderate (&le;3)</span>
        <span className="inline-block ml-1 px-2 py-0.5 bg-red-100 rounded text-xs">high (&gt;3)</span>
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
              <tr key={player.id}>
                <td className="px-2 py-1 font-medium whitespace-nowrap sticky left-0 bg-white z-10">
                  #{player.number} {player.name}
                </td>
                {sortedCoaches.map((coach) => {
                  const relevant = isRelevantCell(coach.id, player.id);
                  if (!relevant) {
                    return (
                      <td key={coach.id} className="px-2 py-1 text-center text-gray-200">
                        &middot;
                      </td>
                    );
                  }
                  const devMap = deviationMap.get(coach.id);
                  const dev = devMap?.get(player.id);
                  const excluded = isExcluded(coach.id, player.id);
                  const hasEval = dev !== undefined;
                  return (
                    <td key={coach.id} className={`px-2 py-1 text-center ${hasEval ? getCellColor(dev) : (excluded ? 'bg-red-50' : 'bg-gray-50')}`}>
                      <div className="flex flex-col items-center gap-0.5">
                        {hasEval ? (
                          <span className="text-xs font-mono">
                            {dev > 0 ? '+' : ''}{dev.toFixed(1)}
                          </span>
                        ) : (
                          <span className="text-xs text-gray-400 italic">pending</span>
                        )}
                        <input
                          type="checkbox"
                          checked={excluded}
                          onChange={() => toggleExclusion(coach.id, player.id)}
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
