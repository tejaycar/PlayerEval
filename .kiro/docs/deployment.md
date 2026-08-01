# Deployment & CI/CD

## GitHub Actions Workflow

**File:** `.github/workflows/deploy.yml`
**Trigger:** Push to any branch, pull_request to main

### Pipeline Steps

1. Checkout → Setup Node 20 → `npm ci`
2. Build backend (esbuild → `packages/backend/dist/api.js`)
3. Build frontend (vite → `packages/frontend/dist/`)
4. Configure AWS via OIDC (role-to-assume)
5. `cdk deploy --require-approval never`
6. Get CloudFront URL from stack outputs
7. Install Playwright + run tests (feature branches only)
8. Upload test report artifact

### Branch → Stack Mapping

| Branch | Stack Name | Table | BYPASS_AUTH | Tests |
|--------|-----------|-------|-------------|-------|
| main | `PlayerEval` | `PlayerEval` | false | Skipped |
| feature/foo | `PlayerEval-feature-foo` | `PlayerEval-feature-foo` | true | Run |

## AWS Resources (per stack)

- DynamoDB table (PAY_PER_REQUEST)
- Lambda function (Node.js 20, 512MB, 30s timeout)
- HTTP API Gateway
- S3 bucket (frontend assets)
- CloudFront distribution (SPA + API routing)
- IAM role for Lambda (DynamoDB + SES access)

## OIDC Authentication

GitHub Actions authenticates to AWS via OIDC (no stored credentials):
- **Provider:** `token.actions.githubusercontent.com`
- **Role:** `arn:aws:iam::360131674346:role/playerEval-deployer`
- **Subject claim format (immutable):** `repo:tejaycar@3846348/PlayerEval@1318477679:<event>`

## Cleanup

Feature branch stacks are NOT automatically deleted when branches are merged/deleted. Manual cleanup:
```bash
aws cloudformation delete-stack --stack-name PlayerEval-<branch-name> --region us-east-2
```

## Production URLs

- **App:** https://d15wqjkloreps2.cloudfront.net
- **API:** https://d15wqjkloreps2.cloudfront.net/api/*

## CDK Commands (from `packages/infra/`)

```bash
BRANCH_NAME=main npx cdk synth    # Preview template
BRANCH_NAME=main npx cdk deploy   # Deploy
BRANCH_NAME=main npx cdk destroy  # Tear down
```
