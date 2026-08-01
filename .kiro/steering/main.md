# PlayerEval — Project Steering

PlayerEval is a youth football player evaluation platform. Coaches rate players on 5 categories (1-10); leads manage teams, assignments, and view aggregated results.

## Quick Reference

- **Stack:** React + Vite + Tailwind (frontend), Lambda + DynamoDB + API Gateway (backend), CDK (infra), CloudFront + S3 (hosting)
- **Region:** us-east-2
- **Auth:** Magic link via SES → JWT (30-day sessions). Feature branches use BYPASS_AUTH=true.
- **Repo structure:** Monorepo with `packages/frontend`, `packages/backend`, `packages/infra`, `packages/shared`
- **CI/CD:** GitHub Actions — deploy on push. Playwright tests run on feature branches only (skipped on main due to auth).
- **Feature branch isolation:** Each branch gets its own CDK stack (DynamoDB table, CloudFront distribution, Lambda).

## Documentation Index

For deeper context, reference these files:

- **Architecture & infra:** #[[file:.kiro/docs/architecture.md]]
- **Data model (DynamoDB):** #[[file:.kiro/docs/data-model.md]]
- **Auth system:** #[[file:.kiro/docs/auth.md]]
- **Assignment algorithm:** #[[file:.kiro/docs/assignment-algorithm.md]]
- **API reference:** #[[file:.kiro/docs/api.md]]
- **Frontend conventions:** #[[file:.kiro/docs/frontend.md]]
- **Testing strategy:** #[[file:.kiro/docs/testing.md]]
- **Deployment & CI/CD:** #[[file:.kiro/docs/deployment.md]]

## Key Design Decisions

1. **Single-table DynamoDB** — All entities (teams, players, coaches, evaluations, assignments) in one table with PK/SK pattern. Enables simple access patterns without joins.
2. **No passwords** — Magic link only. Keeps it simple for volunteer coaches who won't remember passwords.
3. **One invite code per team** — All coaches share the same invite link. Lead must pre-register coach emails before they can sign up.
4. **CSV upsert** — Uploading a CSV overwrites existing records (matched by player number or coach email), not appends.
5. **Proportional coach loading** — Assignment algorithm distributes evaluations proportional to each coach's max capacity.
6. **Editable tables** — No modal forms or separate pages. All data entry happens inline in tables with immediate save on blur.
7. **Bypass auth for testing** — Feature branches accept base64-encoded JSON as Bearer tokens. Production requires real JWT from magic link flow.
