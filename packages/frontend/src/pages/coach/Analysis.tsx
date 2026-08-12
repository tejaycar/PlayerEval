import React, { useState, useEffect, useMemo } from 'react';
import { evaluations, team, coaches as coachesApi, getStoredUser } from '../../api';
import type { BoxPlotStats, CoachReliabilityMetrics } from '@player-eval/shared';
import PlayerBoxPlotsTab from '../lead/analysis/PlayerBoxPlotsTab';
import CoachAnalysisTab from '../lead/analysis/CoachAnalysisTab';

type TabId = 'boxplots' | 'coachAnalysis';

export default function CoachAnalysis() {
  const [activeTab, setActiveTab] = useState<TabId>('boxplots');
  const [boxPlots, setBoxPlots] = useState<BoxPlotStats[]>([]);
  const [coachReliability, setCoachReliability] = useState<CoachReliabilityMetrics[]>([]);
  const [coachList, setCoachList] = useState<{ id: string; name: string }[]>([]);
  const [excludedCoachIds, setExcludedCoachIds] = useState<string[]>([]);
  const [excludedRatings, setExcludedRatings] = useState<Array<{coachId: string; playerId: string}>>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [playerFilter, setPlayerFilter] = useState('');

  const currentUser = getStoredUser();

  // Load on mount and reload on every tab change (picks up lead's latest exclusions)
  useEffect(() => {
    loadData();
  }, [activeTab]);

  const loadData = async () => {
    setLoading(true);
    try {
      // Load coaches list for anonymization
      const coachData = await coachesApi.list();
      setCoachList(coachData.coaches.map((c: any) => ({ id: c.id, name: c.name })));

      // Load the lead's saved exclusions and apply them (always "exclude flagged")
      const [coachExclusionData, ratingsData] = await Promise.all([
        team.getExcludedCoaches(),
        team.getExcludedRatings(),
      ]);
      const excludedIds = coachExclusionData.excludedCoachIds || [];
      const excludedRatingsData = ratingsData.excludedRatings || [];
      setExcludedCoachIds(excludedIds);
      setExcludedRatings(excludedRatingsData);

      // Get analysis with those exclusions
      const data = await evaluations.analysis(excludedIds, excludedRatingsData);
      setBoxPlots(data.boxPlots);
      setCoachReliability(data.coachReliability);
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

  // Anonymize coach reliability: all coaches get "Coach N" except current user
  const anonymizedReliability = useMemo(() => {
    if (!coachReliability.length) return [];
    const sortedCoaches = [...coachList].sort((a, b) => a.name.localeCompare(b.name));
    const nameMap = new Map<string, string>();
    sortedCoaches.forEach((c, i) => {
      nameMap.set(c.id, `Coach ${i + 1}`);
    });

    return coachReliability.map((cr) => ({
      ...cr,
      coachName: cr.coachId === currentUser?.coachId ? cr.coachName : (nameMap.get(cr.coachId) || cr.coachName),
    }));
  }, [coachReliability, coachList, currentUser?.coachId]);

  const tabs: { id: TabId; label: string }[] = [
    { id: 'boxplots', label: 'Box Plots' },
    { id: 'coachAnalysis', label: 'Coach Analysis' },
  ];

  if (loading && !boxPlots.length && !coachReliability.length) {
    return <div className="text-center py-8">Loading analysis...</div>;
  }

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

      {activeTab === 'boxplots' && (
        <div className="mb-4">
          <input
            type="text"
            placeholder="Filter players by name or number..."
            value={playerFilter}
            onChange={(e) => setPlayerFilter(e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded w-72 text-sm"
          />
        </div>
      )}

      {/* Tabs */}
      <div className="border-b border-gray-200 mb-6">
        <nav className="flex gap-0">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px ${
                activeTab === tab.id
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </nav>
      </div>

      {activeTab === 'boxplots' && (
        boxPlots.length === 0 ? (
          <p className="text-gray-500">No evaluation data available yet.</p>
        ) : (
          <PlayerBoxPlotsTab boxPlots={filteredBoxPlots} />
        )
      )}

      {activeTab === 'coachAnalysis' && (
        <CoachAnalysisTab reliability={anonymizedReliability} excludedCoachIds={excludedCoachIds} excludedRatings={excludedRatings} />
      )}
    </div>
  );
}
