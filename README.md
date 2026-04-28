# Insighta Labs — Demographic Intelligence API

![Version](https://img.shields.io/badge/version-2.0.0-blue.svg)
![TypeScript](https://img.shields.io/badge/TypeScript-Ready-blue)
![Prisma](https://img.shields.io/badge/Prisma-Active-darkblue)
![Express.js](https://img.shields.io/badge/Express.js-Framework-lightgrey)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-Neon-green)

## What the project does

Insighta Labs Demographic Intelligence API is a queryable backend engine built for marketing teams, product teams, and growth analysts who need to slice and query demographic data fast.

The system stores 2026 demographic profiles and exposes endpoints that support advanced filtering, sorting, pagination, and natural language search — allowing clients to express queries in plain English and get structured results back instantly.

---

## Why the project is useful

- **Advanced Filtering** — filter profiles by gender, age group, country, age range, and confidence scores, all combinable in a single request
- **Sorting & Pagination** — sort by age, creation date, or gender probability; paginate through large result sets efficiently
- **Natural Language Search** — query the dataset in plain English e.g. `young males from nigeria` without writing structured filters manually
- **Rule-based NLP** — fast, predictable, zero-cost parsing with no dependency on external AI services
- **Performance** — uses indexed queries and `Promise.all` for parallel count + data fetching to avoid unnecessary full-table scans
- **Clean Error Handling** — all errors follow a consistent structure with appropriate HTTP status codes

---

## How users can get started

### Prerequisites

- [Node.js](https://nodejs.org/en/) v18 or newer
- A PostgreSQL database (e.g. [Neon](https://neon.tech))

### Installation & Setup

1. **Clone the repository:**
   ```bash
   git clone <YOUR_REPOSITORY_URL>
   cd stage1
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Set up environment variables:**
   Create a `.env` file in the root directory:
   ```ini
   DATABASE_URL="postgresql://user:password@host/dbname?sslmode=require"
   PORT=3000
   GITHUB_CLIENT_ID=your_github_client_id
   GITHUB_CLIENT_SECRET=your_github_client_secret
   GITHUB_REDIRECT_URI=http://localhost:3000/api/auth/github/callback
   JWT_SECRET=your_secret_key_here
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
   This loads all 2026 profiles from `seed_profiles.json`. Re-running is safe — existing records are skipped automatically.

6. **Start the development server:**
   ```bash
   npm run dev
   ```

The API will be available at `http://localhost:3000`.

---

## Authentication & Authorization

### Overview

The API uses **GitHub OAuth 2.0 with PKCE** for web clients and **JWT tokens** for API authentication. All profile endpoints require a valid access token and the `api-version` header.

### GitHub OAuth Flow (Web Clients)

1. **Initiate Authentication**
   ```bash
   GET /api/auth/github
   ```
   Redirects to GitHub's authorization page with PKCE code challenge.

2. **Handle Callback**
   ```bash
   GET /api/auth/github/callback?code=<auth_code>&state=<state>
   ```
   GitHub redirects here after user approves. The server:
   - Validates the PKCE code
   - Exchanges code for GitHub access token
   - Fetches user profile and email from GitHub
   - Creates/updates user in database
   - Returns `access_token` and `refresh_token` in JSON response

3. **Response**
   ```json
   {
     "status": "success",
     "access_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
     "refresh_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
   }
   ```

### CLI Usage

CLI applications should use the **direct token exchange** endpoint instead of browser redirect:

1. **Generate Code Verifier Locally**
   ```bash
   # CLI generates a random 128-character string
   code_verifier = "random_128_char_string_here"
   ```

2. **Generate Code Challenge**
   ```bash
   # Compute SHA256(code_verifier) and base64url encode
   code_challenge = base64url(sha256(code_verifier))
   ```

3. **Redirect User to GitHub**
   ```bash
   https://github.com/login/oauth/authorize?client_id=YOUR_CLIENT_ID&code_challenge=<code_challenge>&code_challenge_method=S256&redirect_uri=http://localhost:3000/cli
   ```

4. **Exchange Code for Token**
   ```bash
   POST /api/auth/cli/callback
   Content-Type: application/json

   {
     "code": "<auth_code_from_github>",
     "code_verifier": "<original_code_verifier>"
   }
   ```

5. **Receive Tokens**
   ```json
   {
     "status": "success",
     "access_token": "...",
     "refresh_token": "..."
   }
   ```

### Token Handling

**Access Token:**
- **Format:** JWT signed with `JWT_SECRET`
- **Payload:** `{ userId, role }`
- **Lifetime:** 1 hour (configurable)
- **Usage:** Include in `Authorization: Bearer <token>` header on all authenticated requests
- **Validation:** JWT signature is verified, and `is_active` status is checked on every request

**Refresh Token:**
- **Format:** JWT signed with `JWT_SECRET`
- **Payload:** `{ userId }`
- **Lifetime:** 30 days (configurable)
- **Storage:** Stored in database per user
- **Usage:** Call `POST /api/auth/refresh` to get new access token without re-authenticating
- **Validation:** `is_active` status is checked before issuing a new access token

**Refresh Token Endpoint:**
```bash
POST /api/auth/refresh
Content-Type: application/json

{
  "refresh_token": "<refresh_token>"
}
```

Response:
```json
{
  "status": "success",
  "access_token": "new_jwt_token_here"
}
```

### Role Enforcement Logic

Roles are assigned when a user is created in the system:
- **Default Role:** `user` — can read profiles, perform searches, export data
- **Admin Role:** `admin` — can do everything + create new profiles

**Admin-Only Endpoints:**
- `POST /api/profiles` — Create a new profile

The `requireRole("admin")` middleware:
1. Extracts token from `Authorization: Bearer <token>` header
2. Verifies JWT signature using `JWT_SECRET`
3. Checks the `role` claim in the token
4. Returns 403 Forbidden if user is not an admin

**Example: Admin-only Create Profile**
```bash
POST /api/profiles
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
api-version: 1
Content-Type: application/json

{
  "name": "John"
}
```

### Logout

Invalidates the user's refresh token on the server:
```bash
POST /api/auth/logout
Authorization: Bearer <access_token>
api-version: 1
```

Response:
```json
{
  "status": "success",
  "message": "Logged out successfully"
}
```

### Middleware Stack

Every request goes through:

1. **Authentication Middleware** — Validates access token and checks if user is still active (`is_active=true`). If a user is deactivated, returns 403 Forbidden.
2. **Rate Limiter** — Enforces rate limits per user/IP (separate for auth vs API routes)
3. **API Version Middleware** — Requires `api-version` header on all profile routes
4. **Role Middleware** (optional) — Checks role for admin-only endpoints

---

## Endpoints

### Authentication Endpoints

#### GET /api/auth/github

Initiates GitHub OAuth 2.0 flow. Redirects to GitHub's authorization page.

**Example:**
```bash
curl -X GET "http://localhost:3000/api/auth/github"
```

**Response:** HTTP 302 redirect to `github.com/login/oauth/authorize`

---

#### GET /api/auth/github/callback

GitHub's OAuth callback endpoint. Handles the authorization code exchange.

**Query Parameters:**
- `code` — Authorization code from GitHub
- `state` — State parameter for PKCE validation

**Example:**
```bash
GET http://localhost:3000/api/auth/github/callback?code=abc123&state=xyz789
```

**Response:**
```json
{
  "status": "success",
  "access_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "refresh_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

---

#### POST /api/auth/cli/callback

Token exchange endpoint for CLI clients using PKCE.

**Request Body:**
```json
{
  "code": "authorization_code_from_github",
  "code_verifier": "original_code_verifier_string"
}
```

**Example:**
```bash
curl -X POST "http://localhost:3000/api/auth/cli/callback" \
  -H "Content-Type: application/json" \
  -H "api-version: 1" \
  -d '{"code":"abc123","code_verifier":"xyz789"}'
```

**Response:**
```json
{
  "status": "success",
  "access_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "refresh_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

---

#### POST /api/auth/refresh

Refreshes an expired access token using a valid refresh token.

**Request Body:**
```json
{
  "refresh_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

**Example:**
```bash
curl -X POST "http://localhost:3000/api/auth/refresh" \
  -H "Content-Type: application/json" \
  -H "api-version: 1" \
  -d '{"refresh_token":"your_refresh_token"}'
```

**Response:**
```json
{
  "status": "success",
  "access_token": "new_jwt_token_here"
}
```

---

#### POST /api/auth/logout

Logs out the user by invalidating their refresh token.

**Headers:**
- `Authorization: Bearer <access_token>` (required)
- `api-version: 1` (required)

**Example:**
```bash
curl -X POST "http://localhost:3000/api/auth/logout" \
  -H "Authorization: Bearer your_access_token" \
  -H "api-version: 1"
```

**Response:**
```json
{
  "status": "success",
  "message": "Logged out successfully"
}
```

---

### Profile Endpoints

#### GET /api/profiles

Returns all profiles with support for filtering, sorting, and pagination.

**Required Headers:**
- `Authorization: Bearer <access_token>`
- `api-version: 1`

**Supported query parameters:**

| Parameter | Type | Description |
|---|---|---|
| `gender` | string | `male` or `female` |
| `age_group` | string | `child`, `teenager`, `adult`, `senior` |
| `country_id` | string | ISO 2-letter code e.g. `NG`, `KE`, `GH` |
| `min_age` | number | Minimum age (inclusive) |
| `max_age` | number | Maximum age (inclusive) |
| `min_gender_probability` | number | Minimum gender confidence score |
| `min_country_probability` | number | Minimum country confidence score |
| `sort_by` | string | `age`, `created_at`, `gender_probability` |
| `order` | string | `asc` or `desc` |
| `page` | number | Page number (default: 1) |
| `limit` | number | Results per page (default: 10, max: 50) |

**Example:**
```bash
curl -X GET "http://localhost:3000/api/profiles?gender=male&country_id=NG&min_age=25&sort_by=age&order=desc&page=1&limit=10" \
  -H "Authorization: Bearer your_access_token" \
  -H "api-version: 1"
```

**Response:**
```json
{
  "status": "success",
  "page": 1,
  "limit": 10,
  "total": 120,
  "data": [
    {
      "id": "b3f9c1e2-7d4a-4c91-9c2a-1f0a8e5b6d12",
      "name": "emmanuel",
      "gender": "male",
      "gender_probability": 0.99,
      "age": 34,
      "age_group": "adult",
      "country_id": "NG",
      "country_name": "Nigeria",
      "country_probability": 0.85,
      "created_at": "2026-04-01T12:00:00.000Z"
    }
  ]
}
```

---

#### GET /api/profiles/search

Converts a plain English query into structured filters and returns matching profiles.

**Required Headers:**
- `Authorization: Bearer <access_token>`
- `api-version: 1`

**Query parameters:**

| Parameter | Type | Description |
|---|---|---|
| `q` | string | Natural language query (required) |
| `page` | number | Page number (default: 1) |
| `limit` | number | Results per page (default: 10, max: 50) |

**Example:**
```bash
curl -X GET "http://localhost:3000/api/profiles/search?q=young males from nigeria&page=1&limit=10" \
  -H "Authorization: Bearer your_access_token" \
  -H "api-version: 1"
```

**Response:**
```json
{
  "status": "success",
  "page": 1,
  "limit": 10,
  "total": 45,
  "data": [ ... ]
}
```

**Uninterpretable query:**
```json
{
  "status": "error",
  "message": "Unable to interpret query"
}
```

---

#### GET /api/profiles/:id

Fetches a single profile by its unique ID.

**Required Headers:**
- `Authorization: Bearer <access_token>`
- `api-version: 1`

**URL Parameters:**
- `id` — Profile ID (UUIDv7)

**Example:**
```bash
curl -X GET "http://localhost:3000/api/profiles/b3f9c1e2-7d4a-4c91-9c2a-1f0a8e5b6d12" \
  -H "Authorization: Bearer your_access_token" \
  -H "api-version: 1"
```

**Response:**
```json
{
  "status": "success",
  "data": {
    "id": "b3f9c1e2-7d4a-4c91-9c2a-1f0a8e5b6d12",
    "name": "emmanuel",
    "gender": "male",
    "gender_probability": 0.99,
    "age": 34,
    "age_group": "adult",
    "country_id": "NG",
    "country_name": "Nigeria",
    "country_probability": 0.85,
    "created_at": "2026-04-01T12:00:00.000Z"
  }
}
```

**Error (Not Found):**
```json
{
  "status": "error",
  "message": "Profile not found"
}
```

---

#### POST /api/profiles

Creates a new profile by querying external demographic APIs. **Admin only.**

**Required Headers:**
- `Authorization: Bearer <admin_access_token>`
- `api-version: 1`
- `Content-Type: application/json`

**Request Body:**
```json
{
  "name": "John"
}
```

**Validation Rules:**
- `name` field is required
- Must be a non-empty string
- Cannot be purely numeric
- Profile is not created if name already exists in database (returns 200 with existing profile)

**Example:**
```bash
curl -X POST "http://localhost:3000/api/profiles" \
  -H "Authorization: Bearer your_admin_access_token" \
  -H "api-version: 1" \
  -H "Content-Type: application/json" \
  -d '{"name":"John"}'
```

**Response (New Profile Created):**
```json
{
  "status": "success",
  "data": {
    "id": "new-uuidv7-here",
    "name": "John",
    "gender": "male",
    "gender_probability": 0.95,
    "age": 28,
    "age_group": "adult",
    "country_id": "US",
    "country_name": "United States",
    "country_probability": 0.87,
    "created_at": "2026-04-27T12:00:00.000Z"
  }
}
```

**Response (Profile Already Exists):**
```json
{
  "status": "success",
  "message": "Profile already exists",
  "data": { ... }
}
```

**Error (Missing Name):**
```json
{
  "status": "error",
  "message": "Missing name"
}
```

---

#### GET /api/profiles/export

Exports profiles as CSV with optional filtering and sorting.

**Required Headers:**
- `Authorization: Bearer <access_token>`
- `api-version: 1`

**Query Parameters:**
- `format` — `csv` (required)
- `gender` — Optional: `male` or `female`
- `age_group` — Optional: `child`, `teenager`, `adult`, `senior`
- `country_id` — Optional: ISO 2-letter code
- `min_age` — Optional: minimum age
- `max_age` — Optional: maximum age
- `min_gender_probability` — Optional: minimum confidence score
- `min_country_probability` — Optional: minimum confidence score
- `sort_by` — Optional: `age`, `created_at`, `gender_probability`
- `order` — Optional: `asc` or `desc`
- `limit` — Optional: max records to export (default: all)

**Example:**
```bash
curl -X GET "http://localhost:3000/api/profiles/export?format=csv&gender=female&age_group=adult&limit=100" \
  -H "Authorization: Bearer your_access_token" \
  -H "api-version: 1" \
  -o profiles.csv
```

**Response (CSV Format):**
```csv
id,name,gender,gender_probability,age,age_group,country_id,country_name,country_probability,created_at
b3f9c1e2-7d4a-4c91-9c2a-1f0a8e5b6d12,emma,female,0.98,26,adult,NG,Nigeria,0.82,2026-04-01T12:00:00.000Z
...
```

**Headers:**
- `Content-Type: text/csv`
- `Content-Disposition: attachment; filename=profiles.csv`

**Error (Invalid Format):**
```json
{
  "status": "error",
  "message": "format=csv is required"
}
```

---

## Natural Language Parsing Approach

The parser is **fully rule-based** — no AI or LLMs are used at any point. It works by lowercasing the query string and scanning for known keywords using regular expressions, in six sequential steps:

**Step 1 — Clean input**  
Lowercases and trims the query so `"Nigeria"`, `"NIGERIA"`, and `"nigeria"` all behave identically.

**Step 2 — Detect gender**  
Scans for gender keywords and sets `gender` filter. If both genders are mentioned (`male and female`, `both`), no gender filter is applied.

**Step 3 — Detect age group or "young"**  
Scans for age group keywords. `"young"` is a special case — it maps to a numeric age range (`min_age=16, max_age=24`), not a stored age group.

**Step 4 — Detect age range**  
Scans for numeric age patterns like `"above 30"`, `"under 25"`, `"between 20 and 40"` and extracts the numbers into `min_age` / `max_age`.

**Step 5 — Detect country**  
Checks the query against a hardcoded map of 65 country names → ISO codes. Longer country names are checked first to prevent partial matches (e.g. `"south africa"` is matched before `"africa"`).

**Step 6 — Return**  
If any filter was matched, returns the filters object. If nothing was matched at all, returns `null` → controller responds with `"Unable to interpret query"`.

### Supported Keywords

**Gender**

| Keyword | Maps to |
|---|---|
| male, males, man, men | `gender=male` |
| female, females, woman, women | `gender=female` |
| male and female, both | no gender filter |

**Age Groups**

| Keyword | Maps to |
|---|---|
| young | `min_age=16, max_age=24` |
| child, children, kid, kids | `age_group=child` |
| teenager, teenagers, teen, teens | `age_group=teenager` |
| adult, adults | `age_group=adult` |
| senior, seniors, elderly, old | `age_group=senior` |

**Age Range**

| Pattern | Maps to |
|---|---|
| above N, over N, older than N | `min_age=N` |
| below N, under N, younger than N | `max_age=N` |
| between N and M | `min_age=N, max_age=M` |

**Countries**  
All 65 countries present in the dataset are supported by full name.  
Examples: `nigeria → NG`, `kenya → KE`, `south africa → ZA`, `ghana → GH`, `ethiopia → ET`

### Example Mappings

| Query | Parsed Filters |
|---|---|
| `young males` | gender=male, min_age=16, max_age=24 |
| `females above 30` | gender=female, min_age=30 |
| `people from angola` | country_id=AO |
| `adult males from kenya` | gender=male, age_group=adult, country_id=KE |
| `male and female teenagers above 17` | age_group=teenager, min_age=17 |
| `seniors in nigeria` | age_group=senior, country_id=NG |
| `women under 25 from ghana` | gender=female, max_age=25, country_id=GH |

---

## Limitations

- **No typo tolerance** — `"nigera"` will not match `"nigeria"`
- **No synonyms beyond defined keywords** — `"guys"`, `"boys"`, `"gents"` are not mapped to male
- **Single country only** — `"males from nigeria or ghana"` only matches the first country found; multiple countries in one query are not supported
- **No negation** — `"males not from nigeria"` is not supported and will be misinterpreted
- **No name-based queries** — `"people named john"` is not supported
- **No profession or attribute queries** — `"developers"`, `"students"` are not parsed
- **"young" is not a stored age group** — it is a parser shortcut for ages 16–24 only and does not map to the `age_group` column
- **No fuzzy matching** — exact keyword matches only; partial or misspelled words are ignored
- **No complex boolean logic** — `"adults and seniors"` or `"male or female above 30"` are not handled correctly

---

## Error Responses

All errors follow this structure:

```json
{ "status": "error", "message": "<error message>" }
```

### HTTP Status Codes

| Status Code | Meaning |
|---|---|
| 400 | Missing or empty parameter, invalid request |
| 401 | Missing or invalid authentication token |
| 403 | Forbidden — insufficient permissions (e.g. non-admin trying to create profile), missing API version header |
| 404 | Profile not found |
| 422 | Invalid parameter type or value |
| 429 | Rate limit exceeded (too many requests) |
| 500 | Internal server error |
| 502 | Bad gateway (external API failure, e.g., GitHub API down) |

### Common Error Examples

**Missing Authentication Token:**
```json
{
  "status": "error",
  "message": "No token provided"
}
```

**Invalid Token:**
```json
{
  "status": "error",
  "message": "Invalid token"
}
```

**Missing API Version Header:**
```json
{
  "status": "error",
  "message": "api-version header is required"
}
```

**Insufficient Permissions:**
```json
{
  "status": "error",
  "message": "Insufficient permissions"
}
```

**Account Deactivated:**
```json
{
  "status": "error",
  "message": "User account is deactivated"
}
```

**Rate Limit Exceeded:**
```json
{
  "status": "error",
  "message": "Too many requests"
}
```

---

## Testing

A comprehensive Postman collection is included for testing all endpoints: `HNG-Backend-Tests.postman_collection.json`

### Import the Collection

1. Open Postman
2. Click **File** → **Import**
3. Select `HNG-Backend-Tests.postman_collection.json`
4. Create or select an environment with these variables:
   - `base_url`: `http://localhost:3000`
   - `access_token`: Your JWT access token
   - `refresh_token`: Your JWT refresh token
   - `profile_id`: A valid profile ID from the database

### Test Scenarios Included

- ✅ **Authentication Flow** — GitHub OAuth, token refresh, logout
- ✅ **Profile Retrieval** — Get all, filter, sort, paginate
- ✅ **Profile Search** — Natural language queries
- ✅ **Profile Creation** — Admin-only create endpoint
- ✅ **Profile Export** — CSV export with filters
- ✅ **Error Handling** — Missing auth, invalid tokens, rate limits
- ✅ **Input Validation** — Invalid types, missing fields, invalid parameters

### Run Tests

1. Select the collection in Postman
2. Click **▶ Run** (or Run Collection)
3. All tests include assertions that validate response structure and status codes

---

## Where users can get help

- **Bug Reports & Feature Requests** — open a ticket in the [Issues](../../issues) tab
- **Express.js Docs** — [expressjs.com](https://expressjs.com/)
- **Prisma Docs** — [prisma.io/docs](https://www.prisma.io/docs/)
- **TypeScript Docs** — [typescriptlang.org/docs](https://www.typescriptlang.org/docs/)
- **Neon (PostgreSQL)** — [neon.tech](https://neon.tech)

---

## Who maintains and contributes

This project is maintained as part of the Insighta Labs backend engineering track.

Contributions are welcome. To contribute:

1. Fork the repository
2. Create a new branch: `git checkout -b feature/your-feature`
3. Make your changes and commit: `git commit -m "add: your feature"`
4. Push and open a Pull Request

Please ensure your code compiles with `npm run build` before submitting a PR.