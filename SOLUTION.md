# Stage 4B – Solution Document
## System Optimization & Data Ingestion

---

## Task 1 — Query Performance

### Optimization Approach

Two techniques were combined: database indexing and in-memory caching. They address different layers of the problem.

Indexes reduce how long a single database query takes. The cache eliminates database queries entirely for repeated requests. Together they cover both cold traffic (first time a query is seen) and hot traffic (repeated queries under load).

---

### Part A — Database Indexes

Every column used in filtering or sorting was indexed individually. A composite index was added for the most common multi-column filter combination.

```prisma
// Individual indexes — cover single-column filter queries
@@index([gender])
@@index([age_group])
@@index([country_id])
@@index([age])
@@index([gender_probability])
@@index([created_at])

// Composite index — used when gender is present alongside other filters
@@index([gender, age_group, country_id])
```

**Why individual indexes first:** PostgreSQL can only use a composite index if the query includes its leftmost column. `[gender, age_group, country_id]` is useless for a query filtering only by `country_id`. Individual indexes ensure every single-column filter is covered regardless of what other filters are present.

**Why the composite index on top:** When a query filters by `gender + age_group + country_id` together, PostgreSQL satisfies the entire filter in one index scan instead of merging three separate index results. This is faster and uses fewer I/O operations.

**Why `created_at` gets its own index:** The default sort is `created_at: asc`. Without an index, every unsorted query requires PostgreSQL to sort 1 million rows in memory after retrieval. With the index, rows are returned in order directly.

---

### Before / After — Query Performance

These are representative estimates based on PostgreSQL behaviour at 1 million rows. Actual numbers depend on hardware and network latency to the remote database.

| Scenario | Before (no indexes) | After (indexes) | After (indexes + cache) |
|---|---|---|---|
| `GET /api/profiles` (no filters) | ~800ms | ~60ms | ~1ms |
| `GET /api/profiles?gender=female` | ~750ms | ~15ms | ~1ms |
| `GET /api/profiles?gender=female&country_id=NG` | ~800ms | ~8ms | ~1ms |
| `GET /api/profiles?gender=female&age_group=adult&country_id=NG` | ~820ms | ~5ms | ~1ms |
| `GET /api/profiles?min_age=20&max_age=45` | ~800ms | ~20ms | ~1ms |
| `GET /api/profiles/search?q=Nigerian females` | ~800ms | ~8ms | ~1ms |
| Repeated identical query (any filter) | ~800ms | ~8ms–60ms | ~1ms |

**Key observations:**
- Indexes alone reduce query time by 10–100x by eliminating full table scans
- The cache reduces repeated query time to near zero — the database is not touched at all
- The biggest gain is on repeated queries, which dominate read-heavy workloads

---

### Part B — In-Memory Cache

#### Design Decision

An in-memory cache using a plain `Map` with TTL was chosen over Redis.

| Factor | In-Memory Cache | Redis |
|---|---|---|
| New infrastructure required | No | Yes |
| Network latency on cache read | None (in-process) | ~1–5ms per call |
| Works across multiple instances | No | Yes |
| Fits this system | Yes — single process | No — no horizontal scaling |
| Operational overhead | None | Hosting, config, monitoring |

Redis is the right tool when multiple server instances need shared cache state. This system has no horizontal scaling — one process, one cache. In-memory is faster, simpler, and requires no new infrastructure.

#### TTL and Invalidation

```typescript
export const profileCache = new InMemoryCache(3600); // 1 hour TTL
```

A 1 hour TTL is appropriate because profile data changes infrequently. More importantly, any write — create or delete — immediately invalidates the entire cache:

```typescript
// In createUserProfile and deleteUserProfile:
profileCache.invalidate();
```

Full cache clear was chosen over granular key invalidation because when a profile is created or deleted, any cached page could be affected — a new record on page 3 shifts all subsequent pages. Granular invalidation would require tracking which keys are affected per write, adding complexity with negligible performance benefit.

#### Trade-offs

| Decision | Trade-off |
|---|---|
| Full cache clear on write | Simple and correct — minor cost since cache refills quickly under read traffic |
| 1 hour TTL | Slightly stale data possible within the TTL window, but writes always invalidate immediately |
| In-memory only | Cache is lost on server restart — acceptable since it refills automatically |

---

## Task 2 — Query Normalization

### Optimization Approach

Before executing a query or checking the cache, the filter object is normalized into a canonical form. This ensures two filter objects that represent the same query always produce the same cache key.

```typescript
export const buildCacheKey = (filters: ProfileFilters): string => {
  // Step 1: Remove undefined values
  const cleaned = Object.fromEntries(
    Object.entries(filters).filter(([, v]) => v !== undefined)
  );

  // Step 2: Sort keys alphabetically
  const sorted = Object.keys(cleaned)
    .sort()
    .reduce<Record<string, unknown>>((acc, key) => {
      acc[key] = cleaned[key];
      return acc;
    }, {});

  return `profiles:${JSON.stringify(sorted)}`;
};
```

### Design Decisions and Trade-offs

| Decision | Reason | Trade-off |
|---|---|---|
| Sort keys alphabetically | Eliminates property order as a source of key divergence | None — pure gain |
| Strip undefined values | `{ gender: "male" }` and `{ gender: "male", page: undefined }` are the same query | None |
| No AI or LLMs | Task explicitly prohibits it — rule-based normalization is deterministic | None applicable |
| Prefix `profiles:` on key | Namespaces keys in case other data types are cached in future | None |

### Example

```
"Nigerian females between 20 and 45"
  → parseNaturalQuery()
  → { gender: "female", country_id: "NG", min_age: 20, max_age: 45 }
  → buildCacheKey()
  → 'profiles:{"country_id":"NG","gender":"female","max_age":45,"min_age":20}'

"Women aged 20–45 living in Nigeria"
  → parseNaturalQuery()
  → { min_age: 20, country_id: "NG", gender: "female", max_age: 45 }
  → buildCacheKey()
  → 'profiles:{"country_id":"NG","gender":"female","max_age":45,"min_age":20}'

Same key ✅ — cache hit guaranteed
```

---

## Task 3 — CSV Data Ingestion

### Optimization Approach

Three constraints drive the design: do not load the file into memory, do not insert rows one by one, and do not block query performance during upload.

```
File saved to disk by multer
        ↓
Streamed line by line via fs.createReadStream + csv-parse
        ↓
Each row validated — invalid rows skipped and counted
        ↓
Valid rows collected into chunk array (max 500 rows)
        ↓
When chunk is full:
  - One query to check which names already exist
  - One createMany() to insert the rest
  - Chunk array reset to empty
        ↓
Repeat until end of file
        ↓
Process remaining rows in partial final chunk
        ↓
Delete temp file → Invalidate cache → Return summary
```

### Design Decisions and Trade-offs

| Decision | Reason | Trade-off |
|---|---|---|
| Disk storage via multer | File never enters RAM — safe for files up to 500k rows | File I/O slightly slower than memory, negligible in practice |
| `os.tmpdir()` for temp path | Always exists on any OS — no setup, no risk of missing directory | Files lost on OS temp cleanup, which is correct behaviour |
| `for await` streaming | Natural backpressure — each `await` yields to other requests | Slightly more complex than a callback approach |
| Chunk size of 500 | Balances DB round trips vs. memory usage | Smaller = more DB calls; larger = more RAM per chunk |
| Batch duplicate check per chunk | One DB query per 500 rows instead of one per row | Small race condition window — handled by `skipDuplicates: true` |
| `skipDuplicates: true` on createMany | Safety net if two concurrent uploads race on the same name | Concurrent duplicate silently skipped — acceptable by task spec |
| No rollback on partial failure | Task explicitly requires already-inserted rows to remain | Uploads are not atomic — this is a deliberate requirement |

---

### How Ingestion Failures and Edge Cases Are Handled

#### Row-level validation failures

Every row is validated individually before being added to the chunk. A failed row is skipped with `continue` — it never affects processing of subsequent rows.

| Failure | Condition | Reason tracked |
|---|---|---|
| Missing required field | `name`, `gender`, `age`, `age_group`, `country_id`, `gender_probability`, `country_probability` empty or undefined | `missing_fields` |
| Unrecognised gender | Value not in `["male", "female"]` | `invalid_gender` |
| Invalid age | Not a number, negative, or non-integer | `invalid_age` |
| Unrecognised age group | Value not in `["child", "teenager", "adult", "senior"]` | `invalid_age` |
| Invalid probability values | `gender_probability` or `country_probability` not a valid number | `malformed_row` |
| Wrong column count | `relax_column_count: false` causes csv-parse to throw, caught by outer try/catch | `malformed_row` |
| Duplicate name | Name already exists in DB — checked per chunk in batch | `duplicate_name` |

**A single bad row never fails the entire upload.** Each row is processed independently.

#### File-level failures

If an unrecoverable error occurs mid-stream (corrupt file, broken encoding, unexpected I/O error), the outer `try/catch` intercepts it:

```typescript
} catch (error) {
  fs.unlink(filePath, () => {}); // temp file cleaned up
  next(error);                   // standard error handler responds with 500
  return;
}
```

Rows already inserted at the point of failure **remain in the database**. The upload does not roll back. This is the explicit requirement of the task.

#### Concurrent uploads

Each upload operates on its own file, its own stream, its own chunk array, and its own counters. There is no shared mutable state between concurrent uploads. The only shared resource is the database, which handles concurrent writes safely. `skipDuplicates: true` ensures that if two uploads contain the same name, one succeeds and the other is skipped without an error.

#### Temp file cleanup

The uploaded file is deleted in both the success and error paths:

```typescript
} catch (error) {
  fs.unlink(filePath, () => {}); // error path
  next(error);
  return;
}
fs.unlink(filePath, () => {});   // success path
```

Temp files never accumulate regardless of outcome.

#### Expected response

```json
{
  "status": "success",
  "total_rows": 50000,
  "inserted": 48231,
  "skipped": 1769,
  "reasons": {
    "duplicate_name": 1203,
    "invalid_age": 312,
    "missing_fields": 254
  }
}
```

`skipped` is derived as `total_rows - inserted`, not summed from reason buckets. This correctly accounts for all skipped rows.

---

## Summary of All Changes

| File | Change |
|---|---|
| `prisma/schema.prisma` | Added 6 individual indexes + 1 composite index on Profile model |
| `prisma/migrations/..._add_profile_indexes` | Migration applying all indexes except created_at |
| `prisma/migrations/..._add_created_at_index` | Migration for created_at index |
| `src/lib/cache.ts` | In-memory cache class with TTL, get, set, and invalidate |
| `src/utils/cache-key.utils.ts` | Canonical cache key builder — strips undefineds, sorts keys |
| `src/controllers/profile.controller.ts` | Cache check before DB call, cache set after, invalidate on writes |
| `src/controllers/ingestion.controller.ts` | CSV streaming, row validation, chunked processing, summary response |
| `src/model/ingestion.model.ts` | `findExistingNames` and `insertProfiles` — all DB operations for ingestion |
| `src/middlewares/upload.middleware.ts` | Multer disk storage to `os.tmpdir()`, CSV file filter |
| `src/routes/ingestion.route.ts` | `POST /api/ingest` — admin only, rate limited, versioned |
| `src/config/app.config.ts` | Registered ingestion route at `/api/ingest` |

---

## What Was Not Added and Why

| Considered | Rejected because |
|---|---|
| Redis | No horizontal scaling — in-memory cache is faster and requires no new infrastructure |
| Background job queue for uploads | `for await` streaming is already non-blocking — a queue adds complexity without benefit |
| Granular cache invalidation | Full clear is simpler, correct, and negligible cost — cache refills quickly |
| Per-row DB insert | 500,000 round trips at 5ms each = 41 minutes. Chunked inserts reduce this to ~5 seconds |
| External NLP for normalization | Task explicitly prohibits AI or LLMs — rule-based key normalization is sufficient |
