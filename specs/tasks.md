# Tasks — Requests Search & Filtering

> **This document states WHEN, IN WHAT ORDER, and HOW IT IS PROVEN DONE.**
> `requirements.md` states WHAT and is the source of truth. `design-feature.md` states HOW.
> **This document decides nothing.** Where it looks like a decision, it is quoting one of those two. If it contradicts either, it is wrong and gets corrected — not them.
> **Scope:** everything still to be built or written for submission — Part A code, the Part B and Part C document, README and AI-usage.

## Conventions

Every task carries the same six fields.

| Field | Meaning |
|---|---|
| **Serves** | Requirement IDs from `requirements.md`. A task serving nothing does not belong here |
| **Design** | The sections of `design-feature.md` that decide this task's content |
| **Files** | Every file created, modified or deleted — no others |
| **Steps** | The work, as checkboxes |
| **Done when** | A gate that is **run or read**, never guessed. The next task does not start until it passes |
| **Traps** | The `design-feature.md` §4 constraints that this specific step can violate, restated where they can actually be violated. **Every trap listed fails silently** — that is why it is a trap and not a bug |

- Tick `- [x]` only when **Done when** has actually passed.
- Tasks are dependency-ordered. The only place two tasks must run back-to-back is T5→T6, where the solution does not compile in between — as §5 steps 3 and 4 now state.

---

## Execution order and time budget

| # | Task | Serves | Budget |
|---|---|---|---|
| T1 | Solution file and build baseline | `REQ-D-001` | 5m |
| T2 | SQLite provider, schema, indexes, UTC converter | `REQ-N-001`, `REQ-N-003` | 20m |
| T3 | 200,000-row seed | `REQ-N-001` | 15m |
| T4 | Application contracts and validation | `REQ-F-001`–`REQ-F-007`, `REQ-N-002` | 20m |
| T5 | Replace the interfaces; delete the obsolete tests | `REQ-F-010` | 10m |
| T6 | `RequestRepository.SearchAsync` and sort mapping | `REQ-F-001`–`REQ-F-009`, `REQ-N-001` | 25m |
| T7 | API: identity, controller, pipeline | `REQ-F-007`, `REQ-F-010` | 20m |
| T8 | Tests — six | `REQ-T-001` | 20m |
| T9 | Client: scaffold, configuration, API client | `REQ-F-107`, `REQ-D-002` | 20m |
| T10 | Client: search page, results table, three states | `REQ-F-101`–`REQ-F-106` | 30m |
| T11 | Parts B and C document with diagrams | `REQ-A-001`, `REQ-A-002`, `REQ-C-001`, `REQ-D-013` | 20m |
| T12 | README | `REQ-D-002`–`REQ-D-007` | 15m |
| T13 | AI-usage | `REQ-D-008`–`REQ-D-012` | 10m |
| T14 | Submission verification | `REQ-D-001`, `REQ-D-014` | 5m |
| | | **Total** | **3h55m** |

**That total is over the three-hour box, and it is stated rather than smoothed.** The cut order below is how it fits.

### If the clock runs out

Cut in this order, from the top. Each cut is recoverable and each is already anticipated by a decision in the design — which is what makes it a cut rather than a failure.

| Order | Cut | Costs | Why this one first |
|---|---|---|---|
| 1 | T8 down to the two permission tests | Four of six tests | The brief marks tests optional (`REQ-T-001` notes this). The two permission tests are the decisive acceptance test in `REQ-F-010` and are the two that must survive |
| 2 | T10's Angular Material for native form controls | Polish, not capability | `REQ-F-101`–`REQ-F-106` are satisfiable with native `input`, `select multiple` and `table`. ADR-005 chose Material for convenience, not for correctness |
| 3 | T3 down to a 5,000-row seed | The `EXPLAIN QUERY PLAN` evidence for `REQ-N-001` | §3.3 already says the seed *demonstrates*, and the *design* is what holds at millions. The README says which was measured and which was reasoned |
| 4 | T9's `site.config.json` for a constant in `environment.ts` | Retargeting a built bundle | ADR-007 records this exact fallback: "the token stays and only its provider changes, from a constant to an initialiser" |

**Never cut:** server-side permission enforcement (`REQ-F-010`), strict input rejection (`REQ-F-007`), paging (`REQ-N-002`), T11, T12, T13. The last three are mandatory deliverables and are the cheapest marks in the exam.

**Whatever is cut is written into the README under `REQ-D-007`** — what was not completed, and how the work would have continued. An undocumented cut is the only kind that costs anything.

---

## Deviations from `design-feature.md` §5

Recorded rather than applied silently. None of them changes a decision.

| # | §5 says | This document does | Why |
|---|---|---|---|
| 1 | Step 1 bundles the solution file with the provider swap | T1 splits it out | `dotnet build` at the repo root is the gate for every task after it, and it needs the `.sln` to exist first |

---

# Phase A — Backend

## T1 — Solution file and build baseline

**Serves** `REQ-D-001`, `REQ-D-002` · **Design** §5 step 1

**Files** — `CandidateTest.sln` *(new, repo root)*

- [ ] `dotnet new sln -n CandidateTest`
- [ ] Add all five projects: the four under `src/` and `tests/Requests.Tests/Requests.Tests.csproj`
- [ ] `dotnet build`
- [ ] `dotnet test`

**Done when** — both commands succeed from the repo root.

> This is the **last moment the supplied tests pass**. They are deleted in T5 and replaced in T8. Note the baseline now so that a red build later is never ambiguous.

```bash
dotnet new sln -n CandidateTest
dotnet sln add src/Requests.Domain/Requests.Domain.csproj src/Requests.Application/Requests.Application.csproj src/Requests.Infrastructure/Requests.Infrastructure.csproj src/Requests.Api/Requests.Api.csproj tests/Requests.Tests/Requests.Tests.csproj
```

---

## T2 — SQLite provider, schema, indexes, UTC converter

**Serves** `REQ-N-001`, `REQ-N-003`, `REQ-F-003`, `REQ-F-008`, `REQ-F-009` · **Design** ADR-001, §3.3, §4

**Files**

| File | Change |
|---|---|
| `src/Requests.Infrastructure/Requests.Infrastructure.csproj` | Drop `Microsoft.EntityFrameworkCore.InMemory`; add `Microsoft.EntityFrameworkCore.Sqlite` **8.0.19** (match the existing EF version) |
| `src/Requests.Infrastructure/DependencyInjection.cs` | `AddInfrastructure(this IServiceCollection, IConfiguration)`; `UseSqlite(...)` |
| `src/Requests.Api/appsettings.json` | **New file** — none exists today |
| `src/Requests.Infrastructure/Persistence/RequestsDbContext.cs` | Add `OnModelCreating` |
| `src/Requests.Api/Program.cs` | Pass configuration; `EnsureCreated()` before seeding |

- [ ] Swap the provider package, then `UseSqlite(configuration.GetConnectionString("RequestsDb"))`
- [ ] `appsettings.json`: `ConnectionStrings:RequestsDb` = `Data Source=requests.db`, and `Cors:AllowedOrigins` = `[ "http://localhost:4200" ]` (consumed in T7 — created here so the file is written once)
- [ ] `OnModelCreating` — the six indexes of §3.3, shaped to the queries actually issued:

```csharp
b.HasIndex(x => new { x.OwnerId, x.CreatedAt });          // permission path + default order
b.HasIndex(x => new { x.AssignedToUserId, x.CreatedAt }); // permission path + default order
b.HasIndex(x => x.Status);
b.HasIndex(x => x.RequestType);
b.HasIndex(x => x.CreatedAt);
b.HasIndex(x => x.RequestNumber);                         // exact lookups; REQ-F-001 will not use it (ADR-006)
```

- [ ] `OnModelCreating` — the UTC converter on **both** `DateTime` properties:

```csharp
var utc = new ValueConverter<DateTime, DateTime>(
    v => v,                                          // write: identity — storage and indexes unchanged
    v => DateTime.SpecifyKind(v, DateTimeKind.Utc)); // read: restore the kind SQLite cannot store
b.Property(x => x.CreatedAt).HasConversion(utc);
b.Property(x => x.UpdatedAt).HasConversion(utc);
```

- [ ] `Program.cs`: `db.Database.EnsureCreated();` **before** `DbSeeder.Seed(db);`

**Done when**

- [ ] The API starts and `src/Requests.Api/requests.db` is created (the connection string is relative to the process working directory)
- [ ] `git status` stays clean — `*.db` is already in `.gitignore`

**Traps**

- **`EnsureCreated()` must precede `db.Requests.Any()`.** Reversed, the seeder's own guard throws `no such table: Requests`.
- **After any model change, delete `requests.db` before the next run** (§4, last row). `EnsureCreated()` does nothing when the file exists, so a new index is silently never created.
- **The converter's write side is the identity function.** Anything else rewrites stored values and invalidates the `CreatedAt` indexes.
- Without the converter nothing fails loudly: filtering still works, the response just loses its `Z` and every browser shifts the displayed time (§4).

---

## T3 — 200,000-row seed

**Serves** `REQ-N-001` · **Design** §3.3 (Seeding), ADR-001

**Files** — `src/Requests.Infrastructure/Persistence/DbSeeder.cs` *(rewrite the body; keep the guard)*

- [ ] **Keep `if (db.Requests.Any()) return;`** — unchanged, first line
- [ ] Replace `AddRange` with one `ExecuteSqlRaw` over a recursive CTE:

```sql
INSERT INTO Requests
    (RequestNumber, CustomerId, OwnerId, AssignedToUserId, Status, RequestType, CreatedAt, UpdatedAt)
WITH RECURSIVE seq(i) AS (
    SELECT 1 UNION ALL SELECT i + 1 FROM seq WHERE i < {0}
)
SELECT printf('REQ-%06d', i),
       (i % 100) + 1,
       (i % 5) + 1,
       CASE WHEN i % 7 = 0 THEN NULL ELSE ((i + 1) % 5) + 1 END,
       (i % 4) + 1,
       ((i / 4) % 4) + 1,
       datetime('now', '-' || (i % 365) || ' days'),
       datetime('now', '-' || (i % 100) || ' days')
FROM seq;
```

**Done when**

- [ ] First start completes in roughly a second and `SELECT COUNT(*) FROM Requests` returns `200000`
- [ ] **Second start leaves the count unchanged** — this is the guard doing its job

**Traps**

- **Row-by-row `AddRange` at this volume takes minutes.** One statement, not 200,000.
- **Seeded dates are relative to the moment of seeding** (`datetime('now', …)`), so the data ages with the file. **No test and no README example may assert against an absolute date** (§3.3).
- `datetime()` emits `YYYY-MM-DD HH:MM:SS`, which is what EF's SQLite reader expects. A hand-rolled ISO string with a `T` or a `Z` is not.

> **Useful consequence for demos:** owners and assignees fall in 1–5. `X-User-Id: 1` sees a large subset, `X-User-Id: 9` sees **nothing** — which is the empty state of `REQ-F-106` on demand, and the decisive contrast of `REQ-F-010` against `X-Is-Admin: true`.

---

## T4 — Application contracts and validation

**Serves** `REQ-F-001`–`REQ-F-007`, `REQ-F-008`–`REQ-F-010`, `REQ-N-002` · **Design** §3.2, §3.4a, ADR-003, ADR-004, §4

**Files** — all new, under `src/Requests.Application/`

| File | Contents |
|---|---|
| `Common/ICurrentUser.cs` | `int UserId { get; }`, `bool IsAdministrator { get; }` |
| `Common/PagedResult.cs` | `sealed record PagedResult<T>(IReadOnlyList<T> Items, int TotalCount, int Page, int PageSize)` |
| `Requests/Search/RequestSortFields.cs` | The **closed** sort-key set and the two directions, as constants |
| `Requests/Search/RequestSearchQuery.cs` | The query record and its `Validate` |

- [ ] `RequestSortFields` — `requestNumber`, `status`, `requestType`, `createdAt`; directions `asc`, `desc`. Expose the permitted set as a case-insensitive `HashSet<string>`
- [ ] `RequestSearchQuery` — a `record` **with a body and `init` properties**, implementing `IValidatableObject`. Defaults: `Page = 1`, `PageSize = 25`, `MaxPageSize = 100` as a `const` (ADR-003)
- [ ] Validation, one rule per row of `REQ-F-007`'s table:

| Rule | Error member name |
|---|---|
| Every supplied `Status` passes `Enum.IsDefined` | `status` |
| `RequestType`, when supplied, passes `Enum.IsDefined` | `requestType` |
| `CreatedFrom` is not later than `CreatedTo` | `createdFrom` |
| `SortBy`, when supplied, is in `RequestSortFields` | `sortBy` |
| `SortDirection`, when supplied, is `asc` or `desc` | `sortDirection` |
| `Page` ≥ 1 | `page` |
| `1` ≤ `PageSize` ≤ `100` | `pageSize` |

**Done when** — `dotnet build` succeeds and each row of `REQ-F-007`'s invalid-input table maps to exactly one rule above.

**Traps**

- **Name every property to match its query-string name** (`Status`, `CreatedFrom`, `SortBy` …). Binding is case-insensitive, so **no `[FromQuery]` attribute is needed** — and that matters: the attribute lives in MVC, and `Requests.Application` references only `Requests.Domain`. Adding an MVC reference to satisfy a name is a dependency-rule violation (§1, principle 1), which §4 now states as a constraint rather than as a condition.
- **Type the status collection `List<RequestStatus>`, not `IReadOnlyList<>`** — the collection binder needs an `ICollection<T>`-compatible target and binds `IReadOnlyList<T>` to null, silently (§4).
- **A positional record has no parameterless constructor and will not bind.** Body plus `init`, always (§4).
- **`Enum.IsDefined` is not optional.** The binder accepts any integer for an enum, so without it `status=99` binds, matches nothing, and returns `200` with an empty page — the exact silent absorption `REQ-F-007` forbids (§4). The check validates the *value*, not the wire format: `status=2` passes and binds to `InProgress`, which is deliberate (§4 note).
- **Error member names are the camelCase wire names**, because they become the keys of the `errors` map in §3.4a's 400 body, and the client renders them field by field (`REQ-F-105`).
- Known nuance, worth stating in the README rather than fixing: `createdFrom=hello` fails at *binding* and yields the binder's own message, not one of yours. Still a 400 with field detail, so `REQ-F-007` holds.

---

## T5 — Replace the interfaces; delete the obsolete tests

**Serves** `REQ-F-010`, `REQ-N-001` · **Design** §3.2, §5 step 3

**No build gate on this task** — §5 step 3 says why: `RequestRepository` still implements the removed `GetAllAsync` and is not rewritten until T6. Run T6 immediately after.

**Files**

| File | Change |
|---|---|
| `src/Requests.Application/Requests/IRequestRepository.cs` | `GetAllAsync` → `Task<PagedResult<RequestDto>> SearchAsync(RequestSearchQuery, CancellationToken)` |
| `src/Requests.Application/Requests/IRequestService.cs` | `GetRequestsAsync` → `SearchAsync(RequestSearchQuery, CancellationToken)` |
| `src/Requests.Application/Requests/RequestService.cs` | Delegate to the repository. Orchestration only — no filtering, no permission logic |
| `tests/Requests.Tests/RequestServiceTests.cs` | **Delete.** Both tests and `FakeRequestRepository` implement and call the removed method |

- [ ] Replace both interfaces and the service
- [ ] Delete the test file
- [ ] Move the in-memory permission filter **out** of `RequestService` — it becomes part of the query in T6

**Done when** — `GetAllAsync` and `GetRequestsAsync` appear nowhere in the solution:

```bash
git grep -n --untracked "GetAllAsync\|GetRequestsAsync"
```

**Traps**

- **`GetAllAsync` is removed, not kept alongside.** An unfiltered, reachable data path is precisely the defect `REQ-F-010` exists to prevent (§3.2).
- **Identity is injected, never a parameter.** `RequestService` must not take `currentUserId` / `isAdministrator` — a parameter leaves a path where a caller supplies a different one (§3.2).

---

## T6 — `RequestRepository.SearchAsync` and sort mapping · **BUILD GATE**

**Serves** `REQ-F-001`–`REQ-F-009`, `REQ-N-001`, `REQ-N-002`, `REQ-N-003` · **Design** §3.3, ADR-006, §4

**Files** — `src/Requests.Infrastructure/Repositories/RequestRepository.cs` *(rewrite)*

- [ ] Inject `RequestsDbContext` **and `ICurrentUser`**
- [ ] Compose in exactly this order — the order is what makes `REQ-N-001` hold:

| # | Step | Serves |
|---|---|---|
| 1 | `AsNoTracking()` | read path |
| 2 | **Permission restriction, first and unconditional** — `OwnerId == UserId \|\| AssignedToUserId == UserId`, skipped only when `IsAdministrator` | `REQ-F-008`, `REQ-F-009` |
| 3 | Each filter added **only when a value was supplied** | `REQ-F-001`–`REQ-F-004`, `REQ-F-006` |
| 4 | `CountAsync` → the total | `REQ-N-002` |
| 5 | Ordering, then `Skip`/`Take` | `REQ-F-005`, `REQ-N-002` |
| 6 | `Select` to `RequestDto` **inside** the query | `REQ-N-001` |
| 7 | Materialise | |

- [ ] Partial match: `x.RequestNumber.Contains(value)` (ADR-006)
- [ ] Date bounds: `CreatedAt >= from.Date` and `CreatedAt < to.Date.AddDays(1)`, both normalised to UTC with `DateTime.SpecifyKind`
- [ ] Sort: a `switch` over `RequestSortFields`, each arm a typed `OrderBy`/`OrderByDescending` **plus `ThenBy(x => x.Id)`**. Default: `CreatedAt` descending, `Id` as tiebreaker

**Done when**

- [ ] `dotnet build` succeeds — **the first green build since T5**
- [ ] `EXPLAIN QUERY PLAN` shows an index on the permission path. Capture the output; ADR-001 requires it quoted in the README:

```bash
sqlite3 src/Requests.Api/requests.db "EXPLAIN QUERY PLAN SELECT * FROM Requests WHERE OwnerId = 1 OR AssignedToUserId = 1 ORDER BY CreatedAt DESC LIMIT 25;"
```

*(No `sqlite3` on the machine? Add `.LogTo(Console.WriteLine)` to the context options to capture EF's real SQL, then run the same `EXPLAIN QUERY PLAN` through a `SqliteCommand` in a scratch test.)*

**Traps**

- **`string.Contains`, never `EF.Functions.Like`.** `LIKE` makes `%` and `_` wildcards in user input, so a user typing `%` matches every row (§4, ADR-006).
- **`CreatedAt < to.Date.AddDays(1)`.** `<=` on the date excludes everything created on the end day — the whole of `REQ-F-003`'s clarified upper bound (§4, `[CLARIFIED #4]`).
- **Never `WHERE (@x IS NULL OR Column = @x)`.** A blanket predicate defeats the indexes T2 just created (§3.3 step 3).
- **`CountAsync` runs before `Skip`/`Take`**, and `totalCount` is the permission-restricted count — never `items.Count` (§3.4a).
- **Project inside the query.** A `Select` after `ToListAsync` pulls whole entities across the boundary and breaks `REQ-N-001`'s acceptance criterion.
- **The sort key set must not drift from `RequestSortFields`.** A key that validates in T4 but has no `switch` arm here falls through to the default ordering silently — the user gets a different order than the one requested and nothing reports it. Both sides read the same constants.
- **`ThenBy(x => x.Id)` is not decoration.** Without a tiebreaker, `REQ-F-005`'s determinism criterion fails intermittently and only under paging.

---

## T7 — API: identity, controller, pipeline

**Serves** `REQ-F-007`, `REQ-F-010`, `REQ-F-103`, `REQ-D-002` · **Design** §3.4, §3.4a, ADR-002, ADR-004, §4

**Files**

| File | Change |
|---|---|
| `src/Requests.Api/Authentication/HeaderAuthenticationHandler.cs` | **New** — `AuthenticationHandler<AuthenticationSchemeOptions>` over `X-User-Id` / `X-Is-Admin` |
| `src/Requests.Api/Authentication/ClaimsCurrentUserAccessor.cs` | **New** — `ICurrentUser` over `HttpContext.User` |
| `src/Requests.Api/Controllers/RequestsController.cs` | `[Authorize]`; one `[HttpGet]` taking `[FromQuery] RequestSearchQuery`; **`ParseUserId` and both header reads deleted** |
| `src/Requests.Api/Program.cs` | Authentication, authorization, CORS, `JsonStringEnumConverter`, `IHttpContextAccessor` |

- [ ] Handler: header absent → `AuthenticateResult.NoResult()`; header present but unparseable → `AuthenticateResult.Fail(...)`. Under `[Authorize]` both end as **401**. `X-Is-Admin: true` adds `ClaimTypes.Role = "Administrator"`; the user id becomes `ClaimTypes.NameIdentifier`
- [ ] `ClaimsCurrentUserAccessor` reads those two claims and nothing else
- [ ] `Program.cs`: `AddJsonOptions(o => o.JsonSerializerOptions.Converters.Add(new JsonStringEnumConverter()))`; CORS policy from `Cors:AllowedOrigins`; `UseCors` **after** `UseRouting` and **before** `UseAuthentication`/`UseAuthorization`

**Done when** — every line below behaves as stated. These are `REQ-F-007` and `REQ-F-010` in executable form.

```bash
curl.exe -i "http://localhost:60702/api/requests"                                        # 401, no identity
curl.exe -s "http://localhost:60702/api/requests" -H "X-User-Id: 1"                      # 200, totalCount well under 200000
curl.exe -s "http://localhost:60702/api/requests" -H "X-User-Id: 1" -H "X-Is-Admin: true" # 200, totalCount = 200000
curl.exe -s "http://localhost:60702/api/requests?status=99"       -H "X-User-Id: 1"      # 400, errors.status
curl.exe -s "http://localhost:60702/api/requests?sortBy=ownerName" -H "X-User-Id: 1"     # 400, errors.sortBy
curl.exe -s "http://localhost:60702/api/requests?pageSize=101"    -H "X-User-Id: 1"      # 400, errors.pageSize
curl.exe -s "http://localhost:60702/api/requests?createdFrom=2026-09-01&createdTo=2026-01-01" -H "X-User-Id: 1"  # 400
curl.exe -s "http://localhost:60702/api/requests?page=100000"     -H "X-User-Id: 1"      # 200, items [], totalCount correct
curl.exe -s "http://localhost:60702/api/requests?requestNumber=000123" -H "X-User-Id: 1" # matches REQ-000123 mid-string
```

- [ ] The two identity lines return **different result sets and different totals** — the decisive acceptance test of `REQ-F-010`
- [ ] `status` renders as `"InProgress"`, not `2`
- [ ] Timestamps end in `Z`
- [ ] Swagger still loads at `/swagger`

**Traps**

- **Delete `ParseUserId`.** Its `int.TryParse(...) ? userId : 1` fallback silently assigns identity to user 1 and makes `REQ-F-010`'s decisive test meaningless — it is the specific defect ADR-002 was written against.
- **Register `IHttpContextAccessor`**, or `ClaimsCurrentUserAccessor` resolves a null context at runtime only.
- **Without `JsonStringEnumConverter` the table renders `Status: 2`** and the client's string unions never match (§4).
- CORS placed after `UseAuthorization` silently fails the browser preflight while `curl` keeps working.

---

## T8 — Tests, six

**Serves** `REQ-T-001`, `REQ-F-001`, `REQ-F-002`, `REQ-F-007`, `REQ-F-008`, `REQ-F-009`, `REQ-N-002` · **Design** §3.6

**Files**

| File | Change |
|---|---|
| `tests/Requests.Tests/Requests.Tests.csproj` | Drop `Microsoft.EntityFrameworkCore.InMemory`; add `Microsoft.EntityFrameworkCore.Sqlite` |
| `tests/Requests.Tests/SqliteTestDatabase.cs` | **New** — an `IDisposable` holding an open `SqliteConnection` to `Data Source=:memory:`, a context over it, and `EnsureCreated()` |
| `tests/Requests.Tests/StubCurrentUser.cs` | **New** — `ICurrentUser` with two settable values |
| `tests/Requests.Tests/RequestRepositorySearchTests.cs` | **New** — the five repository tests |
| `tests/Requests.Tests/RequestSearchQueryValidationTests.cs` | **New** — the validation test |

- [ ] The six of §3.6, no more:

| # | Test | Covers | Level |
|---|---|---|---|
| 1 | A regular user sees only owned or assigned requests | `REQ-F-008` | repository |
| 2 | An administrator sees all requests | `REQ-F-009` | repository |
| 3 | `000123` finds `REQ-000123` — a mid-string match | `REQ-F-001` | repository |
| 4 | Multiple statuses filter correctly | `REQ-F-002` | repository |
| 5 | Paging returns the right rows **and the right total** | `REQ-N-002` | repository |
| 6 | An inverted date range is rejected | `REQ-F-007` | validation |

- [ ] Tests 1 and 2 run **the same query** under two identities and assert that both the rows **and the totals** differ — that is the decisive test, not two unrelated assertions
- [ ] Test 5 asserts `TotalCount > Items.Count` on a page-sized result

**Done when** — `dotnet test` reports **6 passed**, and passes again on a second run (no cross-test leakage).

**Traps**

- **Each test owns its own connection and database.** A shared in-memory SQLite database leaks rows between tests and produces order-dependent failures.
- **Hold the connection open.** `Data Source=:memory:` discards the database the moment the last connection closes — including between `EnsureCreated()` and the first query.
- **No absolute dates.** Test data is created inside the test; assertions derive their bounds at run time (§3.3).
- Test 6 needs no database — it validates `RequestSearchQuery` directly.

---

# Phase B — Client

## T9 — Scaffold, configuration, API client

**Serves** `REQ-F-107`, `REQ-D-002`, `REQ-N-002` · **Design** ADR-005, ADR-007, §3.5

**Files** — new, under `frontend/`

- [ ] `ng new frontend --style=scss --ssr=false`, then `ng add @angular/material`
- [ ] `public/site.config.json` (Angular 18+; `src/assets/` on earlier versions) — `{ "apiBaseUrl": "http://localhost:60702/api" }`
- [ ] `core/config/` — `app-config.service.ts` reading that file once at bootstrap, `api-base-url.token.ts` exposing the address by injection
- [ ] Wire the initialiser in `app.config.ts` so the application does not render until configuration has loaded
- [ ] `core/models/` — `request.model.ts`, `search-query.model.ts`, `paged-result.model.ts`, mirroring §3.4a exactly. Enumerations are **string unions**, not numbers
- [ ] `core/services/requests-api.service.ts` — one `search(query)` method building the query string per §3.4a
- [ ] `core/services/current-user.service.ts` + `core/interceptors/identity.interceptor.ts`, registered via `provideHttpClient(withInterceptors([...]))`
- [ ] `provideNativeDateAdapter()` in `app.config.ts`

**Done when**

- [ ] The client boots and a search returns rows from the running API
- [ ] Editing `apiBaseUrl` in `site.config.json` and reloading retargets the client **without a rebuild** (ADR-007)
- [ ] No literal API address anywhere but that file: `git grep -n --untracked "localhost:60702" frontend/src` returns nothing. **`--untracked` is not optional here** — the whole client is untracked at this point, and without it the check passes by finding nothing at all

**Traps**

- **Repeated `status` parameters use `params.append`, not `params.set`.** `set` keeps only the last value and multi-select silently filters by one status (§3.4a).
- **Format dates as local `yyyy-MM-dd`, never `toISOString().slice(0,10)`.** The range picker yields local midnight; at UTC+3 `toISOString` moves it to the previous day, and the user sees a range shifted by one day with no error. This is the client-side twin of §4's "incoming date bounds are normalised to UTC".
- **A configuration load failure is a startup error, not a fallback to some default address** (ADR-007).
- **Without `provideNativeDateAdapter` the date-range input fails at runtime only** (§4).

---

## T10 — Search page, results table, three states

**Serves** `REQ-F-101`–`REQ-F-106`, `REQ-N-001`, `REQ-N-002` · **Design** §3.5, §4

**Files** — `frontend/src/app/features/request-search/` — two components, per §3.5

- [ ] `RequestSearchPageComponent` (stateful) — owns the filter form, sort state, page state, and the loading / error / results state; hosts the filter controls directly
- [ ] `RequestResultsTableComponent` (presentational) — inputs `rows`, `totalCount`, `page`, `pageSize`, `sort`, `loading`, `errorMessage`; outputs `sortChange`, `pageChange`; **holds no state and issues no HTTP**
- [ ] Controls, one per requirement: text input (`REQ-F-001`), `mat-select multiple` (`REQ-F-002`), `mat-date-range-input` (`REQ-F-003`), `mat-select` (`REQ-F-004`), `matSort` (`REQ-F-102`), `mat-table` (`REQ-F-103`), `mat-paginator` (`REQ-N-002`)
- [ ] The three states, visually distinct: `mat-progress-bar` (`REQ-F-104`), an error block rendering the `errors` map field by field (`REQ-F-105`), an explicit no-results message (`REQ-F-106`)
- [ ] A clear-filters control returning to the unfiltered state (`REQ-F-101`)
- [ ] An identity switcher driving `CurrentUserService`, so `REQ-F-010` can be demonstrated live
- [ ] Flow: any filter / sort / page change → page resets to 1 on a filter change → debounce → request issued, superseding and cancelling any in flight

**Done when** — all four states seen against the running API:

- [ ] **Loading** — the progress bar is visible while a request is in flight
- [ ] **Results** — the paginator's page count reflects `totalCount`, not the 25 rows on screen
- [ ] **Error** — `sortBy=ownerName` (or any 400) renders the field-level message, never a blank screen
- [ ] **Empty** — switching to user 9 shows the no-results message, clearly distinct from the other two
- [ ] Switching identity to Administrator changes the row count **and the total** on screen

**Traps**

- **Do not bind the table to `MatTableDataSource`'s client-side sort and paging.** It would sort the 25 rows already fetched instead of the 200,000 on the server — `REQ-N-001` and `REQ-N-002` break silently and the screen still looks right (§4, §3.5 rule 3).
- **The paginator's `length` comes from the response `totalCount`.** Bound to `rows.length`, navigation shows one page regardless of the real result size (§4).
- **A filter change that does not reset the page** leaves the user on page 40 of a three-page result, looking at the empty state (`REQ-N-002`).
- Two components, not three. §3.5 records why the filter form is not split out.

---

# Phase C — Documents

## T11 — Parts B and C, with diagrams

**Serves** `REQ-A-001`, `REQ-A-002`, `REQ-C-001`, `REQ-D-013` · **Design** — none; this document does not exist yet

**Files** — `specs/design-architecture-cloud.md` *(new)*; `specs/requirements.md` *(coverage matrix)*

- [ ] **Part B** — the five domains (Customers, Requests, Notifications, Documents, Reporting), the boundary each owns, and which communication is synchronous and which is asynchronous
- [ ] **Part B scenario** — `REQ-A-002` has three acceptance criteria and each must be answerable by pointing at a paragraph:
  - what happens to a notification **while** the service is down, and what happens when it returns
  - **which guarantees are provided and which are not** — stated explicitly, not implied
  - the effect, or absence of effect, on the availability of the Requests **write path**
- [ ] **Part C** — one cloud, naming actual services, addressing all five components: **Compute, DB, Messaging, Monitoring, Scaling**
- [ ] Two diagrams, embedded as Mermaid in the Markdown (`[CLARIFIED #8]`)
- [ ] Fill in the `requirements.md` coverage-matrix rows that currently read *pending* for `REQ-A-001`, `REQ-A-002`, `REQ-C-001` and `REQ-D-013`

**Done when** — each of `REQ-A-002`'s three criteria, and each of Part C's five components, can be pointed at individually. Both diagrams render.

> The brief's own closing line applies hardest here: a **simple, clear, reasoned** sketch beats an elaborate one. No deployment and no infrastructure code are required (`REQ-C-001`).

---

## T12 — README

**Serves** `REQ-D-002`–`REQ-D-007` · **Design** §5 step 8, ADR-001, ADR-002, ADR-006, ADR-007

**Files** — `README.md` *(new, repo root)*

One section per requirement, so the matrix is checkable by reading:

- [ ] **How to run** backend and frontend (`REQ-D-002`) — including where the API address is changed
- [ ] **How to run the tests** (`REQ-D-003`)
- [ ] **Technologies and why** (`REQ-D-004`) — SQLite in place of the supplied InMemory provider needs its justification here (ADR-001), as does Angular (ADR-005)
- [ ] **Assumptions** (`REQ-D-005`) — its acceptance criterion is that **every `[DERIVED]` requirement appears with its rationale**. That is `REQ-N-002` (paging) and `REQ-N-003` (time handling). Plus:
  - case handling on the partial match follows the store's collation and is **unspecified** (ADR-006)
  - the header identity scheme is **not secure**, and why that is acceptable here (ADR-002)
  - the seed is 200,000 rows: it *demonstrates*; the *design* is what holds at millions (§3.3)
  - the `EXPLAIN QUERY PLAN` output captured in T6
- [ ] **One technical decision with real alternatives** (`REQ-D-006`) — **ADR-002 is the intended answer** (§ADR-002). ADR-007 is a strong second: both alternatives were real and one was chosen deliberately
- [ ] **What was not completed and how it would continue** (`REQ-D-007`) — every cut actually taken from the cut-order table, plus the standing next steps the design already names: keyset pagination if access turns into deep scrolling (ADR-003), a trigram index or search engine for the substring scan (ADR-006), FluentValidation to close the non-HTTP caller gap (ADR-004)

**Done when** — each `REQ-D-002`–`REQ-D-007` acceptance criterion is satisfiable by reading one section, and both `[DERIVED]` requirements appear by name.

---

## T13 — AI-usage

**Serves** `REQ-D-008`–`REQ-D-012` · Mandatory — the brief requires this file **even if AI was not used**

**Files** — `AI-usage.md` *(new, repo root)*

- [ ] **Which tools** (`REQ-D-008`)
- [ ] **At which stages** (`REQ-D-009`) — planning, implementation, testing, architecture
- [ ] **What changed relative to the proposal** (`REQ-D-010`) — the concrete, documented case is `archive/eager-growing-matsumoto.md`: a single planning document that mixed requirements, design, decisions and tasks, and accumulated internal contradictions. It was replaced by the WHAT / HOW split now in `specs/`
- [ ] **A rejected suggestion, with explanation** (`REQ-D-011`) — at least one is required and **two are already on record**:
  - flipping ADR-007 to build-time configuration — rejected because runtime configuration is a stakeholder requirement for this project, and the ADR records the tradeoff in both directions
  - dropping the multi-status test as low value — rejected because `REQ-F-002` is an explicit requirement of the brief, and leaving it with no coverage is the worse trade (§3.6)
- [ ] **How the result was verified** (`REQ-D-012`) — the `Done when` gates in this document: `dotnet build`, `dotnet test`, `EXPLAIN QUERY PLAN`, the decisive two-identity comparison in T7, and the requirement-to-design-to-task coverage matrices

**Done when** — each of the brief's five questions has an answer, and `REQ-D-011`'s example names a real suggestion and a real reason.

---

## T14 — Submission verification

**Serves** `REQ-D-001`, `REQ-D-013`, `REQ-D-014`

- [ ] `dotnet build` and `dotnet test` green from a clean clone
- [ ] Backend and frontend both start by following the README **literally**, with nothing assumed
- [ ] `git status` clean; `requests.db`, `node_modules/`, `dist/` untracked
- [ ] Present: backend code, frontend code, `README.md`, `AI-usage.md`, both diagrams, `specs/` (`REQ-D-014`)
- [ ] Every task above is either `[x]` or named in the README under `REQ-D-007`
- [ ] The coverage matrix below has no empty cell

---

## Coverage

Every requirement maps to at least one task. **A requirement with no task is an orphan — that is, a gap.**

| Requirement | Task |
|---|---|
| `REQ-F-001` | T4, T6, T8 |
| `REQ-F-002` | T4, T6, T8, T10 |
| `REQ-F-003` | T4, T6, T9, T10 |
| `REQ-F-004` | T4, T6, T10 |
| `REQ-F-005` | T4, T6, T10 |
| `REQ-F-006` | T6 |
| `REQ-F-007` | T4, T7, T8, T10 |
| `REQ-F-008` | T2, T6, T8 |
| `REQ-F-009` | T6, T8 |
| `REQ-F-010` | T4, T5, T6, T7, T10 |
| `REQ-F-101` | T10 |
| `REQ-F-102` | T10 |
| `REQ-F-103` | T7, T10 |
| `REQ-F-104` | T10 |
| `REQ-F-105` | T4, T10 |
| `REQ-F-106` | T10 |
| `REQ-F-107` | T9 |
| `REQ-N-001` | T2, T3, T6, T10 |
| `REQ-N-002` | T4, T6, T9, T10 |
| `REQ-N-003` | T2, T6, T9 |
| `REQ-A-001` | T11 |
| `REQ-A-002` | T11 |
| `REQ-C-001` | T11 |
| `REQ-T-001` | T8 |
| `REQ-D-001` | T1, T14 |
| `REQ-D-002` | T2, T7, T9, T12 |
| `REQ-D-003` | T12 |
| `REQ-D-004` | T12 |
| `REQ-D-005` | T6, T12 |
| `REQ-D-006` | T12 |
| `REQ-D-007` | T12 |
| `REQ-D-008`–`REQ-D-012` | T13 |
| `REQ-D-013` | T11 |
| `REQ-D-014` | T14 |
