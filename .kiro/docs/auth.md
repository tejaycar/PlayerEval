# Authentication System

## Overview

PlayerEval uses passwordless magic link authentication. No passwords are stored or managed.

## Flow

### Production (BYPASS_AUTH=false)

1. Coach enters email + team ID (login) or email + invite code (signup)
2. Backend verifies coach exists in that team
3. Backend creates a one-time token (UUID, 15-min expiry) stored in DynamoDB
4. Backend sends email via SES with link: `https://<host>/auth/verify?token=<uuid>`
5. Coach clicks link → frontend calls `GET /api/auth/verify?token=<uuid>`
6. Backend validates token, looks up coach, issues JWT (30-day expiry)
7. Frontend stores JWT in localStorage, uses it for all subsequent API calls

### Feature Branches (BYPASS_AUTH=true)

1. Same flow, but the API response includes the magic token directly (no email sent)
2. Frontend auto-verifies the token immediately → instant login
3. Also accepts base64-encoded JSON as Bearer token (for Playwright tests)

## JWT Payload

```json
{
  "coachId": "uuid",
  "teamId": "uuid",
  "email": "coach@example.com",
  "isLead": true/false,
  "iat": 1234567890,
  "exp": 1234567890
}
```

## Authorization Rules

| Action | Lead | Coach |
|--------|------|-------|
| Create/edit/delete players | Yes | No |
| Create/edit/delete coaches | Yes | No |
| Upload CSV | Yes | No |
| Manage assignments | Yes | No |
| View all evaluations in detail | Yes | No |
| Submit evaluations | Yes (if assigned) | Yes (if assigned) |
| View summary stats | Yes | Yes |
| View own evaluations | Yes | Yes |

## SES Configuration

- **Sender:** tejaycar@gmail.com (verified in us-east-2)
- **Sandbox status:** Production access requested
- **Recipient restriction (sandbox):** Only verified emails can receive (tejaycar@gmail.com, tejay.promos@gmail.com)

## Security Notes

- Magic tokens expire after 15 minutes
- JWTs expire after 30 days
- JWT secret is hardcoded on feature branches (`dev-secret-for-testing`), parameterized on production
- No rate limiting on auth endpoints (acceptable at current scale)
