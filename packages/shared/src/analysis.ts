import type { RatingCategory, RatingHistoryEntry } from './types';

// === Analysis Request/Response Types ===

export interface ExcludedRating {
  coachId: string;
  playerId: string;
}

export interface AnalysisRequest {
  excludedCoachIds?: string[];
  excludedRatings?: ExcludedRating[];
}

// === Normalized Player Data ===

export interface NormalizedPlayerScore {
  playerId: string;
  playerName: string;
  playerNumber: string;
  primaryPosition: string;
  secondaryPosition: string;
  evaluationCount: number; // how many coaches rated this player (after exclusions)
  rawTotal: number; // average raw total across coaches
  normalizedTotal: number; // Z-score normalized total, rescaled
  categories: Record<RatingCategory, number>; // normalized category scores (rescaled)
  rawCategories: Record<RatingCategory, number>; // raw average category scores
}

// === Box Plot Statistics ===

export interface BoxPlotStats {
  playerId: string;
  playerName: string;
  playerNumber: string;
  min: number;
  q1: number;
  median: number;
  q3: number;
  max: number;
  iqr: number;
  outliers: number[]; // individual normalized total scores that are outliers
  dataPoints: number[]; // all normalized total scores for this player
}

// === Coach Reliability Metrics ===

export interface CoachReliabilityMetrics {
  coachId: string;
  coachName: string;
  playersRated: number;
  /** Mean absolute deviation from median: avg of |coach_normalized - median| per player */
  madFromMedian: number;
  /** Mean deviation from mean: avg of (coach_normalized - mean) per player; positive = rates high */
  meanDeviationFromMean: number;
  /** Spearman rank correlation between coach's rankings and consensus rankings */
  rankCorrelation: number;
  /** Whether this coach is excluded from the analysis */
  isExcluded: boolean;
  /** Per-player deviations for drill-down */
  playerDeviations: PlayerDeviation[];
}

export interface PlayerDeviation {
  playerId: string;
  playerName: string;
  playerNumber: string;
  coachNormalized: number;
  medianNormalized: number;
  meanNormalized: number;
  deviation: number; // coach - median
  isExcluded?: boolean; // true if this individual rating was excluded
}

// === Player Impact Warning (for coach exclusion) ===

export interface PlayerImpactWarning {
  playerId: string;
  playerName: string;
  playerNumber: string;
  originalCount: number;
  reducedCount: number;
  droppedBy: number; // how many ratings removed
}

// === Full Analysis Response ===

export interface AnalysisResponse {
  playerRankings: NormalizedPlayerScore[];
  boxPlots: BoxPlotStats[];
  coachReliability: CoachReliabilityMetrics[]; // only populated for leads
  playerImpactWarnings: PlayerImpactWarning[]; // players losing >1 rating from exclusions
  /** ICC(3,1) staff agreement score: 0 = no agreement, 1 = perfect agreement */
  staffAgreementScore: number;
  /** Human-readable label: 'Excellent', 'Good', 'Fair', or 'Poor' */
  staffAgreementLabel: string;
  metadata: AnalysisMetadata;
}

export interface AnalysisMetadata {
  totalPlayers: number;
  totalCoaches: number;
  totalEvaluations: number;
  excludedCoachIds: string[];
  excludedRatings: ExcludedRating[];
  /** Coaches with stddev=0 who couldn't be Z-normalized */
  undifferentiatingCoaches: string[];
}

// === Rating Integrity Types ===

export interface LargeChange {
  coachId: string;
  playerId: string;
  timestamp: string;
  oldTotal: number;
  newTotal: number;
  delta: number;
  categoryDeltas: Record<RatingCategory, number>;
}

export interface CoordinatedChange {
  playerId: string;
  playerName: string;
  playerNumber: string;
  changes: Array<{ coachId: string; timestamp: string; delta: number }>;
  direction: 'increase' | 'decrease';
  windowStart: string;
  windowEnd: string;
}

export interface VarianceChange {
  coachId: string;
  playerId: string;
  timestamp: string;
  deviationBefore: number;
  deviationAfter: number;
  change: number; // positive = moved away from consensus, negative = moved toward
}

export interface RankShift {
  coachId: string;
  playerId: string;
  timestamp: string;
  rankBefore: number;
  rankAfter: number;
  positionsChanged: number;
}

export interface CoachIntegritySummary {
  coachId: string;
  coachName: string;
  totalChanges: number;
  avgMagnitude: number;
  flagCount: number;
  lastChangeTimestamp: string | null;
  netDirection: number;
}

export interface IntegrityAnalysisResponse {
  history: RatingHistoryEntry[];
  largeChanges: LargeChange[];
  coordinatedChanges: CoordinatedChange[];
  varianceIncreases: VarianceChange[];
  varianceDecreases: VarianceChange[];
  rankShifts: RankShift[];
  coachSummaries: CoachIntegritySummary[];
}
