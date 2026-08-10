import React, { useState, useEffect } from 'react';
import { evaluations } from '../../api';

interface PlayerSummary {
  playerId: string;
  playerName: string;
  playerNumber: string;
  primaryPosition: string;
  secondaryPosition: string;
  evaluationCount: number;
  avgAttitude: number;
  avgEffort: number;
  avgFootballIQ: number;
  avgGeneralSkill: number;
  avgPositionSkill: number;
  avgTotal: number;
}

const STRING_FIELDS = new Set(['playerName', 'playerNumber', 'primaryPosition', 'secondaryPosition']);

export default function Results() {
  const [summary, setSummary] = useState<PlayerSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [sortBy, setSortBy] = useState<string>('avgTotal');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

  useEffect(() => {
    loadSummary();
  }, []);

  const loadSummary = async () => {
    try {
      const data = await evaluations.summary();
      setSummary(data.summary);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleSort = (field: string) => {
    if (sortBy === field) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortBy(field);
      setSortDir(STRING_FIELDS.has(field) ? 'asc' : 'desc');
    }
  };

  const sortedSummary = [...summary].sort((a: any, b: any) => {
    const aVal = a[sortBy];
    const bVal = b[sortBy];
    if (STRING_FIELDS.has(sortBy)) {
      const cmp = String(aVal || '').localeCompare(String(bVal || ''));
      return sortDir === 'asc' ? cmp : -cmp;
    }
    return sortDir === 'asc' ? aVal - bVal : bVal - aVal;
  });

  const formatScore = (value: number, evalCount: number) => {
    if (evalCount === 0) return '--';
    return value;
  };

  if (loading) return <div className="text-center py-8">Loading results...</div>;

  return (
    <div>
      <h2 className="text-2xl font-bold mb-6">Results Summary</h2>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded mb-4">
          {error}
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="w-full bg-white rounded-lg shadow-sm border">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">#</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Player</th>
              <SortHeader field="primaryPosition" label="Primary Pos" sortBy={sortBy} sortDir={sortDir} onSort={handleSort} />
              <SortHeader field="secondaryPosition" label="Secondary Pos" sortBy={sortBy} sortDir={sortDir} onSort={handleSort} />
              <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Evals</th>
              <SortHeader field="avgAttitude" label="Attitude" sortBy={sortBy} sortDir={sortDir} onSort={handleSort} />
              <SortHeader field="avgEffort" label="Effort" sortBy={sortBy} sortDir={sortDir} onSort={handleSort} />
              <SortHeader field="avgFootballIQ" label="Football IQ" sortBy={sortBy} sortDir={sortDir} onSort={handleSort} />
              <SortHeader field="avgGeneralSkill" label="General Skill" sortBy={sortBy} sortDir={sortDir} onSort={handleSort} />
              <SortHeader field="avgPositionSkill" label="Position Skill" sortBy={sortBy} sortDir={sortDir} onSort={handleSort} />
              <SortHeader field="avgTotal" label="Total" sortBy={sortBy} sortDir={sortDir} onSort={handleSort} />
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {sortedSummary.map((player) => (
              <tr key={player.playerId} className="hover:bg-gray-50">
                <td className="px-4 py-3 text-sm text-gray-500">{player.playerNumber}</td>
                <td className="px-4 py-3 text-sm font-medium">{player.playerName}</td>
                <td className="px-4 py-3 text-sm text-center">{player.primaryPosition || '--'}</td>
                <td className="px-4 py-3 text-sm text-center">{player.secondaryPosition || '--'}</td>
                <td className="px-4 py-3 text-sm text-center">{player.evaluationCount}</td>
                <td className="px-4 py-3 text-sm text-center">{formatScore(player.avgAttitude, player.evaluationCount)}</td>
                <td className="px-4 py-3 text-sm text-center">{formatScore(player.avgEffort, player.evaluationCount)}</td>
                <td className="px-4 py-3 text-sm text-center">{formatScore(player.avgFootballIQ, player.evaluationCount)}</td>
                <td className="px-4 py-3 text-sm text-center">{formatScore(player.avgGeneralSkill, player.evaluationCount)}</td>
                <td className="px-4 py-3 text-sm text-center">{formatScore(player.avgPositionSkill, player.evaluationCount)}</td>
                <td className="px-4 py-3 text-sm text-center font-bold">{formatScore(player.avgTotal, player.evaluationCount)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function SortHeader({
  field,
  label,
  sortBy,
  sortDir,
  onSort,
}: {
  field: string;
  label: string;
  sortBy: string;
  sortDir: 'asc' | 'desc';
  onSort: (f: string) => void;
}) {
  const isActive = sortBy === field;
  return (
    <th
      className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase cursor-pointer hover:text-gray-700"
      onClick={() => onSort(field)}
    >
      {label} {isActive && (sortDir === 'asc' ? '↑' : '↓')}
    </th>
  );
}
