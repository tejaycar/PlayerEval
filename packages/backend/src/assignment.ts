import type { Player, Coach, Assignment } from '@player-eval/shared';

/**
 * Auto-assignment algorithm that minimizes overlap concentration.
 * 
 * Goal: Assign coaches to players such that:
 * 1. Every player gets exactly their required number of evaluations
 * 2. No coach exceeds their max players limit
 * 3. Overlap is minimized - especially across groups of 3-4 coaches
 * 
 * Strategy: For each player needing an evaluator, pick the eligible coach
 * who shares the fewest current co-assignments with the player's other
 * assigned coaches. This naturally disperses overlap.
 */
export function computeAssignments(
  players: Player[],
  coaches: Coach[],
  teamId: string
): Assignment[] {
  // Track state
  const assignments: Assignment[] = [];
  const coachLoad: Map<string, number> = new Map(); // coachId -> current # assigned
  const playerAssignedCoaches: Map<string, Set<string>> = new Map(); // playerId -> set of coachIds
  const coachPairOverlap: Map<string, number> = new Map(); // "coachA#coachB" -> shared player count

  // Initialize
  coaches.forEach((c) => coachLoad.set(c.id, 0));
  players.forEach((p) => playerAssignedCoaches.set(p.id, new Set()));

  // Sort players by required evaluations descending (hardest to satisfy first)
  const sortedPlayers = [...players].sort(
    (a, b) => b.requiredEvaluations - a.requiredEvaluations
  );

  // For each player, assign the required number of coaches
  for (const player of sortedPlayers) {
    const needed = player.requiredEvaluations;
    const alreadyAssigned = playerAssignedCoaches.get(player.id)!;

    for (let i = alreadyAssigned.size; i < needed; i++) {
      const bestCoach = findBestCoach(
        player,
        coaches,
        coachLoad,
        alreadyAssigned,
        coachPairOverlap
      );

      if (!bestCoach) {
        // No eligible coach available - skip (shouldn't happen with valid input)
        console.warn(
          `Cannot assign evaluation #${i + 1} for player ${player.name} - no eligible coaches`
        );
        break;
      }

      // Record assignment
      assignments.push({
        teamId,
        coachId: bestCoach.id,
        playerId: player.id,
      });

      // Update state
      coachLoad.set(bestCoach.id, (coachLoad.get(bestCoach.id) || 0) + 1);

      // Update pair overlap counts
      for (const existingCoachId of alreadyAssigned) {
        const pairKey = makePairKey(bestCoach.id, existingCoachId);
        coachPairOverlap.set(pairKey, (coachPairOverlap.get(pairKey) || 0) + 1);
      }

      alreadyAssigned.add(bestCoach.id);
    }
  }

  return assignments;
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

    // Calculate overlap score: sum of pair overlaps with all coaches already assigned to this player
    let overlapScore = 0;
    for (const existingCoachId of alreadyAssigned) {
      const pairKey = makePairKey(coach.id, existingCoachId);
      overlapScore += coachPairOverlap.get(pairKey) || 0;
    }

    // Tie-break by current load (prefer less-loaded coaches)
    const score = overlapScore * 1000 + currentLoad;

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
