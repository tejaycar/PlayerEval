import type { Player, Coach, Assignment } from '@player-eval/shared';

/**
 * Auto-assignment algorithm that:
 * 1. Guarantees every player gets their required minimum evaluations
 * 2. Distributes extra eval slots evenly across players
 * 3. Loads coaches proportionally to their max capacity
 * 4. Minimizes overlap concentration across coach subsets
 *
 * Strategy:
 * - Phase 1: Fill minimum requirements. For each unfilled slot, pick the coach
 *   with the lowest capacity utilization (load/max) who minimizes overlap.
 * - Phase 2: Distribute remaining capacity evenly. Players who have fewer
 *   evaluations get priority for extras, spread across coaches proportionally.
 */
export function computeAssignments(
  players: Player[],
  coaches: Coach[],
  teamId: string
): Assignment[] {
  const assignments: Assignment[] = [];
  const coachLoad: Map<string, number> = new Map();
  const playerEvalCount: Map<string, number> = new Map();
  const playerAssignedCoaches: Map<string, Set<string>> = new Map();
  const coachPairOverlap: Map<string, number> = new Map();

  // Initialize
  coaches.forEach((c) => coachLoad.set(c.id, 0));
  players.forEach((p) => {
    playerEvalCount.set(p.id, 0);
    playerAssignedCoaches.set(p.id, new Set());
  });

  const totalCapacity = coaches.reduce((sum, c) => sum + c.maxPlayers, 0);
  const totalRequired = players.reduce((sum, p) => sum + p.requiredEvaluations, 0);

  // === Phase 1: Fill minimum requirements ===
  // Process in rounds to ensure even distribution across coaches.
  // Each round gives each player at most one new assignment.
  let progress = true;
  while (progress) {
    progress = false;

    // Sort players: those furthest from their minimum get priority
    const playersNeedingEvals = players
      .filter((p) => {
        const count = playerEvalCount.get(p.id)!;
        return count < p.requiredEvaluations;
      })
      .sort((a, b) => {
        // Priority: lowest completion ratio first
        const ratioA = playerEvalCount.get(a.id)! / a.requiredEvaluations;
        const ratioB = playerEvalCount.get(b.id)! / b.requiredEvaluations;
        if (ratioA !== ratioB) return ratioA - ratioB;
        // Tie-break: higher requirement first (harder to satisfy)
        return b.requiredEvaluations - a.requiredEvaluations;
      });

    for (const player of playersNeedingEvals) {
      const alreadyAssigned = playerAssignedCoaches.get(player.id)!;
      const bestCoach = findBestCoach(
        player,
        coaches,
        coachLoad,
        alreadyAssigned,
        coachPairOverlap
      );

      if (!bestCoach) continue;

      assignCoachToPlayer(
        bestCoach,
        player,
        teamId,
        assignments,
        coachLoad,
        playerEvalCount,
        playerAssignedCoaches,
        coachPairOverlap
      );
      progress = true;
    }
  }

  // === Phase 2: Distribute extra capacity evenly ===
  // If coaches have remaining capacity after all minimums are met,
  // spread extra evals evenly across players.
  const remainingCapacity = totalCapacity - assignments.length;
  if (remainingCapacity > 0) {
    // Distribute extras in rounds
    let extraProgress = true;
    while (extraProgress) {
      extraProgress = false;

      // All players sorted by current eval count (fewest first for even spread)
      const playersByCount = [...players].sort((a, b) => {
        const countA = playerEvalCount.get(a.id)!;
        const countB = playerEvalCount.get(b.id)!;
        return countA - countB;
      });

      for (const player of playersByCount) {
        const alreadyAssigned = playerAssignedCoaches.get(player.id)!;
        // Don't assign more coaches than exist
        if (alreadyAssigned.size >= coaches.length) continue;

        const bestCoach = findBestCoach(
          player,
          coaches,
          coachLoad,
          alreadyAssigned,
          coachPairOverlap
        );

        if (!bestCoach) continue;

        assignCoachToPlayer(
          bestCoach,
          player,
          teamId,
          assignments,
          coachLoad,
          playerEvalCount,
          playerAssignedCoaches,
          coachPairOverlap
        );
        extraProgress = true;
        break; // One per round for even distribution
      }
    }
  }

  return assignments;
}

function assignCoachToPlayer(
  coach: Coach,
  player: Player,
  teamId: string,
  assignments: Assignment[],
  coachLoad: Map<string, number>,
  playerEvalCount: Map<string, number>,
  playerAssignedCoaches: Map<string, Set<string>>,
  coachPairOverlap: Map<string, number>
): void {
  const alreadyAssigned = playerAssignedCoaches.get(player.id)!;

  assignments.push({
    teamId,
    coachId: coach.id,
    playerId: player.id,
  });

  coachLoad.set(coach.id, (coachLoad.get(coach.id) || 0) + 1);
  playerEvalCount.set(player.id, (playerEvalCount.get(player.id) || 0) + 1);

  // Update pair overlap counts
  for (const existingCoachId of alreadyAssigned) {
    const pairKey = makePairKey(coach.id, existingCoachId);
    coachPairOverlap.set(pairKey, (coachPairOverlap.get(pairKey) || 0) + 1);
  }

  alreadyAssigned.add(coach.id);
}

function findBestCoach(
  player: Player,
  coaches: Coach[],
  coachLoad: Map<string, number>,
  alreadyAssigned: Set<string>,
  coachPairOverlap: Map<string, number>
): Coach | null {
  let bestCoach: Coach | null = null;
  let bestScore = Infinity;

  for (const coach of coaches) {
    // Skip if already assigned to this player
    if (alreadyAssigned.has(coach.id)) continue;

    // Skip if coach is at capacity
    const currentLoad = coachLoad.get(coach.id) || 0;
    if (currentLoad >= coach.maxPlayers) continue;

    // Calculate utilization ratio (0.0 to 1.0)
    const utilization = currentLoad / coach.maxPlayers;

    // Calculate overlap score: sum of pair overlaps with all coaches already assigned to this player
    let overlapScore = 0;
    for (const existingCoachId of alreadyAssigned) {
      const pairKey = makePairKey(coach.id, existingCoachId);
      overlapScore += coachPairOverlap.get(pairKey) || 0;
    }

    // Score: primarily minimize overlap, then prefer lower utilization ratio
    // Overlap is weighted heavily to maintain the "minimize grouping" property
    // Utilization ensures proportional loading (a coach at 50% of 10 = same priority as 50% of 15)
    const score = overlapScore * 10000 + utilization * 1000;

    if (score < bestScore) {
      bestScore = score;
      bestCoach = coach;
    }
  }

  return bestCoach;
}

function makePairKey(a: string, b: string): string {
  return a < b ? `${a}#${b}` : `${b}#${a}`;
}
