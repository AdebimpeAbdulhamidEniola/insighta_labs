# Insighta Labs+ — Secure Demographic Intelligence Platform

![Version](https://img.shields.io/badge/version-3.0.0-blue.svg)
![TypeScript](https://img.shields.io/badge/TypeScript-Ready-blue)
![Prisma](https://img.shields.io/badge/Prisma-Active-darkblue)
![Express.js](https://img.shields.io/badge/Express.js-Framework-lightgrey)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-Neon-green)

Insighta Labs+ is a secure, multi-interface demographic intelligence platform built for analysts, engineers, and internal stakeholders. It exposes a REST API secured with GitHub OAuth + PKCE, role-based access control, and is accessible through both a CLI tool and a web portal.

---

## System Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                        Clients                              │
│                                                             │
│   ┌──────────────┐   ┌──────────────┐   ┌───────────────┐  │
│   │  CLI Tool    │   │  Web Portal  │   │  Direct API   │  │
│   │  (Node.js)   │   │  (React)     │   │  Consumers    │  │
│   └──────┬───────┘   └──────┬───────┘   └───────┬───────┘  │
│          │                  │                   │           │
└──────────┼──────────────────┼───────────────────┼───────────┘
           │                  │                   │
           │  Bearer Token    │  HTTP-only Cookie │  Bearer Token
           │                  │                   │
┌──────────▼──────────────────▼───────────────────▼───────────┐
│                   Express.js Backend                         │
│                                                              │
│  ┌─────────────┐  ┌───────────────┐  ┌────────────────────┐ │
│  │ Rate Limiter│  │ Auth Middleware│  │ API Version Check  │ │
│  └─────────────┘  └───────────────┘  └────────────────────┘ │
│                                                              │
│  ┌──────────────────────┐  ┌──────────────────────────────┐  │
│  │   /auth routes       │  │   /api/profiles routes       │  │
│  │   GitHub OAuth/PKCE  │  │   Filtering, Sorting,        │  │
│  │   Token issuance     │  │   Pagination, NLP Search,    │  │
│  │   Refresh rotation   │  │   Export, CRUD               │  │
│  └──────────────────────┘  └──────────────────────────────┘  │
│                                                              │
│  ┌──────────────────────────────────────────────────────┐   │
│  │               Prisma ORM                             │   │
│  └───────────────────────┬──────────────────────────────┘   │
└──────────────────────────┼─────────────────────────────────-┘
                           │
              ┌────────────▼────────────┐
              │   PostgreSQL (Neon)     │
              │   users + profiles      │
              └─────────────────────────┘
```

### Repository structure

```
├── .github/workflows/ci.yml     # CI — lint, test, build on PR to main
├── prisma/
│   ├── schema.prisma            # Database models: Profile, User
│   ├── migrations/              # All migration history
│   └── seed.ts                  # Seeds 2026 demographic profiles
├── src/
│   ├── config/app.config.ts     # Express app setup, middleware, routes
│   ├── controllers/
│   │   ├── auth.controller.ts   # OAuth flow, token issuance, refresh, logout
│   │   └── profile.controller.ts
│   ├── middlewares/
│   │   ├── auth.middleware.ts   # authenticate + requireRole
│   │   ├── apiversion.middleware.ts
│   │   └── ratelimit.middleware.ts
│   ├── model/
│   │   ├── auth.model.ts        # User DB operations
│   │   └── profile.model.ts     # Profile DB operations + filters
│   ├── routes/
│   │   ├── auth.route.ts
│   │   ├── profile.route.ts
│   │   └── user.routes.ts
│   ├── services/                # GitHub OAuth API, Genderize, Agify, Nationalize
│   └── utils/
│       ├── jwt.utils.ts         # Access + refresh token generation/verification
│       ├── pkce.utils.ts        # code_verifier, code_challenge, state generation
│       ├── nlp.utils.ts         # Rule-based natural language query parser
│       └── response.utils.ts    # Standardised sendError helper
└── src/index.ts                 # Entry point
```

---

## Prerequisites

- Node.js v18 or newer
- A PostgreSQL database (e.g. [Neon](https://neon.tech))
- A GitHub OAuth App ([create one here](https://github.com/settings/applications/new))

---

## Installation & Setup

1. **Clone the repository:**
   ```bash
   git clone <BACKEND_REPOSITORY_URL>
   cd insighta-backend
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Set up environment variables** — create a `.env` file in the root:
   ```ini
   DATABASE_URL="postgresql://user:password@host/dbname?sslmode=require"
   PORT=3000
   NODE_ENV=development

   # GitHub OAuth App credentials
   GITHUB_CLIENT_ID=your_github_client_id
   GITHUB_CLIENT_SECRET=your_github_client_secret
   GITHUB_REDIRECT_URI=http://localhost:3000/auth/github/callback

   # JWT secrets — use long, random strings in production
   JWT_SECRET=your_long_random_access_token_secret
   JWT_REFRESH_SECRET=your_long_random_refresh_token_secret

   # Comma-separated GitHub user IDs that get the admin role on first login
   ADMIN_GITHUB_IDS=12345678,87654321

   # Web portal origin — required for CORS + redirect after OAuth
   FRONTEND_URL=http://localhost:3001
   ```

4. **Run database migrations:**
   ```bash
   npx prisma migrate deploy
   npx prisma generate
   ```

5. **Seed the database:**
   ```bash
   npx prisma db seed
   ```
   Loads 2026 demographic profiles from `seed_profiles.json`. Safe to re-run — existing records are skipped.

6. **Start the development server:**
   ```bash
   npm run dev
   ```

The API will be available at `http://localhost:3000`.

---

## Authentication Flow

The system implements **GitHub OAuth 2.0 with PKCE** (Proof Key for Code Exchange). There are two separate flows depending on the client.

### Web portal flow

```
Browser                    Backend                    GitHub
   │                          │                          │
   │  GET /auth/github         │                          │
   │─────────────────────────►│                          │
   │                          │  generate state,         │
   │                          │  code_verifier,          │
   │                          │  code_challenge          │
   │                          │  store in pkceStore Map  │
   │                          │                          │
   │  302 → GitHub OAuth URL  │                          │
   │◄─────────────────────────│                          │
   │                          │                          │
   │  User approves on GitHub ─────────────────────────►│
   │                          │                          │
   │  GET /auth/github/callback?code=...&state=...       │
   │─────────────────────────►│                          │
   │                          │  validate state          │
   │                          │  exchange code + verifier│
   │                          │─────────────────────────►│
   │                          │  GitHub access token     │
   │                          │◄─────────────────────────│
   │                          │  fetch user info + email │
   │                          │  upsert user in DB       │
   │                          │  issue access + refresh  │
   │                          │  set HTTP-only cookies   │
   │  302 → /dashboard        │                          │
   │◄─────────────────────────│                          │
```

Tokens are stored as **HTTP-only cookies** — JavaScript in the browser cannot read them. The browser sends them automatically on every subsequent request, including `POST /auth/refresh`.

### CLI flow

```
CLI (local)                Backend                    GitHub
   │                          │                          │
   │  insighta login          │                          │
   │  generate state,         │                          │
   │  code_verifier locally   │                          │
   │  derive code_challenge   │                          │
   │  start local HTTP server │                          │
   │  open browser →          │                          │
   │  GitHub OAuth URL        │                          │
   │                          │  User approves ─────────►│
   │  GET /callback           │                          │
   │  ◄── GitHub redirects    │                          │
   │  capture code + state    │                          │
   │  validate state locally  │                          │
   │                          │                          │
   │  POST /auth/cli/callback │                          │
   │  { code, code_verifier } │                          │
   │─────────────────────────►│                          │
   │                          │  exchange code + verifier│
   │                          │─────────────────────────►│
   │                          │  fetch user info + email │
   │                          │  upsert user in DB       │
   │                          │  issue access + refresh  │
   │  { access_token,         │                          │
   │    refresh_token }       │                          │
   │◄─────────────────────────│                          │
   │  store to                │                          │
   │  ~/.insighta/credentials.json                       │
   │  print: Logged in as @username                      │
```

Tokens are returned as JSON and stored locally at `~/.insighta/credentials.json`. The CLI sends them as `Authorization: Bearer <access_token>` on every API request.

---

## Token Handling

| Token | Expiry | Transport |
|---|---|---|
| Access token | 3 minutes | `Authorization: Bearer` header (CLI/API) or `access_token` HTTP-only cookie (web) |
| Refresh token | 5 minutes | `POST /auth/refresh` body (CLI) or `refresh_token` HTTP-only cookie (web) |

### Token rotation

Every call to `POST /auth/refresh` issues a completely new token pair and immediately invalidates the old refresh token in the database. This prevents replay attacks — if a stolen refresh token is used twice, the second attempt will fail because the DB record no longer matches.

```
Client                     Backend
   │                          │
   │  POST /auth/refresh      │
   │  { refresh_token }       │
   │─────────────────────────►│
   │                          │  verify JWT signature
   │                          │  compare token vs DB stored value
   │                          │  if mismatch → 401 (replay detected)
   │                          │  if match →
   │                          │    generate new access token
   │                          │    generate new refresh token
   │                          │    overwrite DB with new refresh token
   │                          │    (old token now permanently invalid)
   │  { access_token,         │
   │    refresh_token }       │
   │◄─────────────────────────│
```

### Auto-refresh behaviour (CLI)

The CLI automatically detects a 401 response, attempts a silent token refresh using the stored refresh token, retries the original request with the new access token, and only prompts for re-login if the refresh token has also expired.

---

## Role Enforcement

Two roles exist in the system:

| Role | Permissions |
|---|---|
| `admin` | Full access — create profiles, delete profiles, read, search, export |
| `analyst` | Read-only — list, get by ID, search, export |

### How roles are assigned

- Every new user is assigned `analyst` by default.
- A user gets `admin` if their GitHub numeric user ID is listed in the `ADMIN_GITHUB_IDS` environment variable (comma-separated).
- Existing users keep their current role on every subsequent login — an admin is never downgraded.

### How roles are enforced

Every request to `/api/*` passes through two middleware layers:

1. **`authenticate`** — verifies the access token (Bearer header or cookie), checks the user still exists and `is_active = true`. Attaches `{ userId, role }` to `req.user`.
2. **`requireRole(...roles)`** — checks `req.user.role` is in the allowed list. Returns `403 Insufficient permissions` if not.

Role checks are not scattered across controllers — they are declared once on the route definition:

```ts
router.post("/", requireRole("admin"), createUserProfile);
router.delete("/:id", requireRole("admin"), deleteUserProfile);
// GET routes have no requireRole — both roles can read
```

If `is_active` is `false`, every authenticated request returns `403 Forbidden` regardless of role.

---

## API Reference

### Base URL

All endpoints are relative to the deployed backend URL.

### Auth endpoints — `POST /auth/...`

> Rate limit: **10 requests per minute** per IP.

#### `GET /auth/github`
Initiates the web OAuth flow. Redirects to GitHub.

#### `GET /auth/github/callback`
GitHub redirects here after the user approves. Issues tokens as HTTP-only cookies and redirects to the frontend dashboard.

#### `POST /auth/cli/callback`
Used by the CLI after capturing the GitHub callback locally.

**Request:**
```json
{
  "code": "github_auth_code",
  "code_verifier": "the_verifier_cli_generated_locally",
  "redirect_uri": "http://localhost:<port>/callback"
}
```

**Response:**
```json
{
  "status": "success",
  "access_token": "eyJ...",
  "refresh_token": "eyJ..."
}
```

#### `POST /auth/refresh`
Rotates the token pair. Old refresh token is immediately invalidated.

**Request (CLI):** `{ "refresh_token": "eyJ..." }` in body
**Request (web):** sends `refresh_token` cookie automatically

**Response:**
```json
{
  "status": "success",
  "access_token": "eyJ...",
  "refresh_token": "eyJ..."
}
```

#### `POST /auth/logout`
Requires authentication. Invalidates the refresh token server-side and clears cookies.

#### `GET /auth/me`
Requires authentication. Returns the current user's profile.

---

### Profile endpoints — `/api/profiles/...`

> Requires authentication + `X-API-Version: 1` header on every request.
> Rate limit: **60 requests per minute** per user.

Requests missing the version header receive:
```json
{ "status": "error", "message": "API version header required" }
```
Status: `400 Bad Request`

#### `GET /api/profiles`

Returns paginated profiles with optional filters.

**Query parameters:**

| Parameter | Type | Description |
|---|---|---|
| `gender` | `male` \| `female` | Filter by gender |
| `age_group` | `child` \| `teenager` \| `adult` \| `senior` | Filter by age group |
| `country_id` | string | ISO country code e.g. `NG` |
| `min_age` | number | Minimum age (inclusive) |
| `max_age` | number | Maximum age (inclusive) |
| `min_gender_probability` | number | 0–1 confidence floor |
| `min_country_probability` | number | 0–1 confidence floor |
| `sort_by` | `age` \| `created_at` \| `gender_probability` | Sort field |
| `order` | `asc` \| `desc` | Sort direction |
| `page` | number | Page number (default: 1) |
| `limit` | number | Results per page (default: 10, max: 50) |

**Response:**
```json
{
  "status": "success",
  "page": 1,
  "limit": 10,
  "total": 2026,
  "total_pages": 203,
  "data": [ ... ]
}
```

#### `GET /api/profiles/:id`
Returns a single profile by ID.

#### `POST /api/profiles` — admin only
Creates a new profile. Fetches gender, age, and nationality data from external APIs (Genderize, Agify, Nationalize) using the provided name.

**Request:**
```json
{ "name": "Harriet Tubman" }
```

#### `DELETE /api/profiles/:id` — admin only
Deletes a profile.

#### `GET /api/profiles/search?q=...`
Natural language search. See NLP section below.

**Example:**
```
GET /api/profiles/search?q=young+males+from+nigeria
```

#### `GET /api/profiles/export?format=csv`
Exports profiles as a CSV file. Accepts the same filter parameters as `GET /api/profiles`. Returns the file as a download with `Content-Disposition: attachment`.

---

### User endpoint

#### `GET /api/users/me`
Requires authentication. Returns the current user's profile. Used by the CLI `insighta whoami` command and the web portal account page.

---

## Natural Language Query Parsing

The `/api/profiles/search` endpoint accepts plain English queries and translates them into structured database filters using a **rule-based NLP parser** (`src/utils/nlp.utils.ts`). There are no external AI dependencies — parsing is deterministic, fast, and free.

### How it works

The parser applies a series of regex patterns against the lowercased query string. Each pattern extracts one filter dimension independently, so multiple filters can be combined in a single query.

**Gender detection**
```
"males"  → gender: male
"women"  → gender: female
"male and female" → no gender filter (both)
```

**Age group keywords**
```
"young"      → min_age: 16, max_age: 24
"children"   → age_group: child
"teenagers"  → age_group: teenager
"adults"     → age_group: adult
"elderly"    → age_group: senior
```

**Age range expressions**
```
"above 30"           → min_age: 30
"under 25"           → max_age: 25
"between 20 and 40"  → min_age: 20, max_age: 40
"older than 50"      → min_age: 50
```

**Country matching**
Country names are matched against a lookup table of 50+ countries mapped to ISO codes. Multi-word names (e.g. "south africa", "dr congo") are tried first (longest match wins) to prevent partial matches.
```
"nigeria"      → country_id: NG
"south africa" → country_id: ZA
"uk"           → country_id: GB
```

**Example queries:**
```
"young males from nigeria"           → gender: male, min_age: 16, max_age: 24, country_id: NG
"adult women in south africa"        → gender: female, age_group: adult, country_id: ZA
"men between 25 and 35"             → gender: male, min_age: 25, max_age: 35
"elderly people"                     → age_group: senior
```

If no recognisable pattern is found, the parser returns `null` and the endpoint responds with `400 Bad Request`.

---

## Error Responses

All errors follow a consistent structure:

```json
{
  "status": "error",
  "message": "Human-readable description"
}
```

| Status | Meaning |
|---|---|
| 400 | Bad request — missing or invalid parameters |
| 401 | Authentication required or token expired |
| 403 | Account deactivated or insufficient role permissions |
| 404 | Resource not found |
| 422 | Invalid query parameter value |
| 429 | Rate limit exceeded |
| 500 | Internal server error |
| 502 | Upstream API failure (GitHub or demographic services) |

---

## Rate Limiting & Logging

### Rate limits

| Scope | Limit | Tracking |
|---|---|---|
| `/auth/*` | 10 requests / minute | Per IP address |
| All other endpoints | 60 requests / minute | Per authenticated user ID (falls back to IP) |

Tracking by user ID (not IP) on API endpoints ensures users on shared networks (e.g. offices) each get their own independent quota.

### Logging

Every request is logged via `morgan` with method, path, status code, and response time. `combined` format is used in production (includes IP, user agent), `dev` format in development.

---

## CI/CD

GitHub Actions runs automatically on every pull request targeting `main`:

1. **Lint** — ESLint checks TypeScript code quality
2. **Tests** — Jest test suite
3. **Build** — TypeScript compilation check

Merging to `main` without a passing CI run is not permitted.

---

## Deployment

- The backend is deployed on **Vercel** (serverless). `src/index.ts` detects the `VERCEL` environment variable and skips starting the local HTTP server.
- The web portal is deployed at: `https://insighta-labs-frontend-oqix.vercel.app`
- Backend live URL: `https://insightalabs-production.up.railway.app/`

All environment variables are configured in the deployment platform's settings — no secrets are committed to the repository.

---

## Development Scripts

```bash
npm run dev        # Start development server with hot reload
npm run build      # Compile TypeScript to dist/
npm run start      # Run compiled output
npm run lint       # Run ESLint
npm run lint:fix   # Auto-fix lint issues
npm test           # Run Jest test suite
```

---

## Engineering Standards

- Conventional commits with scope: `feat(auth): add github oauth`, `fix(cli): handle token refresh`
- Branch naming: `feat/`, `fix/`, `chore/`, `refactor/` prefixes
- All changes merged to `main` via pull request — no direct pushes
- CI must pass before merge