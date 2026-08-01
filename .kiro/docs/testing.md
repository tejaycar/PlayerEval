# Testing Strategy

## Test Types

### Unit Tests (vitest)
- **Location:** `packages/backend/src/assignment.test.ts`
- **Run:** `npm run test -w @player-eval/backend`
- **Coverage:** Assignment algorithm (8 tests) — minimum guarantees, capacity limits, proportional loading, even distribution, overlap minimization

### E2E Tests (Playwright)
- **Location:** `tests/`
- **Run:** `npx playwright test`
- **Config:** `playwright.config.ts`
- **Browser:** Chromium (headless shell)

## Playwright Test Files

| File | What it tests | Requires backend? |
|------|---------------|-------------------|
| `lead-flow.spec.ts` | Page rendering, navigation, role gating | No (UI-only tests) |
| `lead-flow.spec.ts` "can add a player" | Adding via editable table | Yes (skipped locally) |
| `setup-test.spec.ts` | Team creation E2E flow | Yes (skipped locally) |
| `full-flow.spec.ts` | 45 players, 16 coaches, assignments, all evaluations | Yes (skipped locally) |

## Test Guards

Tests that require a deployed backend use:
```typescript
test.skip(!process.env.BASE_URL, 'Requires deployed backend');
```

## CI Behavior

| Branch | Deploy | Playwright |
|--------|--------|------------|
| main | Yes (production stack) | **Skipped** (no auth bypass) |
| feature/* | Yes (isolated stack) | **Runs** (BYPASS_AUTH=true) |
| pull_request | Yes (feature stack) | **Runs** |

## Auth in Tests

On feature branches (BYPASS_AUTH=true), tests authenticate by:
1. **UI tests:** Setting localStorage with `btoa(JSON.stringify(user))` as the token
2. **API tests:** Using `Buffer.from(JSON.stringify(user)).toString('base64')` as Bearer token

```typescript
const leadUser = { coachId: 'test-lead-001', teamId: 'test-team-001', email: 'lead@test.com', isLead: true };
const token = btoa(JSON.stringify(leadUser));
localStorage.setItem('playereval_token', token);
```

## Running Locally

```bash
# UI-only tests (no backend needed)
npx playwright test

# Against deployed environment
BASE_URL=https://d14s3z7jlnzlo5.cloudfront.net npx playwright test
```

The Playwright config auto-starts `vite preview` on port 4173 when no `BASE_URL` is set.
