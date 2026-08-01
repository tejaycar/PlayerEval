# Architecture

## System Diagram

```
Browser (SPA)
    │
    ├── Static assets ──→ S3 (via CloudFront)
    │
    └── /api/* ──→ CloudFront ──→ API Gateway (HTTP API) ──→ Lambda (single handler)
                                                                    │
                                                                    ├──→ DynamoDB (single table)
                                                                    └──→ SES (magic link emails)
```

## Components

### Frontend
- **Framework:** React 18 + Vite + Tailwind CSS
- **Routing:** react-router-dom v6
- **State:** Local component state (no global store — app is simple enough)
- **Build output:** Static HTML/JS/CSS → S3

### Backend
- **Runtime:** Node.js 20 on AWS Lambda
- **Entry point:** Single Lambda handler (`packages/backend/src/handlers/api.ts`) handles all routes
- **Bundling:** esbuild → CJS format (Lambda default runtime doesn't support ESM)
- **External deps:** `@aws-sdk/*` excluded from bundle (available in Lambda runtime)

### Infrastructure (CDK)
- **Language:** TypeScript
- **Execution:** `npx tsx bin/app.ts` (not ts-node — ESM compatibility)
- **Stack per branch:** Stack name derived from branch name. Production = `PlayerEval`, feature = `PlayerEval-<branch>`

### Networking
- **CloudFront** serves both static assets (S3 origin) and API (API Gateway origin on `/api/*`)
- **No custom domain yet** — uses CloudFront-provided `*.cloudfront.net`
- **CORS:** Configured on API Gateway (allow all origins for now)
- **SPA routing:** CloudFront returns `index.html` for 404/403 responses (client-side routing)

## Key Choices

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Single Lambda vs multiple | Single | Simple routing, fewer cold starts, easier deployment |
| API Gateway type | HTTP API (v2) | Cheaper, faster, sufficient for this use case |
| DynamoDB billing | PAY_PER_REQUEST | Unpredictable traffic, no need to provision capacity |
| Frontend framework | React + Vite | Fast builds, simple, widely known |
| CSS | Tailwind | Utility-first, no CSS files to manage, consistent styling |
| Package manager | npm workspaces | Native, no extra tooling (no nx/turbo needed at this scale) |
