import React from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import type { NormalizedPlayerScore } from '@player-eval/shared';

interface Props {
  rankings: NormalizedPlayerScore[];
}

export default function DistributionTab({ rankings }: Props) {
  const sorted = [...rankings].sort((a, b) => b.normalizedTotal - a.normalizedTotal);

  const data = sorted.map((p) => ({
    name: p.playerName,
    normalizedTotal: p.normalizedTotal,
  }));

  if (rankings.length === 0) {
    return <p className="text-gray-500">No evaluation data available.</p>;
  }

  return (
    <div>
      <p className="text-sm text-gray-600 mb-4">
        Score distribution across all players, sorted from highest to lowest normalized total.
      </p>
      <ResponsiveContainer width="100%" height={400}>
        <LineChart data={data} margin={{ top: 10, right: 30, left: 10, bottom: 60 }}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis
            dataKey="name"
            angle={-45}
            textAnchor="end"
            interval={0}
            tick={{ fontSize: 11 }}
            height={80}
          />
          <YAxis label={{ value: 'Normalized Total', angle: -90, position: 'insideLeft' }} />
          <Tooltip />
          <Line type="monotone" dataKey="normalizedTotal" stroke="#3b82f6" strokeWidth={2} dot={{ r: 3 }} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
