import React, { useState, useEffect, useMemo } from 'react';
import { evaluations, coaches as coachesApi, team } from '../../api';
import type {
  AnalysisResponse,
  NormalizedPlayerScore,
  BoxPlotStats,
  CoachReliabilityMetrics,
  PlayerImpactWarning,
  ExcludedRating,
} from '@player-eval/shared';
import PlayerRankingsTab from './analysis/PlayerRankingsTab';
import PlayerBoxPlotsTab from './analysis/PlayerBoxPlotsTab';
import CoachAnalysisTab from './analysis/CoachAnalysisTab';
import DistributionTab from './analysis/DistributionTab';
import ExclusionsTab from './analysis/ExclusionsTab';

type TabId = 'rankings' | 'boxplots' | 'coachAnalysis' | 'distribution' | 'exclusions';

export default function Analysis() {
  const [activeTab, setActiveTab] = useState<TabId>('rankings');
  const [analysis, setAnalysis] = useState<AnalysisResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [excludedCoachIds, setExcludedCoachIds] = useState<string[]>([]);
  const [excludedRatings, setExcludedRatings] = useState<ExcludedRating[]>([]);
  const [coachList, setCoachList] = useState<{ id: string; name: string }[]>([]);
  const [playerFilter, setPlayerFilter] = useState('');
  const [anonymize, setAnonymize] = useState(true);
  const [exclusionMode, setExclusionMode] = useState<'include_all' | 'exclude_flagged'>('exclude_flagged');

  useEffect(() => {
    loadCoaches();
    loadSavedExclusions();
  }, []);

  useEffect(() => {
    loadAnalysis();
  }, [excludedCoachIds, excludedRatings, exclusionMode]);


  const loadCoaches = async () => {
    try {
      const data = await coachesApi.list();
      setCoachList(data.coaches.map((c: any) => ({ id: c.id, name: c.name })));
    } catch (err: any) {
      setError(err.message);
    }
  };

  const loadSavedExclusions = async () => {
    try {
      const [coachData, ratingsData] = await Promise.all([
        team.getExcludedCoaches(),
        team.getExcludedRatings(),
      ]);
      setExcludedCoachIds(coachData.excludedCoachIds || []);
      setExcludedRatings(ratingsData.excludedRatings || []);
    } catch (err: any) {
      // Ignore - will just start with empty exclusions
    }
  };

  const loadAnalysis = async () => {
    setLoading(true);
    try {
      const coachIds = exclusionMode === 'include_all' ? [] : excludedCoachIds;
      const ratings = exclusionMode === 'include_all' ? [] : excludedRatings;
      const data = await evaluations.analysis(coachIds, ratings);
      setAnalysis(data);
      setError('');
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const toggleCoachExclusion = (coachId: string) => {
    setExcludedCoachIds((prev) => {
      const next = prev.includes(coachId)
        ? prev.filter((id) => id !== coachId)
        : [...prev, coachId];
      // Persist to backend
      team.saveExcludedCoaches(next).catch(() => {});
      return next;
    });
  };

  const handleExcludedRatingsChange = (ratings: ExcludedRating[]) => {
    setExcludedRatings(ratings);
    team.saveExcludedRatings(ratings).catch(() => {});
  };


  const filteredRankings = useMemo(() => {
    if (!analysis || !playerFilter) return analysis?.playerRankings || [];
    const lower = playerFilter.toLowerCase();
    return analysis.playerRankings.filter(
      (p) =>
        p.playerName.toLowerCase().includes(lower) ||
        p.playerNumber.includes(playerFilter)
    );
  }, [analysis, playerFilter]);

  const filteredBoxPlots = useMemo(() => {
    if (!analysis || !playerFilter) return analysis?.boxPlots || [];
    const lower = playerFilter.toLowerCase();
    return analysis.boxPlots.filter(
      (p) =>
        p.playerName.toLowerCase().includes(lower) ||
        p.playerNumber.includes(playerFilter)
    );
  }, [analysis, playerFilter]);

  const tabs: { id: TabId; label: string }[] = [
    { id: 'rankings', label: 'Player Rankings' },
    { id: 'boxplots', label: 'Box Plots' },
    { id: 'coachAnalysis', label: 'Coach Analysis' },
    { id: 'distribution', label: 'Distribution' },
    { id: 'exclusions', label: 'Exclusions' },
  ];

  // Build a stable coach name mapping for anonymization
  const coachNameMap = useMemo(() => {
    const map = new Map<string, string>();
    const sortedCoaches = [...coachList].sort((a, b) => a.name.localeCompare(b.name));
    sortedCoaches.forEach((c, i) => {
      map.set(c.id, `Coach ${i + 1}`);
    });
    return map;
  }, [coachList]);

  const getCoachDisplayName = (coachId: string, realName: string) => {
    if (!anonymize) return realName;
    return coachNameMap.get(coachId) || realName;
  };

  // Anonymize coach reliability data if needed
  const displayReliability = useMemo(() => {
    if (!analysis) return [];
    if (!anonymize) return analysis.coachReliability;
    return analysis.coachReliability.map((cr) => ({
      ...cr,
      coachName: coachNameMap.get(cr.coachId) || cr.coachName,
    }));
  }, [analysis, anonymize, coachNameMap]);

  // Show toggle on these tabs
  const showExclusionToggle = activeTab !== 'exclusions';

  if (loading && !analysis) {
    return <div className="text-center py-8">Loading analysis...</div>;
  }


  return (
    <div>
      <h2 className="text-2xl font-bold mb-4">Analysis</h2>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded mb-4">
          {error}
        </div>
      )}

      {/* Impact Warnings */}
      {analysis && analysis.playerImpactWarnings.length > 0 && (
        <div className="bg-amber-50 border border-amber-300 text-amber-800 px-4 py-3 rounded mb-4">
          <p className="font-semibold mb-1">
            Warning: These players have dropped below 5 total reviewers after exclusions:
          </p>
          <ul className="list-disc list-inside text-sm">
            {analysis.playerImpactWarnings.map((w) => (
              <li key={w.playerId}>
                #{w.playerNumber} {w.playerName}: {w.originalCount} → {w.reducedCount} ratings
                (lost {w.droppedBy})
              </li>
            ))}
          </ul>
        </div>
      )}


      {/* Coach Exclusion Panel */}
      <div className="mb-4 p-4 bg-gray-50 border rounded">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-sm font-semibold text-gray-700">
            Exclude Coaches from Analysis
          </h3>
          <label className="inline-flex items-center gap-2 text-sm cursor-pointer">
            <input
              type="checkbox"
              checked={anonymize}
              onChange={(e) => setAnonymize(e.target.checked)}
              className="rounded border-gray-300"
            />
            <span className="text-gray-600">Anonymize coaches</span>
          </label>
        </div>
        <div className="flex flex-wrap gap-2">
          {coachList.map((coach) => (
            <label
              key={coach.id}
              className={`inline-flex items-center gap-1 px-3 py-1 rounded-full text-sm cursor-pointer border ${
                excludedCoachIds.includes(coach.id)
                  ? 'bg-red-100 border-red-300 text-red-700'
                  : 'bg-white border-gray-300 text-gray-700 hover:bg-gray-100'
              }`}
            >
              <input
                type="checkbox"
                className="sr-only"
                checked={excludedCoachIds.includes(coach.id)}
                onChange={() => toggleCoachExclusion(coach.id)}
              />
              {excludedCoachIds.includes(coach.id) ? '✕ ' : ''}{getCoachDisplayName(coach.id, coach.name)}
            </label>
          ))}
        </div>
        {excludedCoachIds.length > 0 && (
          <p className="text-xs text-gray-500 mt-2">
            {excludedCoachIds.length} coach(es) excluded. Analysis re-runs automatically.
          </p>
        )}
      </div>

      {/* Include all / Exclude flagged toggle */}
      {showExclusionToggle && (
        <div className="mb-4 flex items-center gap-1">
          <span className="text-sm text-gray-600 mr-2">Exclusion mode:</span>
          <button
            onClick={() => setExclusionMode('include_all')}
            className={`px-3 py-1.5 text-sm rounded-l border ${
              exclusionMode === 'include_all'
                ? 'bg-blue-600 text-white border-blue-600'
                : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
            }`}
          >
            Include all
          </button>
          <button
            onClick={() => setExclusionMode('exclude_flagged')}
            className={`px-3 py-1.5 text-sm rounded-r border-t border-b border-r ${
              exclusionMode === 'exclude_flagged'
                ? 'bg-blue-600 text-white border-blue-600'
                : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
            }`}
          >
            Exclude flagged
          </button>
        </div>
      )}

      {/* Player Filter */}
      {activeTab !== 'coachAnalysis' && activeTab !== 'exclusions' && (
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


      {/* Metadata */}
      {analysis?.metadata && (
        <div className="text-xs text-gray-400 mb-4">
          {analysis.metadata.totalPlayers} players · {analysis.metadata.totalCoaches} coaches · {analysis.metadata.totalEvaluations} evaluations
          {analysis.metadata.undifferentiatingCoaches.length > 0 && (
            <span className="text-amber-500 ml-2">
              ({analysis.metadata.undifferentiatingCoaches.length} coach(es) with zero variance — using raw scores)
            </span>
          )}
        </div>
      )}

      {loading && <div className="text-center py-4 text-gray-400">Recomputing...</div>}

      {/* Tab Content */}
      {analysis && !loading && (
        <>
          {activeTab === 'rankings' && (
            <PlayerRankingsTab rankings={filteredRankings} />
          )}
          {activeTab === 'boxplots' && (
            <PlayerBoxPlotsTab boxPlots={filteredBoxPlots} />
          )}
          {activeTab === 'coachAnalysis' && (
            <CoachAnalysisTab reliability={displayReliability} excludedCoachIds={excludedCoachIds} />
          )}
          {activeTab === 'distribution' && (
            <DistributionTab rankings={filteredRankings} />
          )}
          {activeTab === 'exclusions' && (
            <ExclusionsTab
              reliability={displayReliability}
              coaches={anonymize ? coachList.map(c => ({ id: c.id, name: coachNameMap.get(c.id) || c.name })) : coachList}
              excludedRatings={excludedRatings}
              onExcludedRatingsChange={handleExcludedRatingsChange}
            />
          )}
        </>
      )}
    </div>
  );
}
