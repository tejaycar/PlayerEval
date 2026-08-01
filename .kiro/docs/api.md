# API Reference

Base URL: `/api` (proxied through CloudFront)

## Public Endpoints (no auth required)

| Method | Path | Description |
|--------|------|-------------|
| POST | `/setup` | Create team + lead coach, returns JWT |
| POST | `/auth/request` | Request magic link (sends email) |
| GET | `/auth/verify?token=<token>` | Verify magic link, returns JWT |
| POST | `/auth/signup` | Coach signup via invite code |

### POST /setup
```json
// Request
{ "teamName": "Wildcats U12", "leadName": "Coach Johnson", "leadEmail": "johnson@example.com" }
// Response 201
{ "token": "<jwt>", "coach": { "id", "name", "isLead", "teamId", "email" }, "teamId", "inviteCode" }
```

### POST /auth/request
```json
// Request
{ "email": "coach@example.com", "teamId": "<uuid>" }
// Response 200
{ "message": "Magic link sent", "token": "<only if BYPASS_AUTH=true>" }
```

### POST /auth/signup
```json
// Request
{ "email": "coach@example.com", "inviteCode": "abc123" }
// Response 200
{ "message": "Magic link sent", "token": "<only if BYPASS_AUTH=true>" }
```

## Protected Endpoints (Bearer token required)

### Players

| Method | Path | Access | Description |
|--------|------|--------|-------------|
| GET | `/players` | All | List players |
| POST | `/players` | Lead | Create player |
| POST | `/players/upload` | Lead | Bulk upsert (match by number) |
| PUT | `/players/:id` | Lead | Update player |
| DELETE | `/players/:id` | Lead | Delete player |

### Coaches

| Method | Path | Access | Description |
|--------|------|--------|-------------|
| GET | `/coaches` | All | List coaches |
| POST | `/coaches` | Lead | Create coach |
| POST | `/coaches/upload` | Lead | Bulk upsert (match by email) |
| PUT | `/coaches/:id` | Lead | Update coach |
| DELETE | `/coaches/:id` | Lead | Delete coach |
| GET | `/coaches/invite-link` | Lead | Get team invite link |

### Assignments

| Method | Path | Access | Description |
|--------|------|--------|-------------|
| GET | `/assignments` | All | List all assignments |
| POST | `/assignments/auto` | Lead | Run auto-assignment algorithm |
| POST | `/assignments` | Lead | Add manual assignment |
| DELETE | `/assignments/:coachId/:playerId` | Lead | Remove assignment |

### Evaluations

| Method | Path | Access | Description |
|--------|------|--------|-------------|
| GET | `/evaluations` | All (filtered) | Lead sees all, coach sees own |
| GET | `/evaluations/summary` | All | Per-player average stats |
| GET | `/evaluations/player/:id` | Lead | All evaluations for one player |
| POST | `/evaluations` | Assigned coaches | Submit/update evaluation (upsert) |

### Other

| Method | Path | Access | Description |
|--------|------|--------|-------------|
| GET | `/team` | All | Get team metadata |
| GET | `/my-players` | All | Coach's assigned players with eval data |

## CSV Upload Format

**Players:** `name,number,primary_position,secondary_position,required_evaluations`
- Upsert key: `number`

**Coaches:** `name,email,max_players`
- Upsert key: `email` (case-insensitive)
