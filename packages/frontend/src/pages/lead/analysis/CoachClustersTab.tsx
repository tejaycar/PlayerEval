import React, { useState, useMemo } from 'react';
import type { CoachReliabilityMetrics } from '@player-eval/shared';

interface Props {
  reliability: CoachReliabilityMetrics[];
}

// === Math Helpers ===

function pearsonCorrelation(x: number[], y: number[]): number {
  const n = x.length;
  if (n < 3) return 0;
  const meanX = x.reduce((s, v) => s + v, 0) / n;
  const meanY = y.reduce((s, v) => s + v, 0) / n;
  let num = 0, denX = 0, denY = 0;
  for (let i = 0; i < n; i++) {
    const dx = x[i] - meanX;
    const dy = y[i] - meanY;
    num += dx * dy;
    denX += dx * dx;
    denY += dy * dy;
  }
  const den = Math.sqrt(denX * denY);
  if (den === 0) return 0;
  return num / den;
}

interface CorrelationEntry {
  coachIdA: string;
  coachIdB: string;
  correlation: number;
  sharedPlayers: number;
}

interface ClusterNode {
  id: string; // leaf: coachId, internal: generated
  label?: string;
  left?: ClusterNode;
  right?: ClusterNode;
  height: number; // merge distance (0 for leaves)
  members: string[]; // all coachIds under this node
}

// === Agglomerative Hierarchical Clustering (average linkage) ===

function hierarchicalCluster(
  coachIds: string[],
  distanceMatrix: Map<string, number>
): ClusterNode {
  const distKey = (a: string, b: string) => a < b ? `${a}|${b}` : `${b}|${a}`;

  // Initialize: each coach is its own cluster
  let clusters: ClusterNode[] = coachIds.map((id) => ({
    id,
    height: 0,
    members: [id],
  }));

  // Compute inter-cluster distances (average linkage)
  const clusterDist = new Map<string, number>();
  for (let i = 0; i < clusters.length; i++) {
    for (let j = i + 1; j < clusters.length; j++) {
      const key = distKey(clusters[i].id, clusters[j].id);
      const d = distanceMatrix.get(distKey(clusters[i].members[0], clusters[j].members[0])) ?? 1;
      clusterDist.set(key, d);
    }
  }

  let nextId = 0;

  while (clusters.length > 1) {
    // Find closest pair
    let minDist = Infinity;
    let mergeI = 0, mergeJ = 1;
    for (let i = 0; i < clusters.length; i++) {
      for (let j = i + 1; j < clusters.length; j++) {
        const key = distKey(clusters[i].id, clusters[j].id);
        const d = clusterDist.get(key) ?? 1;
        if (d < minDist) {
          minDist = d;
          mergeI = i;
          mergeJ = j;
        }
      }
    }

    const left = clusters[mergeI];
    const right = clusters[mergeJ];
    const newNode: ClusterNode = {
      id: `_internal_${nextId++}`,
      left,
      right,
      height: minDist,
      members: [...left.members, ...right.members],
    };

    // Remove merged clusters and add new one
    const remaining = clusters.filter((_, idx) => idx !== mergeI && idx !== mergeJ);

    // Compute distances from new cluster to all remaining (average linkage)
    for (const other of remaining) {
      let totalDist = 0;
      let count = 0;
      for (const m1 of newNode.members) {
        for (const m2 of other.members) {
          const key = distKey(m1, m2);
          totalDist += distanceMatrix.get(key) ?? 1;
          count++;
        }
      }
      const key = distKey(newNode.id, other.id);
      clusterDist.set(key, count > 0 ? totalDist / count : 1);
    }

    clusters = [...remaining, newNode];
  }

  return clusters[0];
}

// === PCA (2D projection via power iteration) ===

function computePCA(
  coachIds: string[],
  coachVectors: Map<string, number[]>
): { coachId: string; x: number; y: number }[] {
  const n = coachIds.length;
  if (n < 2) return coachIds.map((id) => ({ coachId: id, x: 0, y: 0 }));

  // Get vectors, center them
  const vectors = coachIds.map((id) => coachVectors.get(id) || []);
  const dim = Math.max(...vectors.map((v) => v.length));

  // Pad to same length
  const padded = vectors.map((v) => {
    const p = [...v];
    while (p.length < dim) p.push(0);
    return p;
  });

  // Center
  const means = new Array(dim).fill(0);
  for (const v of padded) {
    for (let j = 0; j < dim; j++) means[j] += v[j];
  }
  for (let j = 0; j < dim; j++) means[j] /= n;

  const centered = padded.map((v) => v.map((val, j) => val - means[j]));

  // Compute covariance matrix (n×n since n < dim typically)
  // Use SVD-like approach: compute C = X * X^T (n×n), find top 2 eigenvectors
  const gram = Array.from({ length: n }, () => new Array(n).fill(0));
  for (let i = 0; i < n; i++) {
    for (let j = i; j < n; j++) {
      let dot = 0;
      for (let k = 0; k < dim; k++) {
        dot += centered[i][k] * centered[j][k];
      }
      gram[i][j] = dot;
      gram[j][i] = dot;
    }
  }

  // Power iteration for top 2 eigenvectors
  function powerIteration(matrix: number[][], deflatedMatrix?: number[][]): number[] {
    const m = deflatedMatrix || matrix;
    const size = m.length;
    let vec = new Array(size).fill(0).map(() => Math.random() - 0.5);
    // Normalize
    let norm = Math.sqrt(vec.reduce((s, v) => s + v * v, 0));
    vec = vec.map((v) => v / norm);

    for (let iter = 0; iter < 100; iter++) {
      const newVec = new Array(size).fill(0);
      for (let i = 0; i < size; i++) {
        for (let j = 0; j < size; j++) {
          newVec[i] += m[i][j] * vec[j];
        }
      }
      norm = Math.sqrt(newVec.reduce((s, v) => s + v * v, 0));
      if (norm === 0) break;
      vec = newVec.map((v) => v / norm);
    }
    return vec;
  }

  const pc1 = powerIteration(gram);

  // Deflate: remove PC1 component
  const eigenvalue1 = pc1.reduce((s, v, i) => {
    let dot = 0;
    for (let j = 0; j < n; j++) dot += gram[i][j] * pc1[j];
    return s + dot * pc1[i];
  }, 0);

  const deflated = gram.map((row, i) =>
    row.map((val, j) => val - eigenvalue1 * pc1[i] * pc1[j])
  );
  const pc2 = powerIteration(gram, deflated);

  // Project each coach onto PC1 and PC2
  return coachIds.map((id, i) => ({
    coachId: id,
    x: pc1[i],
    y: pc2[i],
  }));
}

// === Dendrogram SVG Rendering ===

function DendrogramSVG({ root, coachNames, width, height }: {
  root: ClusterNode;
  coachNames: Map<string, string>;
  width: number;
  height: number;
}) {
  const leafOrder = getLeafOrder(root);
  const n = leafOrder.length;
  const margin = { top: 10, right: 10, bottom: 60, left: 10 };
  const plotWidth = width - margin.left - margin.right;
  const plotHeight = height - margin.top - margin.bottom;

  // X positions: evenly spaced for leaves
  const xPos = new Map<string, number>();
  leafOrder.forEach((id, i) => {
    xPos.set(id, margin.left + (i + 0.5) * (plotWidth / n));
  });

  // Y scale: 0 at bottom (leaves), maxHeight at top
  const maxHeight = root.height || 1;
  const yScale = (h: number) => margin.top + plotHeight * (1 - h / maxHeight);

  // Recursively build lines
  const lines: { x1: number; y1: number; x2: number; y2: number }[] = [];

  function traverse(node: ClusterNode): number {
    if (!node.left || !node.right) {
      return xPos.get(node.id) || 0;
    }
    const leftX = traverse(node.left);
    const rightX = traverse(node.right);
    const midX = (leftX + rightX) / 2;
    const y = yScale(node.height);
    const leftY = yScale(node.left.height);
    const rightY = yScale(node.right.height);

    // Left vertical
    lines.push({ x1: leftX, y1: leftY, x2: leftX, y2: y });
    // Right vertical
    lines.push({ x1: rightX, y1: rightY, x2: rightX, y2: y });
    // Horizontal connector
    lines.push({ x1: leftX, y1: y, x2: rightX, y2: y });

    xPos.set(node.id, midX);
    return midX;
  }

  traverse(root);

  return (
    <svg width={width} height={height} className="block">
      {lines.map((line, i) => (
        <line
          key={i}
          x1={line.x1} y1={line.y1} x2={line.x2} y2={line.y2}
          stroke="#4B5563"
          strokeWidth={1.5}
        />
      ))}
      {/* Leaf labels */}
      {leafOrder.map((id, i) => (
        <text
          key={id}
          x={xPos.get(id) || 0}
          y={height - margin.bottom + 12}
          textAnchor="middle"
          className="text-xs fill-gray-600"
          transform={`rotate(-45, ${xPos.get(id) || 0}, ${height - margin.bottom + 12})`}
        >
          {coachNames.get(id) || id}
        </text>
      ))}
      {/* Y-axis label */}
      <text x={5} y={margin.top + 5} className="text-xs fill-gray-400">
        Distance
      </text>
    </svg>
  );
}

function getLeafOrder(node: ClusterNode): string[] {
  if (!node.left || !node.right) return [node.id];
  return [...getLeafOrder(node.left), ...getLeafOrder(node.right)];
}

// === Correlation Heatmap ===

function CorrelationHeatmap({ coachOrder, correlationMatrix, coachNames }: {
  coachOrder: string[];
  correlationMatrix: Map<string, number>;
  coachNames: Map<string, string>;
}) {
  const [hoveredCell, setHoveredCell] = useState<{ i: number; j: number; corr: number } | null>(null);
  const n = coachOrder.length;
  const cellSize = Math.min(40, Math.floor(500 / n));

  const corrKey = (a: string, b: string) => a < b ? `${a}|${b}` : `${b}|${a}`;

  const getColor = (corr: number) => {
    // -1 (red) → 0 (white) → 1 (green)
    if (corr >= 0) {
      const intensity = Math.round(corr * 200);
      return `rgb(${255 - intensity}, 255, ${255 - intensity})`;
    } else {
      const intensity = Math.round(-corr * 200);
      return `rgb(255, ${255 - intensity}, ${255 - intensity})`;
    }
  };

  return (
    <div className="relative">
      {hoveredCell && (
        <div className="absolute -top-8 left-1/2 transform -translate-x-1/2 bg-gray-800 text-white text-xs px-2 py-1 rounded z-10 whitespace-nowrap">
          {coachNames.get(coachOrder[hoveredCell.i]) || '?'} ↔ {coachNames.get(coachOrder[hoveredCell.j]) || '?'}: r = {hoveredCell.corr.toFixed(3)}
        </div>
      )}
      <div className="inline-block">
        {/* Column labels */}
        <div className="flex" style={{ marginLeft: cellSize * 3 + 4 }}>
          {coachOrder.map((id, i) => (
            <div
              key={id}
              className="text-xs text-gray-500 overflow-hidden"
              style={{
                width: cellSize,
                height: cellSize * 2.5,
                writingMode: 'vertical-rl',
                transform: 'rotate(180deg)',
                textAlign: 'left',
              }}
            >
              {coachNames.get(id) || id}
            </div>
          ))}
        </div>
        {/* Grid */}
        {coachOrder.map((rowId, i) => (
          <div key={rowId} className="flex items-center">
            {/* Row label */}
            <div
              className="text-xs text-gray-500 text-right pr-1 overflow-hidden whitespace-nowrap"
              style={{ width: cellSize * 3 }}
            >
              {coachNames.get(rowId) || rowId}
            </div>
            {/* Cells */}
            {coachOrder.map((colId, j) => {
              const corr = i === j ? 1 : (correlationMatrix.get(corrKey(rowId, colId)) ?? 0);
              return (
                <div
                  key={colId}
                  style={{
                    width: cellSize,
                    height: cellSize,
                    backgroundColor: getColor(corr),
                    border: '1px solid #e5e7eb',
                  }}
                  className="cursor-help"
                  onMouseEnter={() => setHoveredCell({ i, j, corr })}
                  onMouseLeave={() => setHoveredCell(null)}
                />
              );
            })}
          </div>
        ))}
      </div>
      {/* Legend */}
      <div className="flex items-center gap-2 mt-3 text-xs text-gray-500">
        <span>-1.0</span>
        <div className="flex h-3 w-32">
          {Array.from({ length: 20 }, (_, i) => {
            const corr = -1 + (i / 19) * 2;
            return (
              <div key={i} className="flex-1" style={{ backgroundColor: getColor(corr) }} />
            );
          })}
        </div>
        <span>+1.0</span>
        <span className="ml-2 text-gray-400">(Pearson r between coaches on shared players)</span>
      </div>
    </div>
  );
}

// === PCA Scatter Plot ===

function PCAScatter({ points, coachNames }: {
  points: { coachId: string; x: number; y: number }[];
  coachNames: Map<string, string>;
}) {
  const [hovered, setHovered] = useState<string | null>(null);
  const width = 500;
  const height = 400;
  const margin = { top: 20, right: 20, bottom: 30, left: 30 };

  const xVals = points.map((p) => p.x);
  const yVals = points.map((p) => p.y);
  const xMin = Math.min(...xVals);
  const xMax = Math.max(...xVals);
  const yMin = Math.min(...yVals);
  const yMax = Math.max(...yVals);
  const xRange = xMax - xMin || 1;
  const yRange = yMax - yMin || 1;

  const scaleX = (v: number) => margin.left + ((v - xMin) / xRange) * (width - margin.left - margin.right);
  const scaleY = (v: number) => margin.top + (1 - (v - yMin) / yRange) * (height - margin.top - margin.bottom);

  // Assign colors based on position (simple hue mapping)
  const getColor = (idx: number) => {
    const hue = (idx * 360) / points.length;
    return `hsl(${hue}, 65%, 50%)`;
  };

  return (
    <div className="relative">
      <svg width={width} height={height} className="block border border-gray-200 rounded">
        {/* Axes */}
        <line x1={margin.left} y1={height - margin.bottom} x2={width - margin.right} y2={height - margin.bottom} stroke="#e5e7eb" />
        <line x1={margin.left} y1={margin.top} x2={margin.left} y2={height - margin.bottom} stroke="#e5e7eb" />
        <text x={width / 2} y={height - 5} textAnchor="middle" className="text-xs fill-gray-400">PC1</text>
        <text x={12} y={height / 2} textAnchor="middle" className="text-xs fill-gray-400" transform={`rotate(-90, 12, ${height / 2})`}>PC2</text>

        {/* Points */}
        {points.map((p, i) => (
          <g key={p.coachId}>
            <circle
              cx={scaleX(p.x)}
              cy={scaleY(p.y)}
              r={hovered === p.coachId ? 8 : 6}
              fill={getColor(i)}
              stroke="white"
              strokeWidth={2}
              className="cursor-pointer"
              onMouseEnter={() => setHovered(p.coachId)}
              onMouseLeave={() => setHovered(null)}
            />
            {/* Always show label */}
            <text
              x={scaleX(p.x) + 10}
              y={scaleY(p.y) + 4}
              className="text-xs fill-gray-700"
            >
              {coachNames.get(p.coachId) || p.coachId}
            </text>
          </g>
        ))}
      </svg>
      {hovered && (
        <div className="text-xs text-gray-500 mt-1">
          {coachNames.get(hovered)}
        </div>
      )}
      <p className="text-xs text-gray-400 mt-2">
        Coaches plotted in 2D using PCA. Proximity = similar scoring patterns across shared players.
      </p>
    </div>
  );
}

// === Main Component ===

type SubView = 'heatmap' | 'dendrogram' | 'pca';

export default function CoachClustersTab({ reliability }: Props) {
  const [subView, setSubView] = useState<SubView>('heatmap');

  // Build per-coach score vectors (only include non-excluded coaches with data)
  const activeCoaches = useMemo(() => {
    return reliability.filter((cr) => !cr.isExcluded && cr.playerDeviations.length >= 3);
  }, [reliability]);

  // Build coach vectors: coachId → Map<playerId, normalizedScore>
  const coachScoreMaps = useMemo(() => {
    const maps = new Map<string, Map<string, number>>();
    for (const coach of activeCoaches) {
      const playerScores = new Map<string, number>();
      for (const pd of coach.playerDeviations) {
        if (!pd.isExcluded) {
          playerScores.set(pd.playerId, pd.coachNormalized);
        }
      }
      maps.set(coach.coachId, playerScores);
    }
    return maps;
  }, [activeCoaches]);

  // Compute pairwise Pearson correlation matrix
  const { correlationMatrix, distanceMatrix } = useMemo(() => {
    const corrMap = new Map<string, number>();
    const distMap = new Map<string, number>();
    const coachIds = activeCoaches.map((c) => c.coachId);

    for (let i = 0; i < coachIds.length; i++) {
      for (let j = i + 1; j < coachIds.length; j++) {
        const aId = coachIds[i];
        const bId = coachIds[j];
        const aScores = coachScoreMaps.get(aId)!;
        const bScores = coachScoreMaps.get(bId)!;

        // Find shared players
        const shared: { a: number; b: number }[] = [];
        for (const [playerId, scoreA] of aScores) {
          const scoreB = bScores.get(playerId);
          if (scoreB !== undefined) {
            shared.push({ a: scoreA, b: scoreB });
          }
        }

        let corr = 0;
        if (shared.length >= 3) {
          corr = pearsonCorrelation(
            shared.map((s) => s.a),
            shared.map((s) => s.b)
          );
        }

        const key = aId < bId ? `${aId}|${bId}` : `${bId}|${aId}`;
        corrMap.set(key, corr);
        // Distance: 1 - correlation (0 = identical, 2 = opposite)
        distMap.set(key, 1 - corr);
      }
    }

    return { correlationMatrix: corrMap, distanceMatrix: distMap };
  }, [activeCoaches, coachScoreMaps]);

  // Hierarchical clustering
  const clusterTree = useMemo(() => {
    const coachIds = activeCoaches.map((c) => c.coachId);
    if (coachIds.length < 2) return null;
    return hierarchicalCluster(coachIds, distanceMatrix);
  }, [activeCoaches, distanceMatrix]);

  // Leaf order from dendrogram (for heatmap row/column ordering)
  const clusterOrder = useMemo(() => {
    if (!clusterTree) return activeCoaches.map((c) => c.coachId);
    return getLeafOrder(clusterTree);
  }, [clusterTree, activeCoaches]);

  // PCA projection
  const pcaPoints = useMemo(() => {
    const coachIds = activeCoaches.map((c) => c.coachId);
    if (coachIds.length < 2) return [];

    // Build full vectors: for each coach, a vector of scores on ALL players that appear
    const allPlayers = new Set<string>();
    for (const [, scores] of coachScoreMaps) {
      for (const playerId of scores.keys()) {
        allPlayers.add(playerId);
      }
    }
    const playerList = Array.from(allPlayers).sort();

    // For PCA, fill missing values with the mean of that player across coaches
    const playerMeans = new Map<string, number>();
    for (const pid of playerList) {
      const vals: number[] = [];
      for (const [, scores] of coachScoreMaps) {
        const v = scores.get(pid);
        if (v !== undefined) vals.push(v);
      }
      playerMeans.set(pid, vals.length > 0 ? vals.reduce((s, v) => s + v, 0) / vals.length : 0);
    }

    const coachVectors = new Map<string, number[]>();
    for (const coachId of coachIds) {
      const scores = coachScoreMaps.get(coachId)!;
      const vec = playerList.map((pid) => scores.get(pid) ?? playerMeans.get(pid)!);
      coachVectors.set(coachId, vec);
    }

    return computePCA(coachIds, coachVectors);
  }, [activeCoaches, coachScoreMaps]);

  // Coach name map
  const coachNames = useMemo(() => {
    const map = new Map<string, string>();
    for (const cr of reliability) {
      map.set(cr.coachId, cr.coachName);
    }
    return map;
  }, [reliability]);

  if (activeCoaches.length < 3) {
    return (
      <div className="text-center py-8 text-gray-500">
        <p>Need at least 3 active coaches with 3+ shared player evaluations to compute clusters.</p>
        <p className="text-sm mt-2">Currently {activeCoaches.length} coaches qualify.</p>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-4">
        <h3 className="text-lg font-semibold mb-1">Coach Clusters</h3>
        <p className="text-sm text-gray-600">
          Which coaches tend to score players similarly? Coaches in the same cluster agree on relative player ability.
          This uses Pearson correlation on normalized scores across shared players.
        </p>
      </div>

      {/* Sub-view tabs */}
      <div className="flex gap-1 mb-4 border-b border-gray-200">
        {([
          { id: 'heatmap' as SubView, label: 'Correlation Heatmap' },
          { id: 'dendrogram' as SubView, label: 'Cluster Dendrogram' },
          { id: 'pca' as SubView, label: 'PCA Scatter' },
        ]).map((tab) => (
          <button
            key={tab.id}
            onClick={() => setSubView(tab.id)}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px ${
              subView === tab.id
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Heatmap View */}
      {subView === 'heatmap' && (
        <div>
          <p className="text-xs text-gray-500 mb-3">
            Coaches ordered by hierarchical clustering. Warm blocks along the diagonal = groups that agree.
            Green = positive correlation (similar rankings), Red = negative (opposite rankings).
          </p>
          <CorrelationHeatmap
            coachOrder={clusterOrder}
            correlationMatrix={correlationMatrix}
            coachNames={coachNames}
          />
        </div>
      )}

      {/* Dendrogram View */}
      {subView === 'dendrogram' && (
        <div>
          <p className="text-xs text-gray-500 mb-3">
            Hierarchical clustering dendrogram (average linkage). Coaches that merge at lower heights are more similar.
            Branch height = correlation distance (1 - Pearson r).
          </p>
          {clusterTree && (
            <DendrogramSVG
              root={clusterTree}
              coachNames={coachNames}
              width={Math.max(600, clusterOrder.length * 70)}
              height={300}
            />
          )}
        </div>
      )}

      {/* PCA View */}
      {subView === 'pca' && (
        <div>
          <p className="text-xs text-gray-500 mb-3">
            Each coach plotted in 2D space via Principal Component Analysis on their normalized score vectors.
            Coaches close together rate players similarly overall.
          </p>
          <PCAScatter points={pcaPoints} coachNames={coachNames} />
        </div>
      )}

      {/* Summary stats */}
      <div className="mt-6 p-4 bg-gray-50 border rounded">
        <h4 className="text-sm font-semibold text-gray-700 mb-2">Cluster Summary</h4>
        <div className="text-sm text-gray-600 space-y-1">
          <p>
            <span className="font-medium">{activeCoaches.length}</span> coaches analyzed ·{' '}
            <span className="font-medium">{activeCoaches.length * (activeCoaches.length - 1) / 2}</span> pairwise comparisons
          </p>
          {(() => {
            const allCorrs: number[] = [];
            for (const [, corr] of correlationMatrix) allCorrs.push(corr);
            if (allCorrs.length === 0) return null;
            const avg = allCorrs.reduce((s, v) => s + v, 0) / allCorrs.length;
            const min = Math.min(...allCorrs);
            const max = Math.max(...allCorrs);
            return (
              <>
                <p>
                  Average pairwise correlation: <span className="font-medium">{avg.toFixed(3)}</span>
                  {' '}(min: {min.toFixed(3)}, max: {max.toFixed(3)})
                </p>
                {avg < 0.3 && (
                  <p className="text-amber-600">
                    ⚠ Low average correlation — coaches have quite different views on players.
                  </p>
                )}
                {avg > 0.7 && (
                  <p className="text-green-600">
                    ✓ High average correlation — strong consensus among coaches.
                  </p>
                )}
              </>
            );
          })()}
        </div>
      </div>
    </div>
  );
}
