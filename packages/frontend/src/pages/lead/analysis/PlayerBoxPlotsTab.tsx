import React, { useState, useMemo, useRef, useEffect } from 'react';
import type { BoxPlotStats } from '@player-eval/shared';

interface Props {
  boxPlots: BoxPlotStats[];
}

type SortField = 'iqr' | 'median' | 'name';

export default function PlayerBoxPlotsTab({ boxPlots }: Props) {
  const [sortBy, setSortBy] = useState<SortField>('iqr');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [selectedPlayerIds, setSelectedPlayerIds] = useState<Set<string>>(new Set());
  const [playerPickerOpen, setPlayerPickerOpen] = useState(false);
  const [pickerSearch, setPickerSearch] = useState('');
  const pickerRef = useRef<HTMLDivElement>(null);

  // Close picker when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) {
        setPlayerPickerOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSort = (field: SortField) => {
    if (sortBy === field) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortBy(field);
      setSortDir(field === 'name' ? 'asc' : 'desc');
    }
  };

  const togglePlayer = (playerId: string) => {
    setSelectedPlayerIds((prev) => {
      const next = new Set(prev);
      if (next.has(playerId)) {
        next.delete(playerId);
      } else {
        next.add(playerId);
      }
      return next;
    });
  };

  const clearSelection = () => setSelectedPlayerIds(new Set());

  // Filter box plots by selected players (if any selected)
  const displayedBoxPlots = useMemo(() => {
    if (selectedPlayerIds.size === 0) return boxPlots;
    return boxPlots.filter((bp) => selectedPlayerIds.has(bp.playerId));
  }, [boxPlots, selectedPlayerIds]);

  // Filter player list in picker by search term
  const pickerPlayers = useMemo(() => {
    const lower = pickerSearch.toLowerCase();
    const all = [...boxPlots].sort((a, b) => a.playerName.localeCompare(b.playerName));
    if (!pickerSearch) return all;
    return all.filter(
      (bp) =>
        bp.playerName.toLowerCase().includes(lower) ||
        bp.playerNumber.includes(pickerSearch)
    );
  }, [boxPlots, pickerSearch]);

  const sorted = [...displayedBoxPlots].sort((a, b) => {
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


  // Always use full boxPlots set for consistent scale across comparisons
  const globalMin = Math.min(...boxPlots.map((b) => b.min));
  const globalMax = Math.max(...boxPlots.map((b) => b.max));
  const range = globalMax - globalMin || 1;

  const toPercent = (val: number) => ((val - globalMin) / range) * 100;

  return (
    <div>
      {/* Controls row: sort + player filter */}
      <div className="flex flex-wrap items-start gap-4 mb-4">
        {/* Sort buttons */}
        <div className="flex gap-2 text-sm">
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

        {/* Player multi-select filter */}
        <div className="relative" ref={pickerRef}>
          <button
            onClick={() => setPlayerPickerOpen((o) => !o)}
            className={`px-3 py-1 text-sm rounded border ${
              selectedPlayerIds.size > 0 ? 'bg-green-50 border-green-400 text-green-800' : 'border-gray-300 text-gray-700 hover:bg-gray-50'
            }`}
          >
            {selectedPlayerIds.size > 0
              ? `Comparing ${selectedPlayerIds.size} player${selectedPlayerIds.size > 1 ? 's' : ''}`
              : 'Compare Players...'}
          </button>

          {selectedPlayerIds.size > 0 && (
            <button
              onClick={clearSelection}
              className="ml-2 px-2 py-1 text-xs rounded border border-gray-300 text-gray-500 hover:bg-gray-100"
            >
              Clear
            </button>
          )}

          {playerPickerOpen && (
            <div className="absolute top-full left-0 mt-1 w-72 bg-white border border-gray-200 rounded-lg shadow-lg z-50 max-h-80 flex flex-col">
              {/* Search input */}
              <div className="p-2 border-b">
                <input
                  type="text"
                  placeholder="Search by name or number..."
                  value={pickerSearch}
                  onChange={(e) => setPickerSearch(e.target.value)}
                  className="w-full px-2 py-1 text-sm border border-gray-300 rounded"
                  autoFocus
                />
              </div>
              {/* Player checkboxes */}
              <div className="overflow-y-auto flex-1 p-2 space-y-1">
                {pickerPlayers.map((bp) => (
                  <label
                    key={bp.playerId}
                    className={`flex items-center gap-2 px-2 py-1 rounded cursor-pointer text-sm hover:bg-gray-50 ${
                      selectedPlayerIds.has(bp.playerId) ? 'bg-blue-50' : ''
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={selectedPlayerIds.has(bp.playerId)}
                      onChange={() => togglePlayer(bp.playerId)}
                      className="rounded border-gray-300 text-blue-600"
                    />
                    <span className="text-gray-400">#{bp.playerNumber}</span>
                    <span>{bp.playerName}</span>
                  </label>
                ))}
                {pickerPlayers.length === 0 && (
                  <p className="text-xs text-gray-400 text-center py-2">No matches</p>
                )}
              </div>
              {/* Footer with quick actions */}
              <div className="border-t p-2 flex justify-between text-xs">
                <button
                  onClick={clearSelection}
                  className="text-gray-500 hover:text-gray-700"
                >
                  Clear all
                </button>
                <button
                  onClick={() => setPlayerPickerOpen(false)}
                  className="text-blue-600 hover:text-blue-800 font-medium"
                >
                  Done
                </button>
              </div>
            </div>
          )}
        </div>
      </div>


      {/* Selected player chips */}
      {selectedPlayerIds.size > 0 && (
        <div className="flex flex-wrap gap-1 mb-3">
          {boxPlots
            .filter((bp) => selectedPlayerIds.has(bp.playerId))
            .map((bp) => (
              <span
                key={bp.playerId}
                className="inline-flex items-center gap-1 px-2 py-0.5 text-xs bg-blue-100 text-blue-800 rounded-full"
              >
                #{bp.playerNumber} {bp.playerName}
                <button
                  onClick={() => togglePlayer(bp.playerId)}
                  className="hover:text-blue-600"
                >
                  ×
                </button>
              </span>
            ))}
        </div>
      )}

      <div className="text-xs text-gray-400 mb-2">
        Scale: {globalMin.toFixed(1)} – {globalMax.toFixed(1)} (normalized total score)
        {selectedPlayerIds.size > 0 && (
          <span className="ml-2 text-blue-500">
            · Showing {sorted.length} of {boxPlots.length} players
          </span>
        )}
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
            <div className="w-64 text-xs text-gray-500 flex-shrink-0">
              Mean: {bp.mean}
              <span className="text-gray-400 text-xs ml-0.5 cursor-help" title="Average of all normalized scores for this player across coaches.">&#9432;</span>
              {' · '}Med: {bp.median}
              <span className="text-gray-400 text-xs ml-0.5 cursor-help" title="Median normalized score — the middle value. More robust to outliers than the mean.">&#9432;</span>
              {' · '}IQR: {bp.iqr}
              <span className="text-gray-400 text-xs ml-0.5 cursor-help" title="Interquartile range — how spread out the middle 50% of scores are. Higher = more disagreement between coaches.">&#9432;</span>
              <span className="ml-2 text-gray-400">±{bp.ci95}</span>
              <span className="text-gray-400 text-xs ml-0.5 cursor-help" title={`95% confidence interval (n=${bp.n}, SEM=${bp.sem}). The true mean score is likely within ±${bp.ci95} of the displayed mean.`}>&#9432;</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
