import React, { useState, useEffect, useMemo } from 'react';
import { evaluations, team } from '../../api';
import type { BoxPlotStats } from '@player-eval/shared';
import PlayerBoxPlotsTab from '../lead/analysis/PlayerBoxPlotsTab';

export default function CoachAnalysis() {
  const [boxPlots, setBoxPlots] = useState<BoxPlotStats[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [playerFilter, setPlayerFilter] = useState('');

  useEffect(() => {
    loadAnalysis();
  }, []);

  const loadAnalysis = async () => {
    try {
      // Load the lead's saved exclusions
      const exclusionData = await team.getExcludedCoaches();
      const excludedIds = exclusionData.excludedCoachIds || [];
      // Get analysis with those exclusions
      const data = await evaluations.analysis(excludedIds);
      setBoxPlots(data.boxPlots);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const filteredBoxPlots = useMemo(() => {
    if (!playerFilter) return boxPlots;
    const lower = playerFilter.toLowerCase();
    return boxPlots.filter(
      (p) =>
        p.playerName.toLowerCase().includes(lower) ||
        p.playerNumber.includes(playerFilter)
    );
  }, [boxPlots, playerFilter]);

  if (loading) return <div className="text-center py-8">Loading analysis...</div>;

  return (
    <div>
      <h2 className="text-2xl font-bold mb-4">Player Analysis</h2>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded mb-4">
          {error}
        </div>
      )}

      <p className="text-sm text-gray-600 mb-4">
        Box plots show normalized score distribution for each player across all evaluators.
        Wider boxes indicate less agreement among coaches.
      </p>

      <div className="mb-4">
        <input
          type="text"
          placeholder="Filter players by name or number..."
          value={playerFilter}
          onChange={(e) => setPlayerFilter(e.target.value)}
          className="px-3 py-2 border border-gray-300 rounded w-72 text-sm"
        />
      </div>

      {boxPlots.length === 0 ? (
        <p className="text-gray-500">No evaluation data available yet.</p>
      ) : (
        <PlayerBoxPlotsTab boxPlots={filteredBoxPlots} />
      )}
    </div>
  );
}
