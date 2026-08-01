# Data Model — DynamoDB Single Table

## Table Structure

**Table name:** `PlayerEval` (production) or `PlayerEval-<branch>` (feature branches)

| Entity | PK | SK | Key Attributes |
|--------|----|----|----------------|
| Team metadata | `TEAM#<teamId>` | `META` | name, leadEmail, inviteCode, createdAt |
| Player | `TEAM#<teamId>` | `PLAYER#<playerId>` | id, name, number, primaryPosition, secondaryPosition, requiredEvaluations |
| Coach | `TEAM#<teamId>` | `COACH#<coachId>` | id, name, email, maxPlayers, isLead |
| Assignment | `TEAM#<teamId>` | `ASSIGN#<coachId>#<playerId>` | coachId, playerId |
| Evaluation | `TEAM#<teamId>` | `EVAL#<coachId>#<playerId>` | id, attitude, effort, footballIQ, generalSkill, positionSkill, totalScore, createdAt, updatedAt |
| Auth token | `AUTH#<token>` | `TOKEN` | email, teamId, expiresAt |
| Invite lookup | `INVITE#<code>` | `META` | teamId |

## Access Patterns

| Pattern | Query |
|---------|-------|
| All players for a team | PK=`TEAM#<teamId>`, SK begins_with `PLAYER#` |
| All coaches for a team | PK=`TEAM#<teamId>`, SK begins_with `COACH#` |
| All assignments for a team | PK=`TEAM#<teamId>`, SK begins_with `ASSIGN#` |
| All evaluations for a team | PK=`TEAM#<teamId>`, SK begins_with `EVAL#` |
| Verify magic token | PK=`AUTH#<token>`, SK=`TOKEN` |
| Lookup team by invite code | PK=`INVITE#<code>`, SK=`META` |

## Design Notes

- **No GSIs** — All queries are satisfied by PK + SK prefix. Scale is small enough (< 100 players/team).
- **One evaluation per coach-player pair** — SK `EVAL#<coachId>#<playerId>` enforces uniqueness.
- **Invite codes are team-scoped** — One code per team, all coaches share it.
- **CSV upsert identity:** Players matched by `number`, coaches matched by `email`.
