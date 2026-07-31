import React, { useState, useEffect } from 'react';
import { evaluations } from '../../api';

interface PlayerSummary {
  playerId: string;
  playerName: string;
  playerNumber: string;
  evaluationCount: number;
  avgAttitude: number;
  avgEffort: number;
  avgFootballIQ: number;
  avgGeneralSkill: number;
  avgPositionSkill: number;
  avgTotal: number;
}

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
      setSortDir('desc');
    }
  };

  const sortedSummary = [...summary].sort((a: any, b: any) => {
    const aVal = a[sortBy];
    const bVal = b[sortBy];
    return sortDir === 'asc' ? aVal - bVal : bVal - aVal;
  });

  if (loading) return <div className="text-center py-8">Loading results...</div>;

  return (
    <div>
      <h2 className="text-2xl font-bold mb-6">Results Summary</h2>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded mb-4">
          {error}
        </div>
      )}

      {summary.length === 0 ? (
        <p className="text-gray-500">No evaluations submitted yet.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full bg-white rounded-lg shadow-sm border">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">#</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Player</th>
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
                  <td className="px-4 py-3 text-sm text-center">{player.evaluationCount}</td>
                  <td className="px-4 py-3 text-sm text-center">{player.avgAttitude}</td>
                  <td className="px-4 py-3 text-sm text-center">{player.avgEffort}</td>
                  <td className="px-4 py-3 text-sm text-center">{player.avgFootballIQ}</td>
                  <td className="px-4 py-3 text-sm text-center">{player.avgGeneralSkill}</td>
                  <td className="px-4 py-3 text-sm text-center">{player.avgPositionSkill}</td>
                  <td className="px-4 py-3 text-sm text-center font-bold">{player.avgTotal}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
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
