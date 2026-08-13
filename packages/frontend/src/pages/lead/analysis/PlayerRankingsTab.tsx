import React, { useState } from 'react';
import type { NormalizedPlayerScore } from '@player-eval/shared';

interface Props {
  rankings: NormalizedPlayerScore[];
}

type SortField = 'normalizedTotal' | 'rawTotal' | 'attitude' | 'effort' | 'footballIQ' | 'generalSkill' | 'positionSkill' | 'playerName' | 'playerNumber' | 'primaryPosition' | 'secondaryPosition' | 'evaluationCount' | 'sem' | 'ci95';

const STRING_FIELDS: Set<SortField> = new Set(['playerName', 'playerNumber', 'primaryPosition', 'secondaryPosition']);

/** Visual reliability indicator based on SEM and sample size */
function ReliabilityBadge({ sem, ci95, n }: { sem: number; ci95: number; n: number }) {
  // Classify reliability: lower CI relative to score range is better
  // Using CI95 as the key metric - thresholds tuned for 5-category scoring (total ~5-50 range)
  let color: string;
  let label: string;

  if (n < 3) {
    color = 'bg-gray-100 text-gray-500';
    label = 'Low n';
  } else if (ci95 <= 1.5) {
    color = 'bg-green-100 text-green-700';
    label = 'High';
  } else if (ci95 <= 3.0) {
    color = 'bg-yellow-100 text-yellow-700';
    label = 'Moderate';
  } else {
    color = 'bg-red-100 text-red-700';
    label = 'Low';
  }

  return (
    <span
      className={`inline-block px-1.5 py-0.5 text-xs rounded ${color} cursor-help`}
      title={`SEM: ${sem} · 95% CI: ±${ci95} · n=${n}\nSmaller CI = more reliable rating`}
    >
      {label}
    </span>
  );
}

export default function PlayerRankingsTab({ rankings }: Props) {
  const [sortBy, setSortBy] = useState<SortField>('normalizedTotal');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

  const handleSort = (field: SortField) => {
    if (sortBy === field) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortBy(field);
      // Default direction: asc for strings, desc for numbers
      setSortDir(STRING_FIELDS.has(field) ? 'asc' : 'desc');
    }
  };

  const sorted = [...rankings].sort((a, b) => {
    let cmp: number;
    if (sortBy === 'playerName') {
      cmp = a.playerName.localeCompare(b.playerName);
    } else if (sortBy === 'playerNumber') {
      cmp = a.playerNumber.localeCompare(b.playerNumber, undefined, { numeric: true });
    } else if (sortBy === 'primaryPosition') {
      cmp = (a.primaryPosition || '').localeCompare(b.primaryPosition || '');
    } else if (sortBy === 'secondaryPosition') {
      cmp = (a.secondaryPosition || '').localeCompare(b.secondaryPosition || '');
    } else if (sortBy === 'evaluationCount') {
      cmp = a.evaluationCount - b.evaluationCount;
    } else if (sortBy === 'sem') {
      cmp = a.sem - b.sem;
    } else if (sortBy === 'ci95') {
      cmp = a.ci95 - b.ci95;
    } else if (sortBy === 'normalizedTotal') {
      cmp = a.normalizedTotal - b.normalizedTotal;
    } else if (sortBy === 'rawTotal') {
      cmp = a.rawTotal - b.rawTotal;
    } else {
      cmp = a.categories[sortBy] - b.categories[sortBy];
    }
    return sortDir === 'asc' ? cmp : -cmp;
  });


  if (rankings.length === 0) {
    return <p className="text-gray-500">No evaluation data available.</p>;
  }

  const SortHeader = ({ field, label, align }: { field: SortField; label: string; align?: string }) => (
    <th
      className={`px-3 py-2 ${align === 'left' ? 'text-left' : 'text-center'} text-xs font-medium text-gray-500 uppercase cursor-pointer hover:text-gray-700`}
      onClick={() => handleSort(field)}
    >
      {label} {sortBy === field && (sortDir === 'asc' ? '↑' : '↓')}
    </th>
  );

  return (
    <div className="overflow-x-auto">
      <table className="w-full bg-white rounded-lg shadow-sm border text-sm">
        <thead className="bg-gray-50">
          <tr>
            <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Rank</th>
            <SortHeader field="playerNumber" label="#" align="left" />
            <SortHeader field="playerName" label="Player" align="left" />
            <SortHeader field="primaryPosition" label="Primary" align="left" />
            <SortHeader field="secondaryPosition" label="Secondary" align="left" />
            <SortHeader field="evaluationCount" label="Evals" />
            <SortHeader field="attitude" label="Attitude" />
            <SortHeader field="effort" label="Effort" />
            <SortHeader field="footballIQ" label="Football IQ" />
            <SortHeader field="generalSkill" label="General" />
            <SortHeader field="positionSkill" label="Position" />
            <SortHeader field="rawTotal" label="Raw Avg" />
            <SortHeader field="normalizedTotal" label="Normalized" />
            <SortHeader field="ci95" label="±95% CI" />
            <SortHeader field="sem" label="Reliability" />
          </tr>
        </thead>

        <tbody className="divide-y divide-gray-200">
          {sorted.map((player, idx) => (
            <tr key={player.playerId} className="hover:bg-gray-50">
              <td className="px-3 py-2 text-gray-400">{idx + 1}</td>
              <td className="px-3 py-2 text-gray-500">{player.playerNumber}</td>
              <td className="px-3 py-2 font-medium">{player.playerName}</td>
              <td className="px-3 py-2 text-gray-500">{player.primaryPosition || '--'}</td>
              <td className="px-3 py-2 text-gray-500">{player.secondaryPosition || '--'}</td>
              <td className="px-3 py-2 text-center text-gray-500">{player.evaluationCount}</td>
              <td className="px-3 py-2 text-center">{player.categories.attitude}</td>
              <td className="px-3 py-2 text-center">{player.categories.effort}</td>
              <td className="px-3 py-2 text-center">{player.categories.footballIQ}</td>
              <td className="px-3 py-2 text-center">{player.categories.generalSkill}</td>
              <td className="px-3 py-2 text-center">{player.categories.positionSkill}</td>
              <td className="px-3 py-2 text-center text-gray-500">{player.rawTotal}</td>
              <td className="px-3 py-2 text-center font-bold text-blue-700">{player.normalizedTotal}</td>
              <td className="px-3 py-2 text-center text-gray-500 text-xs">±{player.ci95}</td>
              <td className="px-3 py-2 text-center">
                <ReliabilityBadge sem={player.sem} ci95={player.ci95} n={player.evaluationCount} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
