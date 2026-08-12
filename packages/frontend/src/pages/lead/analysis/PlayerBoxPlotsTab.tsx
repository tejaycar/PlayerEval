import React, { useState } from 'react';
import type { BoxPlotStats } from '@player-eval/shared';

interface Props {
  boxPlots: BoxPlotStats[];
}

type SortField = 'iqr' | 'median' | 'name';

export default function PlayerBoxPlotsTab({ boxPlots }: Props) {
  const [sortBy, setSortBy] = useState<SortField>('iqr');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

  const handleSort = (field: SortField) => {
    if (sortBy === field) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortBy(field);
      setSortDir(field === 'name' ? 'asc' : 'desc');
    }
  };

  const sorted = [...boxPlots].sort((a, b) => {
    let cmp: number;
    if (sortBy === 'name') {
      cmp = a.playerName.localeCompare(b.playerName);
    } else if (sortBy === 'iqr') {
      cmp = a.iqr - b.iqr;
    } else {
      cmp = a.median - b.median;
    }
    return sortDir === 'asc' ? cmp : -cmp;
  });

  if (boxPlots.length === 0) {
    return <p className="text-gray-500">No evaluation data available.</p>;
  }


  // Compute global min/max for consistent scale
  const globalMin = Math.min(...boxPlots.map((b) => b.min));
  const globalMax = Math.max(...boxPlots.map((b) => b.max));
  const range = globalMax - globalMin || 1;

  const toPercent = (val: number) => ((val - globalMin) / range) * 100;

  return (
    <div>
      <div className="flex gap-4 mb-4 text-sm">
        <button
          onClick={() => handleSort('iqr')}
          className={`px-3 py-1 rounded border ${sortBy === 'iqr' ? 'bg-blue-100 border-blue-300' : 'border-gray-300'}`}
        >
          Sort by Controversy (IQR) {sortBy === 'iqr' && (sortDir === 'desc' ? '↓' : '↑')}
        </button>
        <button
          onClick={() => handleSort('median')}
          className={`px-3 py-1 rounded border ${sortBy === 'median' ? 'bg-blue-100 border-blue-300' : 'border-gray-300'}`}
        >
          Sort by Median {sortBy === 'median' && (sortDir === 'desc' ? '↓' : '↑')}
        </button>
        <button
          onClick={() => handleSort('name')}
          className={`px-3 py-1 rounded border ${sortBy === 'name' ? 'bg-blue-100 border-blue-300' : 'border-gray-300'}`}
        >
          Sort by Name {sortBy === 'name' && (sortDir === 'asc' ? '↑' : '↓')}
        </button>
      </div>


      <div className="text-xs text-gray-400 mb-2">
        Scale: {globalMin.toFixed(1)} – {globalMax.toFixed(1)} (normalized total score)
      </div>

      <div className="space-y-2">
        {sorted.map((bp) => (
          <div key={bp.playerId} className="flex items-center gap-3">
            {/* Player label */}
            <div className="w-40 text-sm text-right flex-shrink-0">
              <span className="text-gray-500">#{bp.playerNumber}</span>{' '}
              <span className="font-medium">{bp.playerName}</span>
            </div>

            {/* Box plot visualization */}
            <div className="flex-1 relative h-8 bg-gray-100 rounded">
              {/* Whisker line (min to max) */}
              <div
                className="absolute top-1/2 h-px bg-gray-400"
                style={{
                  left: `${toPercent(bp.min)}%`,
                  width: `${toPercent(bp.max) - toPercent(bp.min)}%`,
                  transform: 'translateY(-50%)',
                }}
              />
              {/* Min whisker cap */}
              <div
                className="absolute top-1/2 w-px h-3 bg-gray-400"
                style={{
                  left: `${toPercent(bp.min)}%`,
                  transform: 'translate(-50%, -50%)',
                }}
              />
              {/* Max whisker cap */}
              <div
                className="absolute top-1/2 w-px h-3 bg-gray-400"
                style={{
                  left: `${toPercent(bp.max)}%`,
                  transform: 'translate(-50%, -50%)',
                }}
              />

              {/* IQR Box (Q1 to Q3) */}
              <div
                className="absolute top-1/2 h-5 bg-blue-200 border border-blue-400 rounded-sm"
                style={{
                  left: `${toPercent(bp.q1)}%`,
                  width: `${toPercent(bp.q3) - toPercent(bp.q1)}%`,
                  transform: 'translateY(-50%)',
                }}
              />
              {/* Median line */}
              <div
                className="absolute top-1/2 w-0.5 h-5 bg-blue-700"
                style={{
                  left: `${toPercent(bp.median)}%`,
                  transform: 'translate(-50%, -50%)',
                }}
              />
              {/* Outliers */}
              {bp.outliers.map((o, i) => (
                <div
                  key={i}
                  className="absolute top-1/2 w-2 h-2 bg-red-500 rounded-full"
                  style={{
                    left: `${toPercent(o)}%`,
                    transform: 'translate(-50%, -50%)',
                  }}
                />
              ))}
            </div>

            {/* Stats */}
            <div className="w-40 text-xs text-gray-500 flex-shrink-0">
              Med: {bp.median} · IQR: {bp.iqr}
              <span className="text-gray-400 text-xs ml-1 cursor-help" title="Interquartile range -- how spread out the middle 50% of scores are. Higher = more disagreement between coaches.">&#9432;</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
