import React, { useState } from 'react';
import type { CoachReliabilityMetrics } from '@player-eval/shared';

interface Props {
  reliability: CoachReliabilityMetrics[];
}

type SortField = 'madFromMedian' | 'meanDeviationFromMean' | 'rankCorrelation' | 'playersRated';

export default function CoachReliabilityTab({ reliability }: Props) {
  const [sortBy, setSortBy] = useState<SortField>('madFromMedian');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const [expandedCoach, setExpandedCoach] = useState<string | null>(null);

  if (reliability.length === 0) {
    return <p className="text-gray-500">Coach reliability data is only available to leads.</p>;
  }

  const handleSort = (field: SortField) => {
    if (sortBy === field) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortBy(field);
      setSortDir(field === 'rankCorrelation' ? 'desc' : 'asc');
    }
  };

  const sorted = [...reliability].sort((a, b) => {
    const aVal = a[sortBy];
    const bVal = b[sortBy];
    return sortDir === 'asc' ? aVal - bVal : bVal - aVal;
  });


  const getMADColor = (mad: number) => {
    if (mad <= 2) return 'text-green-700 bg-green-50';
    if (mad <= 4) return 'text-yellow-700 bg-yellow-50';
    return 'text-red-700 bg-red-50';
  };

  const getCorrelationColor = (corr: number) => {
    if (corr >= 0.7) return 'text-green-700 bg-green-50';
    if (corr >= 0.4) return 'text-yellow-700 bg-yellow-50';
    return 'text-red-700 bg-red-50';
  };

  const getBiasLabel = (dev: number) => {
    if (dev > 1) return { text: 'Rates High', color: 'text-orange-600' };
    if (dev < -1) return { text: 'Rates Low', color: 'text-blue-600' };
    return { text: 'Neutral', color: 'text-gray-500' };
  };

  const SortHeader = ({ field, label }: { field: SortField; label: string }) => (
    <th
      className="px-3 py-2 text-center text-xs font-medium text-gray-500 uppercase cursor-pointer hover:text-gray-700"
      onClick={() => handleSort(field)}
    >
      {label} {sortBy === field && (sortDir === 'asc' ? '↑' : '↓')}
    </th>
  );


  return (
    <div>
      <p className="text-sm text-gray-600 mb-4">
        Shows how closely each coach's ratings align with the consensus after normalization.
        Lower MAD = more aligned with consensus. Rank correlation shows if the coach orders players similarly.
      </p>

      <div className="overflow-x-auto">
        <table className="w-full bg-white rounded-lg shadow-sm border text-sm">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Coach</th>
              <SortHeader field="playersRated" label="Players Rated" />
              <SortHeader field="madFromMedian" label="MAD from Median" />
              <SortHeader field="meanDeviationFromMean" label="Bias (Mean Dev)" />
              <SortHeader field="rankCorrelation" label="Rank Correlation" />
              <th className="px-3 py-2 text-center text-xs font-medium text-gray-500 uppercase">Details</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {sorted.map((coach) => {
              const bias = getBiasLabel(coach.meanDeviationFromMean);
              return (
                <React.Fragment key={coach.coachId}>
                  <tr className="hover:bg-gray-50">
                    <td className="px-3 py-2 font-medium">{coach.coachName}</td>
                    <td className="px-3 py-2 text-center">{coach.playersRated}</td>
                    <td className="px-3 py-2 text-center">
                      <span className={`px-2 py-0.5 rounded ${getMADColor(coach.madFromMedian)}`}>
                        {coach.madFromMedian}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-center">
                      <span className={bias.color}>
                        {coach.meanDeviationFromMean > 0 ? '+' : ''}{coach.meanDeviationFromMean} ({bias.text})
                      </span>
                    </td>

                    <td className="px-3 py-2 text-center">
                      <span className={`px-2 py-0.5 rounded ${getCorrelationColor(coach.rankCorrelation)}`}>
                        {coach.rankCorrelation}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-center">
                      <button
                        onClick={() => setExpandedCoach(expandedCoach === coach.coachId ? null : coach.coachId)}
                        className="text-blue-600 hover:text-blue-800 text-xs"
                      >
                        {expandedCoach === coach.coachId ? 'Hide' : 'Show'}
                      </button>
                    </td>
                  </tr>
                  {expandedCoach === coach.coachId && (
                    <tr>
                      <td colSpan={6} className="px-3 py-2 bg-gray-50">
                        <div className="max-h-64 overflow-y-auto">
                          <table className="w-full text-xs">
                            <thead>
                              <tr className="text-gray-500">
                                <th className="px-2 py-1 text-left">Player</th>
                                <th className="px-2 py-1 text-center">Coach Score</th>
                                <th className="px-2 py-1 text-center">Median</th>
                                <th className="px-2 py-1 text-center">Mean</th>
                                <th className="px-2 py-1 text-center">Deviation</th>
                              </tr>
                            </thead>

                            <tbody>
                              {coach.playerDeviations
                                .sort((a, b) => Math.abs(b.deviation) - Math.abs(a.deviation))
                                .map((pd) => (
                                  <tr key={pd.playerId} className="border-t border-gray-200">
                                    <td className="px-2 py-1">#{pd.playerNumber} {pd.playerName}</td>
                                    <td className="px-2 py-1 text-center">{pd.coachNormalized}</td>
                                    <td className="px-2 py-1 text-center">{pd.medianNormalized}</td>
                                    <td className="px-2 py-1 text-center">{pd.meanNormalized}</td>
                                    <td className={`px-2 py-1 text-center font-medium ${
                                      Math.abs(pd.deviation) > 3 ? 'text-red-600' :
                                      Math.abs(pd.deviation) > 1.5 ? 'text-yellow-600' : 'text-gray-600'
                                    }`}>
                                      {pd.deviation > 0 ? '+' : ''}{pd.deviation}
                                    </td>
                                  </tr>
                                ))}
                            </tbody>
                          </table>
                        </div>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
