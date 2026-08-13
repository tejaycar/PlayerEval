import React, { useState, useEffect, useMemo } from 'react';
import { evaluations } from '../../../api';
import type {
  IntegrityAnalysisResponse,
  CoachIntegritySummary,
  LargeChange,
  CoordinatedChange,
  VarianceChange,
  RankShift,
} from '@player-eval/shared';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
  Cell,
} from 'recharts';

interface Props {
  getCoachDisplayName: (coachId: string, realName: string) => string;
}

type CoachSortField = 'totalChanges' | 'avgMagnitude' | 'flagCount' | 'netDirection';

export default function RatingIntegrityTab({ getCoachDisplayName }: Props) {
  const [data, setData] = useState<IntegrityAnalysisResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [coachSortBy, setCoachSortBy] = useState<CoachSortField>('flagCount');
  const [coachSortDir, setCoachSortDir] = useState<'asc' | 'desc'>('desc');
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({
    largeChanges: true,
    coordinated: true,
    varianceIncreases: false,
    varianceDecreases: false,
    rankShifts: false,
  });

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const result = await evaluations.integrity();
      setData(result);
      setError('');
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const toggleSection = (section: string) => {
    setExpandedSections((prev) => ({ ...prev, [section]: !prev[section] }));
  };

  const handleCoachSort = (field: CoachSortField) => {
    if (coachSortBy === field) {
      setCoachSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setCoachSortBy(field);
      setCoachSortDir('desc');
    }
  };

  // Build timeline data for the chart
  const timelineData = useMemo(() => {
    if (!data || data.history.length === 0) return [];

    // Only include history entries that have previous scores (i.e., changes)
    const changes = data.history.filter((h) => h.previousScores !== null);
    if (changes.length === 0) return [];

    // Group by date
    const byDate = new Map<string, { date: string; increases: number; decreases: number; total: number }>();
    for (const entry of changes) {
      const date = entry.timestamp.split('T')[0];
      if (!byDate.has(date)) {
        byDate.set(date, { date, increases: 0, decreases: 0, total: 0 });
      }
      const bucket = byDate.get(date)!;
      const prev = entry.previousScores!;
      const delta = entry.totalScore - prev.totalScore;
      if (delta > 0) bucket.increases++;
      else if (delta < 0) bucket.decreases++;
      bucket.total++;
    }

    return Array.from(byDate.values()).sort((a, b) => a.date.localeCompare(b.date));
  }, [data]);

  const sortedCoachSummaries = useMemo(() => {
    if (!data) return [];
    return [...data.coachSummaries].sort((a, b) => {
      const aVal = a[coachSortBy];
      const bVal = b[coachSortBy];
      return coachSortDir === 'asc'
        ? (aVal as number) - (bVal as number)
        : (bVal as number) - (aVal as number);
    });
  }, [data, coachSortBy, coachSortDir]);

  if (loading) {
    return <div className="text-center py-8 text-gray-500">Loading integrity analysis...</div>;
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded">
        Failed to load integrity data: {error}
      </div>
    );
  }

  if (!data || data.history.length === 0) {
    return (
      <div className="text-center py-12">
        <div className="text-gray-400 text-4xl mb-3">&#128202;</div>
        <p className="text-gray-600 font-medium">No rating changes have been recorded yet.</p>
        <p className="text-gray-400 text-sm mt-1">
          This view will populate as coaches update their evaluations over time.
        </p>
      </div>
    );
  }

  const totalFlags =
    data.largeChanges.length +
    data.coordinatedChanges.length +
    data.varianceIncreases.length +
    data.varianceDecreases.length +
    data.rankShifts.length;

  const totalChanges = data.history.filter((h) => h.previousScores !== null).length;

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
        <SummaryCard label="Total Changes" value={totalChanges} />
        <SummaryCard label="Large Changes" value={data.largeChanges.length} highlight={data.largeChanges.length > 0} />
        <SummaryCard label="Coordinated" value={data.coordinatedChanges.length} highlight={data.coordinatedChanges.length > 0} />
        <SummaryCard label="Variance Up" value={data.varianceIncreases.length} highlight={data.varianceIncreases.length > 0} />
        <SummaryCard label="Variance Down" value={data.varianceDecreases.length} />
        <SummaryCard label="Rank Shifts" value={data.rankShifts.length} highlight={data.rankShifts.length > 0} />
      </div>

      {/* Timeline Chart */}
      {timelineData.length > 0 && (
        <div className="bg-white border rounded-lg p-4">
          <h3 className="text-sm font-semibold text-gray-700 mb-3">Rating Changes Over Time</h3>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={timelineData} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis
                dataKey="date"
                tick={{ fontSize: 11 }}
                tickFormatter={(val) => {
                  const d = new Date(val + 'T00:00:00');
                  return `${d.getMonth() + 1}/${d.getDate()}`;
                }}
              />
              <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
              <Tooltip
                labelFormatter={(val) => {
                  const d = new Date(val + 'T00:00:00');
                  return d.toLocaleDateString();
                }}
              />
              <Legend />
              <Bar dataKey="increases" name="Increases" fill="#22c55e" stackId="a" />
              <Bar dataKey="decreases" name="Decreases" fill="#ef4444" stackId="a" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Coach Activity Summary */}
      <div className="bg-white border rounded-lg p-4">
        <h3 className="text-sm font-semibold text-gray-700 mb-3">Coach Activity Summary</h3>
        {sortedCoachSummaries.length === 0 ? (
          <p className="text-gray-400 text-sm">No coach activity to display.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Coach</th>
                  <CoachSortHeader field="totalChanges" label="Changes" currentSort={coachSortBy} sortDir={coachSortDir} onSort={handleCoachSort} />
                  <CoachSortHeader field="avgMagnitude" label="Avg Magnitude" currentSort={coachSortBy} sortDir={coachSortDir} onSort={handleCoachSort} />
                  <CoachSortHeader field="flagCount" label="Flags" currentSort={coachSortBy} sortDir={coachSortDir} onSort={handleCoachSort} />
                  <CoachSortHeader field="netDirection" label="Net Direction" currentSort={coachSortBy} sortDir={coachSortDir} onSort={handleCoachSort} />
                  <th className="px-3 py-2 text-center text-xs font-medium text-gray-500 uppercase">Last Change</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {sortedCoachSummaries.map((coach) => (
                  <tr key={coach.coachId} className="hover:bg-gray-50">
                    <td className="px-3 py-2 font-medium">
                      {getCoachDisplayName(coach.coachId, coach.coachName)}
                    </td>
                    <td className="px-3 py-2 text-center">{coach.totalChanges}</td>
                    <td className="px-3 py-2 text-center">
                      <span className={`px-2 py-0.5 rounded ${getMagnitudeColor(coach.avgMagnitude)}`}>
                        {coach.avgMagnitude.toFixed(1)}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-center">
                      <span className={`px-2 py-0.5 rounded ${getFlagColor(coach.flagCount)}`}>
                        {coach.flagCount}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-center">
                      <span className={coach.netDirection > 0 ? 'text-green-600' : coach.netDirection < 0 ? 'text-red-600' : 'text-gray-500'}>
                        {coach.netDirection > 0 ? '+' : ''}{coach.netDirection.toFixed(1)}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-center text-gray-500">
                      {coach.lastChangeTimestamp
                        ? new Date(coach.lastChangeTimestamp).toLocaleDateString()
                        : '-'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Flag Category Sections */}
      <FlagSection
        title="Large Changes"
        description="Individual rating changes where the total score moved by 5 or more points."
        count={data.largeChanges.length}
        expanded={expandedSections.largeChanges}
        onToggle={() => toggleSection('largeChanges')}
      >
        <LargeChangesTable changes={data.largeChanges} getCoachDisplayName={getCoachDisplayName} />
      </FlagSection>

      <FlagSection
        title="Coordinated Changes"
        description="Multiple coaches changing ratings for the same player within a short time window, in the same direction."
        count={data.coordinatedChanges.length}
        expanded={expandedSections.coordinated}
        onToggle={() => toggleSection('coordinated')}
      >
        <CoordinatedChangesTable changes={data.coordinatedChanges} getCoachDisplayName={getCoachDisplayName} />
      </FlagSection>

      <FlagSection
        title="Variance Increases"
        description="Changes that moved a coach further from the consensus (increased their deviation from the group)."
        count={data.varianceIncreases.length}
        expanded={expandedSections.varianceIncreases}
        onToggle={() => toggleSection('varianceIncreases')}
      >
        <VarianceTable changes={data.varianceIncreases} getCoachDisplayName={getCoachDisplayName} direction="increase" />
      </FlagSection>

      <FlagSection
        title="Variance Decreases"
        description="Changes that moved a coach closer to the consensus (decreased their deviation from the group). May indicate peer pressure."
        count={data.varianceDecreases.length}
        expanded={expandedSections.varianceDecreases}
        onToggle={() => toggleSection('varianceDecreases')}
      >
        <VarianceTable changes={data.varianceDecreases} getCoachDisplayName={getCoachDisplayName} direction="decrease" />
      </FlagSection>

      <FlagSection
        title="Rank Shifts"
        description="Changes that caused a player to move significantly in the overall ranking order."
        count={data.rankShifts.length}
        expanded={expandedSections.rankShifts}
        onToggle={() => toggleSection('rankShifts')}
      >
        <RankShiftsTable shifts={data.rankShifts} getCoachDisplayName={getCoachDisplayName} />
      </FlagSection>

      {totalFlags === 0 && (
        <div className="text-center py-6 text-gray-500 bg-green-50 border border-green-200 rounded-lg">
          <span className="text-green-600 font-medium">No flags detected.</span> All rating changes appear normal.
        </div>
      )}
    </div>
  );
}

// === Helper Components ===

function SummaryCard({ label, value, highlight }: { label: string; value: number; highlight?: boolean }) {
  return (
    <div className={`p-3 rounded-lg border ${highlight ? 'bg-amber-50 border-amber-200' : 'bg-white border-gray-200'}`}>
      <div className={`text-2xl font-bold ${highlight ? 'text-amber-700' : 'text-gray-800'}`}>{value}</div>
      <div className="text-xs text-gray-500 mt-1">{label}</div>
    </div>
  );
}

function CoachSortHeader({
  field,
  label,
  currentSort,
  sortDir,
  onSort,
}: {
  field: CoachSortField;
  label: string;
  currentSort: CoachSortField;
  sortDir: 'asc' | 'desc';
  onSort: (field: CoachSortField) => void;
}) {
  return (
    <th
      className="px-3 py-2 text-center text-xs font-medium text-gray-500 uppercase cursor-pointer hover:text-gray-700"
      onClick={() => onSort(field)}
    >
      {label} {currentSort === field && (sortDir === 'asc' ? '\u2191' : '\u2193')}
    </th>
  );
}

function FlagSection({
  title,
  description,
  count,
  expanded,
  onToggle,
  children,
}: {
  title: string;
  description: string;
  count: number;
  expanded: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="border rounded-lg overflow-hidden">
      <button
        onClick={onToggle}
        className="w-full flex items-center justify-between px-4 py-3 bg-gray-50 hover:bg-gray-100 text-left"
      >
        <div>
          <span className="font-medium text-sm text-gray-700">{title}</span>
          {count > 0 && (
            <span className="ml-2 px-2 py-0.5 bg-amber-100 text-amber-700 text-xs rounded-full">
              {count}
            </span>
          )}
          {count === 0 && (
            <span className="ml-2 px-2 py-0.5 bg-green-100 text-green-700 text-xs rounded-full">
              0
            </span>
          )}
        </div>
        <span className="text-gray-400 text-sm">{expanded ? '\u25B2' : '\u25BC'}</span>
      </button>
      {expanded && (
        <div className="p-4 border-t">
          <p className="text-xs text-gray-500 mb-3">{description}</p>
          {count === 0 ? (
            <p className="text-sm text-gray-400 italic">No items in this category.</p>
          ) : (
            children
          )}
        </div>
      )}
    </div>
  );
}

function LargeChangesTable({
  changes,
  getCoachDisplayName,
}: {
  changes: LargeChange[];
  getCoachDisplayName: (coachId: string, realName: string) => string;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead className="bg-gray-50">
          <tr>
            <th className="px-2 py-1.5 text-left font-medium text-gray-500">Coach</th>
            <th className="px-2 py-1.5 text-left font-medium text-gray-500">Date</th>
            <th className="px-2 py-1.5 text-center font-medium text-gray-500">Old Total</th>
            <th className="px-2 py-1.5 text-center font-medium text-gray-500">New Total</th>
            <th className="px-2 py-1.5 text-center font-medium text-gray-500">Delta</th>
            <th className="px-2 py-1.5 text-center font-medium text-gray-500">Categories</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {changes.map((change, i) => (
            <tr key={i} className="hover:bg-gray-50">
              <td className="px-2 py-1.5">{getCoachDisplayName(change.coachId, change.coachId)}</td>
              <td className="px-2 py-1.5 text-gray-500">
                {new Date(change.timestamp).toLocaleDateString()}
              </td>
              <td className="px-2 py-1.5 text-center">{change.oldTotal}</td>
              <td className="px-2 py-1.5 text-center">{change.newTotal}</td>
              <td className="px-2 py-1.5 text-center">
                <span className={`font-medium ${change.delta > 0 ? 'text-green-600' : 'text-red-600'}`}>
                  {change.delta > 0 ? '+' : ''}{change.delta}
                </span>
              </td>
              <td className="px-2 py-1.5 text-center">
                <CategoryDeltas deltas={change.categoryDeltas} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function CategoryDeltas({ deltas }: { deltas: Record<string, number> }) {
  const nonZero = Object.entries(deltas).filter(([, v]) => v !== 0);
  if (nonZero.length === 0) return <span className="text-gray-400">-</span>;

  const labels: Record<string, string> = {
    attitude: 'Att',
    effort: 'Eff',
    footballIQ: 'IQ',
    generalSkill: 'Gen',
    positionSkill: 'Pos',
  };

  return (
    <span className="inline-flex gap-1 flex-wrap justify-center">
      {nonZero.map(([key, val]) => (
        <span
          key={key}
          className={`px-1 rounded ${val > 0 ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}
        >
          {labels[key] || key}: {val > 0 ? '+' : ''}{val}
        </span>
      ))}
    </span>
  );
}

function CoordinatedChangesTable({
  changes,
  getCoachDisplayName,
}: {
  changes: CoordinatedChange[];
  getCoachDisplayName: (coachId: string, realName: string) => string;
}) {
  return (
    <div className="space-y-3">
      {changes.map((coord, i) => (
        <div key={i} className="border rounded p-3 bg-amber-50/50">
          <div className="flex items-center gap-2 mb-2">
            <span className="font-medium text-sm">
              #{coord.playerNumber} {coord.playerName}
            </span>
            <span className={`px-2 py-0.5 rounded text-xs ${
              coord.direction === 'increase' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
            }`}>
              {coord.direction === 'increase' ? '\u2191 Increases' : '\u2193 Decreases'}
            </span>
            <span className="text-xs text-gray-400">
              {new Date(coord.windowStart).toLocaleDateString()} - {new Date(coord.windowEnd).toLocaleDateString()}
            </span>
          </div>
          <div className="flex flex-wrap gap-2">
            {coord.changes.map((c, j) => (
              <span key={j} className="inline-flex items-center gap-1 px-2 py-1 bg-white border rounded text-xs">
                <span className="font-medium">{getCoachDisplayName(c.coachId, c.coachId)}</span>
                <span className={c.delta > 0 ? 'text-green-600' : 'text-red-600'}>
                  {c.delta > 0 ? '+' : ''}{c.delta}
                </span>
              </span>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function VarianceTable({
  changes,
  getCoachDisplayName,
  direction,
}: {
  changes: VarianceChange[];
  getCoachDisplayName: (coachId: string, realName: string) => string;
  direction: 'increase' | 'decrease';
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead className="bg-gray-50">
          <tr>
            <th className="px-2 py-1.5 text-left font-medium text-gray-500">Coach</th>
            <th className="px-2 py-1.5 text-left font-medium text-gray-500">Date</th>
            <th className="px-2 py-1.5 text-center font-medium text-gray-500">Deviation Before</th>
            <th className="px-2 py-1.5 text-center font-medium text-gray-500">Deviation After</th>
            <th className="px-2 py-1.5 text-center font-medium text-gray-500">Change</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {changes.map((v, i) => (
            <tr key={i} className="hover:bg-gray-50">
              <td className="px-2 py-1.5">{getCoachDisplayName(v.coachId, v.coachId)}</td>
              <td className="px-2 py-1.5 text-gray-500">
                {new Date(v.timestamp).toLocaleDateString()}
              </td>
              <td className="px-2 py-1.5 text-center">{v.deviationBefore.toFixed(1)}</td>
              <td className="px-2 py-1.5 text-center">{v.deviationAfter.toFixed(1)}</td>
              <td className="px-2 py-1.5 text-center">
                <span className={`font-medium ${
                  direction === 'increase' ? 'text-red-600' : 'text-green-600'
                }`}>
                  {v.change > 0 ? '+' : ''}{v.change.toFixed(1)}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function RankShiftsTable({
  shifts,
  getCoachDisplayName,
}: {
  shifts: RankShift[];
  getCoachDisplayName: (coachId: string, realName: string) => string;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead className="bg-gray-50">
          <tr>
            <th className="px-2 py-1.5 text-left font-medium text-gray-500">Coach</th>
            <th className="px-2 py-1.5 text-left font-medium text-gray-500">Date</th>
            <th className="px-2 py-1.5 text-center font-medium text-gray-500">Rank Before</th>
            <th className="px-2 py-1.5 text-center font-medium text-gray-500">Rank After</th>
            <th className="px-2 py-1.5 text-center font-medium text-gray-500">Positions Changed</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {shifts.map((shift, i) => (
            <tr key={i} className="hover:bg-gray-50">
              <td className="px-2 py-1.5">{getCoachDisplayName(shift.coachId, shift.coachId)}</td>
              <td className="px-2 py-1.5 text-gray-500">
                {new Date(shift.timestamp).toLocaleDateString()}
              </td>
              <td className="px-2 py-1.5 text-center">#{shift.rankBefore}</td>
              <td className="px-2 py-1.5 text-center">#{shift.rankAfter}</td>
              <td className="px-2 py-1.5 text-center">
                <span className={`font-medium ${
                  shift.positionsChanged >= 5 ? 'text-red-600' :
                  shift.positionsChanged >= 3 ? 'text-amber-600' : 'text-gray-600'
                }`}>
                  {shift.positionsChanged}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// === Color Helpers ===

function getMagnitudeColor(mag: number): string {
  if (mag <= 3) return 'text-green-700 bg-green-50';
  if (mag <= 6) return 'text-yellow-700 bg-yellow-50';
  return 'text-red-700 bg-red-50';
}

function getFlagColor(count: number): string {
  if (count === 0) return 'text-green-700 bg-green-50';
  if (count <= 2) return 'text-yellow-700 bg-yellow-50';
  return 'text-red-700 bg-red-50';
}
