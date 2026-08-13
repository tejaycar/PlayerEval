import React, { useState, useEffect, useMemo } from 'react';
import { evaluations, team } from '../../api';
import type { NormalizedPlayerScore, RatingCategory } from '@player-eval/shared';

/** Format number to at most 2 decimal places, no trailing zeros */
const fmt = (n: number) => +n.toFixed(2);

type SortField = 'normalizedTotal' | 'medianTotal' | 'attitude' | 'effort' | 'footballIQ' | 'generalSkill' | 'positionSkill';

export default function Results() {
  const [rankings, setRankings] = useState<NormalizedPlayerScore[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [sortBy, setSortBy] = useState<SortField>('normalizedTotal');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [positionFilter, setPositionFilter] = useState<string>('');
  const [disabled, setDisabled] = useState(false);

  useEffect(() => {
    checkVisibilityAndLoad();
  }, []);

  const checkVisibilityAndLoad = async () => {
    try {
      const settings = await team.getSettings();
      if (!settings.coachResultsVisible) {
        setDisabled(true);
        setLoading(false);
        return;
      }
      await loadResults();
    } catch (err: any) {
      setError(err.message);
      setLoading(false);
    }
  };

  const loadResults = async () => {
    try {
      // Load the lead's saved exclusions and mode
      const [coachExclusionData, ratingsData, modeData] = await Promise.all([
        team.getExcludedCoaches(),
        team.getExcludedRatings(),
        team.getExclusionMode(),
      ]);
      const savedMode = modeData.exclusionMode || 'exclude_flagged';
      const excludedIds = savedMode === 'include_all' ? [] : (coachExclusionData.excludedCoachIds || []);
      const excludedRatings = savedMode === 'include_all' ? [] : (ratingsData.excludedRatings || []);
      // Get analysis with exclusions based on mode
      const data = await evaluations.analysis(excludedIds, excludedRatings);
      setRankings(data.playerRankings);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleSort = (field: SortField) => {
    if (sortBy === field) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortBy(field);
      setSortDir('desc');
    }
  };

  const uniquePositions = useMemo(() => {
    const positions = new Set<string>();
    rankings.forEach((player) => {
      if (player.primaryPosition) positions.add(player.primaryPosition);
      if (player.secondaryPosition) positions.add(player.secondaryPosition);
    });
    return Array.from(positions).sort();
  }, [rankings]);

  const filteredRankings = useMemo(() => {
    if (!positionFilter) return rankings;
    return rankings.filter(
      (player) =>
        player.primaryPosition === positionFilter ||
        player.secondaryPosition === positionFilter
    );
  }, [rankings, positionFilter]);

  const sorted = [...filteredRankings].sort((a, b) => {
    let aVal: number, bVal: number;
    if (sortBy === 'normalizedTotal') {
      aVal = a.normalizedTotal;
      bVal = b.normalizedTotal;
    } else if (sortBy === 'medianTotal') {
      aVal = a.medianTotal;
      bVal = b.medianTotal;
    } else {
      aVal = a.categories[sortBy];
      bVal = b.categories[sortBy];
    }
    return sortDir === 'asc' ? aVal - bVal : bVal - aVal;
  });

  const SortHeader = ({ field, label }: { field: SortField; label: string }) => (
    <th
      className="px-3 py-2 text-center text-xs font-medium text-gray-500 uppercase cursor-pointer hover:text-gray-700"
      onClick={() => handleSort(field)}
    >
      {label} {sortBy === field && (sortDir === 'asc' ? '↑' : '↓')}
    </th>
  );

  if (loading) return <div className="text-center py-8">Loading results...</div>;

  if (disabled) {
    return (
      <div className="text-center py-12">
        <div className="bg-gray-50 border border-gray-200 rounded-lg p-8 max-w-md mx-auto">
          <h3 className="text-lg font-semibold text-gray-700 mb-2">Results Not Available</h3>
          <p className="text-gray-500">Results are not currently available. Your lead has not enabled this view.</p>
        </div>
      </div>
    );
  }

  return (
    <div>
      <h2 className="text-2xl font-bold mb-6">Player Rankings</h2>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded mb-4">
          {error}
        </div>
      )}

      <div className="mb-4">
        <label htmlFor="position-filter" className="text-sm font-medium text-gray-700 mr-2">
          Filter by Position:
        </label>
        <select
          id="position-filter"
          value={positionFilter}
          onChange={(e) => setPositionFilter(e.target.value)}
          className="border border-gray-300 rounded px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="">All Positions</option>
          {uniquePositions.map((pos) => (
            <option key={pos} value={pos}>
              {pos}
            </option>
          ))}
        </select>
      </div>

      {rankings.length === 0 ? (
        <p className="text-gray-500">No evaluation data available yet.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full bg-white rounded-lg shadow-sm border text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Rank</th>
                <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">#</th>
                <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Player</th>
                <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Primary</th>
                <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Secondary</th>
                <th className="px-3 py-2 text-center text-xs font-medium text-gray-500 uppercase">Evals</th>
                <SortHeader field="attitude" label="Attitude" />
                <SortHeader field="effort" label="Effort" />
                <SortHeader field="footballIQ" label="Football IQ" />
                <SortHeader field="generalSkill" label="General" />
                <SortHeader field="positionSkill" label="Position" />
                <SortHeader field="normalizedTotal" label="Mean" />
                <SortHeader field="medianTotal" label="Median" />
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
                  <td className="px-3 py-2 text-center">{fmt(player.categories.attitude)}</td>
                  <td className="px-3 py-2 text-center">{fmt(player.categories.effort)}</td>
                  <td className="px-3 py-2 text-center">{fmt(player.categories.footballIQ)}</td>
                  <td className="px-3 py-2 text-center">{fmt(player.categories.generalSkill)}</td>
                  <td className="px-3 py-2 text-center">{fmt(player.categories.positionSkill)}</td>
                  <td className="px-3 py-2 text-center font-bold text-blue-700">{fmt(player.normalizedTotal)}</td>
                  <td className="px-3 py-2 text-center font-medium text-blue-600">{fmt(player.medianTotal)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
