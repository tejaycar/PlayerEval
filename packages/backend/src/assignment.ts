import type { Player, Coach, Assignment } from '@player-eval/shared';

/**
 * Auto-assignment algorithm that:
 * 1. Guarantees every player gets their required minimum evaluations
 * 2. Distributes extra eval slots evenly across players
 * 3. Loads coaches proportionally to their max capacity
 * 4. Minimizes overlap concentration across coach subsets
 * 5. Balances new players (isNew) evenly across coaches
 *
 * Strategy:
 * - Phase 1: Fill minimum requirements. For each unfilled slot, pick the coach
 *   with the lowest capacity utilization (load/max) who minimizes overlap.
 * - Phase 2: Distribute remaining capacity evenly. Players who have fewer
 *   evaluations get priority for extras, spread across coaches proportionally.
 * - Phase 3: Rebalance new players. If any coach has disproportionately more
 *   new players, swap assignments to even out the distribution.
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
  const coachNewPlayerCount: Map<string, number> = new Map();

  // Initialize
  coaches.forEach((c) => {
    coachLoad.set(c.id, 0);
    coachNewPlayerCount.set(c.id, 0);
  });
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
        coachPairOverlap,
        coachNewPlayerCount
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
        coachPairOverlap,
        coachNewPlayerCount
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
          coachPairOverlap,
          coachNewPlayerCount
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
          coachPairOverlap,
          coachNewPlayerCount
        );
        extraProgress = true;
        break; // One per round for even distribution
      }
    }
  }

  // === Phase 3: Rebalance new players across coaches ===
  rebalanceNewPlayers(assignments, players, coaches, coachLoad, coachNewPlayerCount, playerAssignedCoaches, playerEvalCount, coachPairOverlap, teamId);

  return assignments;
}

/**
 * Phase 3: Rebalance new players so no coach has disproportionately more
 * new players than others. This swaps assignments between coaches where possible.
 */
function rebalanceNewPlayers(
  assignments: Assignment[],
  players: Player[],
  coaches: Coach[],
  coachLoad: Map<string, number>,
  coachNewPlayerCount: Map<string, number>,
  playerAssignedCoaches: Map<string, Set<string>>,
  playerEvalCount: Map<string, number>,
  coachPairOverlap: Map<string, number>,
  teamId: string
): void {
  const newPlayers = players.filter((p) => p.isNew);
  if (newPlayers.length === 0) return;

  // Only consider coaches with capacity > 0 (active coaches)
  const activeCoaches = coaches.filter((c) => c.maxPlayers > 0);
  if (activeCoaches.length === 0) return;

  const playerMap = new Map(players.map((p) => [p.id, p]));

  // Try up to 100 swap iterations to balance
  for (let iter = 0; iter < 100; iter++) {
    // Find coach with the most new players and coach with the fewest
    let maxCoach: Coach | null = null;
    let minCoach: Coach | null = null;
    let maxNew = -1;
    let minNew = Infinity;

    for (const coach of activeCoaches) {
      const load = coachLoad.get(coach.id) || 0;
      if (load === 0) continue; // skip unloaded coaches
      const newCount = coachNewPlayerCount.get(coach.id) || 0;
      if (newCount > maxNew) { maxNew = newCount; maxCoach = coach; }
      if (newCount < minNew) { minNew = newCount; minCoach = coach; }
    }

    // If the difference is 1 or less, we are balanced
    if (!maxCoach || !minCoach || maxNew - minNew <= 1) break;

    // Try to find a swap: move a new player from maxCoach to minCoach
    // and a non-new player from minCoach to maxCoach
    let swapped = false;

    // Find a new player assigned to maxCoach but not to minCoach
    const maxCoachAssignments = assignments.filter((a) => a.coachId === maxCoach!.id);
    const minCoachAssignments = assignments.filter((a) => a.coachId === minCoach!.id);

    for (const aMax of maxCoachAssignments) {
      const playerMax = playerMap.get(aMax.playerId);
      if (!playerMax || !playerMax.isNew) continue;
      // This new player must not already be assigned to minCoach
      if (playerAssignedCoaches.get(aMax.playerId)!.has(minCoach!.id)) continue;

      // Find a non-new player assigned to minCoach but not to maxCoach
      for (const aMin of minCoachAssignments) {
        const playerMin = playerMap.get(aMin.playerId);
        if (!playerMin || playerMin.isNew) continue;
        // This non-new player must not already be assigned to maxCoach
        if (playerAssignedCoaches.get(aMin.playerId)!.has(maxCoach!.id)) continue;

        // Perform the swap:
        // Remove new player from maxCoach, assign to minCoach
        // Remove non-new player from minCoach, assign to maxCoach
        const idxMax = assignments.indexOf(aMax);
        const idxMin = assignments.indexOf(aMin);

        // Swap coach assignments
        assignments[idxMax] = { teamId, coachId: minCoach!.id, playerId: aMax.playerId };
        assignments[idxMin] = { teamId, coachId: maxCoach!.id, playerId: aMin.playerId };

        // Update tracking: playerAssignedCoaches
        playerAssignedCoaches.get(aMax.playerId)!.delete(maxCoach!.id);
        playerAssignedCoaches.get(aMax.playerId)!.add(minCoach!.id);
        playerAssignedCoaches.get(aMin.playerId)!.delete(minCoach!.id);
        playerAssignedCoaches.get(aMin.playerId)!.add(maxCoach!.id);

        // Update new player counts
        coachNewPlayerCount.set(maxCoach!.id, (coachNewPlayerCount.get(maxCoach!.id) || 0) - 1);
        coachNewPlayerCount.set(minCoach!.id, (coachNewPlayerCount.get(minCoach!.id) || 0) + 1);

        swapped = true;
        break;
      }
      if (swapped) break;
    }

    if (!swapped) break; // No valid swap found, stop
  }
}

function assignCoachToPlayer(
  coach: Coach,
  player: Player,
  teamId: string,
  assignments: Assignment[],
  coachLoad: Map<string, number>,
  playerEvalCount: Map<string, number>,
  playerAssignedCoaches: Map<string, Set<string>>,
  coachPairOverlap: Map<string, number>,
  coachNewPlayerCount: Map<string, number>
): void {
  const alreadyAssigned = playerAssignedCoaches.get(player.id)!;

  assignments.push({
    teamId,
    coachId: coach.id,
    playerId: player.id,
  });

  coachLoad.set(coach.id, (coachLoad.get(coach.id) || 0) + 1);
  playerEvalCount.set(player.id, (playerEvalCount.get(player.id) || 0) + 1);

  if (player.isNew) {
    coachNewPlayerCount.set(coach.id, (coachNewPlayerCount.get(coach.id) || 0) + 1);
  }

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
  coachPairOverlap: Map<string, number>,
  coachNewPlayerCount: Map<string, number>
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

    // New player balance: if this player is new, prefer coaches with fewer new players
    let newPlayerPenalty = 0;
    if (player.isNew) {
      newPlayerPenalty = (coachNewPlayerCount.get(coach.id) || 0) * 500;
    }

    // Score: primarily minimize overlap, then prefer lower utilization ratio,
    // then balance new players
    const score = overlapScore * 10000 + utilization * 1000 + newPlayerPenalty;

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
