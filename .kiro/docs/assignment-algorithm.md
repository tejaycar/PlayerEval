# Assignment Algorithm

## Goal

Assign coaches to players such that:
1. Every player gets at least their required number of evaluations
2. No coach exceeds their max player limit
3. Coaches are loaded proportionally to their capacity
4. Extra capacity (if any) is spread evenly across players
5. Overlap is minimized across groups of coaches (no 3-4 coaches all evaluating the same set of players)

## Algorithm — Two Phases

### Phase 1: Fill Minimum Requirements

Process in rounds. Each round:
1. Sort players by completion ratio (lowest first — furthest from their minimum gets priority)
2. For each player still needing evaluations, find the best coach:
   - Must not already be assigned to this player
   - Must not be at capacity
   - Scored by: (overlap with player's existing evaluators × 10000) + (coach utilization ratio × 1000)
   - Lowest score wins
3. Assign one coach per player per round
4. Repeat until all minimums are met or no progress possible

### Phase 2: Distribute Extra Capacity

If coaches have remaining capacity after all minimums are met:
1. Sort players by current evaluation count (fewest first)
2. Assign one evaluation to the player with fewest, using the same best-coach scoring
3. One assignment per round for even distribution
4. Repeat until all capacity used or no eligible assignments remain

## Scoring Function

```
score = overlapScore × 10000 + utilizationRatio × 1000
```

- **overlapScore:** Sum of pair overlaps between candidate coach and all coaches already assigned to this player. Prevents "clumping" where the same group of coaches evaluates the same players.
- **utilizationRatio:** `currentLoad / maxPlayers` (0.0–1.0). Ensures proportional loading — a coach at 5/15 (33%) gets assignments before a coach at 5/10 (50%).

## Properties (verified by unit tests)

- All players get ≥ required evaluations
- No coach exceeds max
- Coaches with max 10 get ~2/3 the assignments of coaches with max 15
- Extra capacity spread evenly (max deviation ≤ 2 across players)
- Triple overlap bounded (no 3 coaches share >50% of any coach's load)

## Edge Cases

- If total coach capacity < total required evaluations: some players won't reach their minimum (warning shown in UI)
- If a player requires more evaluations than coaches exist: capped at number of coaches
- Lead coach participates in assignments like any other coach
