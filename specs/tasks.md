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
| T3a | Users entity, schema, and seed `[STAKEHOLDER #1]` | `REQ-F-011` | 20m |
| T4 | Application contracts and validation | `REQ-F-001`–`REQ-F-007`, `REQ-N-002` | 20m |
| T5 | Replace the interfaces; delete the obsolete tests | `REQ-F-010` | 10m |
| T6 | `RequestRepository.SearchAsync` and sort mapping | `REQ-F-001`–`REQ-F-009`, `REQ-N-001` | 25m |
| T7 | API: authentication, login, controller, pipeline | `REQ-F-007`, `REQ-F-010`–`REQ-F-013` | 35m |
| T8 | Tests — six | `REQ-T-001` | 20m |
| T8a | Authentication tests `[STAKEHOLDER #1]` | `REQ-F-012`, `REQ-F-013` | 15m |
| T9 | Client: scaffold, configuration, API client | `REQ-F-107`, `REQ-D-002` | 20m |
| T9a | Client: login page, route guard, auth interceptor `[STAKEHOLDER #1]` | `REQ-F-108`, `REQ-F-109` | 30m |
| T10 | Client: search page, results table, three states | `REQ-F-101`–`REQ-F-106` | 30m |
| T11 | Parts B and C document with diagrams | `REQ-A-001`, `REQ-A-002`, `REQ-C-001`, `REQ-D-013` | 20m |
| T12 | README | `REQ-D-002`–`REQ-D-007` | 15m |
| T13 | AI-usage | `REQ-D-008`–`REQ-D-012` | 10m |
| T14 | Submission verification | `REQ-D-001`, `REQ-D-014` | 5m |
| | | **Total** | **5h15m** |

**That total is over the three-hour box, and it is stated rather than smoothed.** It grew by 1h20m — T3a + T7's delta + T8a + T9a — when `[STAKEHOLDER #1]` reversed the exclusion of authentication; that addition is deliberate and is not itself a candidate for the cut list below. The cut order below is how the rest fits.

### If the clock runs out

Cut in this order, from the top. Each cut is recoverable and each is already anticipated by a decision in the design — which is what makes it a cut rather than a failure.

| Order | Cut | Costs | Why this one first |
|---|---|---|---|
| 1 | T8 down to the two permission tests, and T8a's two authentication tests with it | Four of six T8 tests, plus both of T8a's | The brief marks tests optional (`REQ-T-001` notes this), and nothing in `[STAKEHOLDER #1]` says otherwise. The two permission tests are the decisive acceptance test in `REQ-F-010` and are the two that must survive |
| 2 | T10's Angular Material for native form controls | Polish, not capability | `REQ-F-101`–`REQ-F-106` are satisfiable with native `input`, `select multiple` and `table`. ADR-005 chose Material for convenience, not for correctness |
| 3 | T3 (and T3a) down to a 5,000-row seed, with a proportionally smaller `Users` seed | The `EXPLAIN QUERY PLAN` evidence for `REQ-N-001` | §3.3 already says the seed *demonstrates*, and the *design* is what holds at millions. The README says which was measured and which was reasoned. T3a's FK means the two shrink together |
| 4 | T9's `site.config.json` for a constant in `environment.ts` | Retargeting a built bundle | ADR-007 records this exact fallback: "the token stays and only its provider changes, from a constant to an initialiser" |

**Never cut:** server-side permission enforcement (`REQ-F-010`), **the JWT pipeline and login screen that make that enforcement real (`REQ-F-011`–`REQ-F-013`, `REQ-F-108`, `REQ-F-109` — T3a, T7, T9a)**: a half-built login flow leaves no way to reach the API at all, which is worse than not attempting `[STAKEHOLDER #1]`. Also never cut: strict input rejection (`REQ-F-007`), paging (`REQ-N-002`), T11, T12, T13. The last three are mandatory deliverables and are the cheapest marks in the exam.

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

- [x] `dotnet new sln -n CandidateTest`
- [x] Add all five projects: the four under `src/` and `tests/Requests.Tests/Requests.Tests.csproj`
- [x] `dotnet build`
- [x] `dotnet test`

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

- [x] Swap the provider package, then `UseSqlite(configuration.GetConnectionString("RequestsDb"))`
- [x] `appsettings.json`: `ConnectionStrings:RequestsDb` = `Data Source=requests.db`, and `Cors:AllowedOrigins` = `[ "http://localhost:4200" ]` (consumed in T7 — created here so the file is written once)
- [x] `OnModelCreating` — the four indexes of §3.3, shaped to the queries actually issued:

```csharp
b.HasIndex(x => new { x.OwnerId, x.CreatedAt });          // permission path + default order
b.HasIndex(x => new { x.AssignedToUserId, x.CreatedAt }); // permission path + default order
b.HasIndex(x => x.CreatedAt);
b.HasIndex(x => x.RequestNumber);                         // exact lookups; REQ-F-001 will not use it (ADR-006)
```

> **Do not add single-column indexes on `Status` or `RequestType`**, and if they appear from habit, delete them. §3.3 records the measurement: with them present the planner abandons the permission path the moment a status filter is applied, and the filtered search costs 41 ms instead of 0.4 ms.

- [x] `OnModelCreating` — the UTC converter on **both** `DateTime` properties:

```csharp
var utc = new ValueConverter<DateTime, DateTime>(
    v => v,                                          // write: identity — storage and indexes unchanged
    v => DateTime.SpecifyKind(v, DateTimeKind.Utc)); // read: restore the kind SQLite cannot store
b.Property(x => x.CreatedAt).HasConversion(utc);
b.Property(x => x.UpdatedAt).HasConversion(utc);
```

- [x] `Program.cs`: `db.Database.EnsureCreated();` **before** `DbSeeder.Seed(db);`

**Done when**

- [x] The API starts and `src/Requests.Api/requests.db` is created (the connection string is relative to the process working directory)
- [x] `git status` stays clean — `*.db` is already in `.gitignore`

**Traps**

- **`EnsureCreated()` must precede `db.Requests.Any()`.** Reversed, the seeder's own guard throws `no such table: Requests`.
- **`Data Source=requests.db` resolves against the process working directory, not the project.** Launching from the repo root and from `src/Requests.Api` therefore builds two separate databases, each seeded once — and the symptom is indistinguishable from the guard failing. Anchor it instead: `Path.Combine(builder.Environment.ContentRootPath, "requests.db")`, so the file follows the application rather than the shell.
- **After any model change, delete `requests.db` before the next run** (§4, last row). `EnsureCreated()` does nothing when the file exists, so a new index is silently never created.
- **The converter's write side is the identity function.** Anything else rewrites stored values and invalidates the `CreatedAt` indexes.
- Without the converter nothing fails loudly: filtering still works, the response just loses its `Z` and every browser shifts the displayed time (§4).

---

## T3 — 200,000-row seed

**Serves** `REQ-N-001` · **Design** §3.3 (Seeding), ADR-001

**Files** — `src/Requests.Infrastructure/Persistence/DbSeeder.cs` *(rewrite the body; keep the guard)*

- [x] **Keep `if (db.Requests.Any()) return;`** — unchanged, first line
- [x] Replace `AddRange` with one `ExecuteSqlRaw` over a recursive CTE:

```sql
INSERT INTO Requests
    (RequestNumber, CustomerId, OwnerId, AssignedToUserId, Status, RequestType, CreatedAt, UpdatedAt)
WITH RECURSIVE seq(i) AS (
    SELECT 1 UNION ALL SELECT i + 1 FROM seq WHERE i < {0}
)
SELECT printf('REQ-%06d', i),
       (i % 100) + 1,
       (i % 1000) + 1,
       CASE WHEN i % 7 = 0 THEN NULL ELSE ((i + 1) % 1000) + 1 END,
       (i % 4) + 1,
       ((i / 4) % 4) + 1,
       datetime('now', '-' || (i % 365) || ' days'),
       datetime('now', '-' || (i % 100) || ' days')
FROM seq;
```

**Done when**

- [x] First start completes in **a few seconds** — about seven, measured; every row also updates four indexes — and `SELECT COUNT(*) FROM Requests` returns `200000`
- [x] **Second start leaves the count unchanged** — this is the guard doing its job
- [x] `SELECT COUNT(*) FROM Requests WHERE OwnerId = 1 OR AssignedToUserId = 1` returns **372**. A number in the tens of thousands means the owner spread was left at the supplied seed's five identifiers, and the permission path is no longer selective (§3.3)

**Traps**

- **Row-by-row `AddRange` at this volume takes minutes.** One statement, not 200,000.
- **The owner spread is a thousand, not five.** It is the single biggest factor in every measurement in T6, and it is the easiest thing to copy unchanged from the supplied `DbSeeder`.
- **Seeded dates are relative to the moment of seeding** (`datetime('now', …)`), so the data ages with the file. **No test and no README example may assert against an absolute date** (§3.3).
- `datetime()` emits `YYYY-MM-DD HH:MM:SS`, which is what EF's SQLite reader expects. A hand-rolled ISO string with a `T` or a `Z` is not.

> **Useful consequence for demos, as originally built:** every identifier from 1 to 1000 owns exactly 200 requests, so identifier 1 as a regular user sees **372** (200 owned, the rest assigned) while the same query as an Administrator sees **200,000** — the decisive contrast of `REQ-F-010`, on one screen. Any identifier **above 1000** owns nothing and sees nothing, which is the empty state of `REQ-F-106` on demand.
>
> **Superseded by `[STAKEHOLDER #1]` (T3a).** The header-based demo (`X-User-Id` / `X-Is-Admin`) this note describes is replaced by real login — see T3a and T7. The 1-to-1000 spread and the "372 / 200,000" contrast are still the intended shape of the demo, now reached by logging in as two different seeded accounts rather than by setting headers. **Id 1's 372 is unaffected — the `Requests` CTE formula above is untouched by T3a and reproduces it exactly.** What is genuinely unmeasured is **id 2's** count: this design only ever needed one regular-user identity before (toggled to Administrator by a header flag on that same id), never a second one, so id 2 was never computed. Measure it in T3a rather than assuming it is also 372.

---

## T3a — Users entity, schema, and seed

**Serves** `REQ-F-011`, `REQ-N-001` · **Design** ADR-010, §3.1, §3.3 · **`[STAKEHOLDER #1]`**

**Files**

| File | Change |
|---|---|
| `src/Requests.Domain/Entities/User.cs` | **New** — `Id`, `Username`, `PasswordHash`, `Role` |
| `src/Requests.Domain/Entities/UserRole.cs` | **New** — enum `User`, `Administrator` |
| `src/Requests.Infrastructure/Persistence/RequestsDbContext.cs` | Add `DbSet<User> Users`; map `Username` unique; FK `Request.OwnerId`/`AssignedToUserId` → `Users.Id`, no navigation property either direction (ADR-010) |
| `src/Requests.Infrastructure/Persistence/DbSeeder.cs` | Seed `Users` **before** `Requests`, inside the existing guard |

- [x] `OnModelCreating`: `b.Entity<User>().HasIndex(x => x.Username).IsUnique();` and the two FK configurations for `Request`
- [x] Extend the seeder's guard to `if (db.Users.Any() || db.Requests.Any()) return;` — a second start must re-seed neither table
- [x] Bulk-insert 1,000 `Users` rows with the same recursive-CTE technique as T3's `Requests` insert
- [x] Additionally seed ids `1` and `2` with a real, documented username and a password hashed through `IPasswordHasher` (built in T7) — id 1 = `Administrator`, id 2 = `User`. **Stubbed**: `IPasswordHasher` does not exist yet, so `PasswordHash` is a marked placeholder (`STUB-UNHASHED`) for ids 1 and 2 (usernames `admin`/`user`); T7 must replace it with a real hash and delete `requests.db` to reseed, per this task's own trap list
- [x] Delete `requests.db` before the next run — this is a model change (§4's standing trap), and it is the file T3 already produced without a `Users` table

**Done when**

- [x] `SELECT COUNT(*) FROM Users` returns `1000`
- [x] A second start leaves both counts unchanged
- [x] `SELECT Username FROM Users WHERE Id IN (1,2)` returns the two documented demo accounts (`admin`, `user`)
- [x] `SELECT COUNT(*) FROM Requests WHERE OwnerId = 1 OR AssignedToUserId = 1` still returns **372** — confirms the `Requests` CTE was untouched by this task
- [x] `SELECT COUNT(*) FROM Requests WHERE OwnerId = 2 OR AssignedToUserId = 2` — measured at **372** (same as id 1; the CTE's `(i % 1000) + 1` / `((i + 1) % 1000) + 1` formulas give every id 1–1000 the same 200-owned + assigned distribution). This is id 2's real, previously-unmeasured value — becomes the expected total for the regular-user demo login in T7/T9a/T10
- [x] **The FK is actually enforced, not just declared.** Verified: with `PRAGMA foreign_keys=ON` (what EF Core's SQLite provider sets on its own connections by default), `INSERT INTO Requests (..., OwnerId, ...) VALUES (..., 999999, ...)` is **rejected** with `FOREIGN KEY constraint failed`. (With the pragma off, as the bare `sqlite3` CLI defaults to, the same insert succeeds — confirming the enforcement is a real per-connection SQLite setting, not a no-op. The stray test row was deleted immediately after.)
- [x] `dotnet build` succeeds with the new FK in place

**Traps**

- **Seed `Users` first.** The FK on `Request.OwnerId`/`AssignedToUserId` depends on it; reversing the order fails the insert or (if FK enforcement is off) silently leaves orphaned references.
- **This invalidates T3's `requests.db`.** Regenerate it — do not debug "missing column" errors against the old file (ADR-010, §4).
- **Do not add navigation properties.** `Request` stays exactly as wide as before; only a schema-level FK is added (ADR-010).
- **Id 1's 372 should reproduce exactly** — the `Requests` CTE is unchanged, so this is a check, not a re-measurement. If it comes out different, something in this task changed the `Requests` insert and that is the bug to chase, not a seed quirk to shrug off. **Id 2's count has no prior value to match against** — whatever it measures to is correct; do not "fix" it to look like 372.

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

- [x] `RequestSortFields` — `requestNumber`, `status`, `requestType`, `createdAt`; directions `asc`, `desc`. Expose the permitted set as a case-insensitive `HashSet<string>`
- [x] `RequestSearchQuery` — a `record` **with a body and `init` properties**, implementing `IValidatableObject`. Defaults: `Page = 1`, `PageSize = 25`, `MaxPageSize = 100` as a `const` (ADR-003)
- [x] Validation, one rule per row of `REQ-F-007`'s table:

| Rule | Error member name |
|---|---|
| Every supplied `Status` passes `Enum.IsDefined` | `status` |
| `RequestType`, when supplied, passes `Enum.IsDefined` | `requestType` |
| `CreatedFrom` is not later than `CreatedTo` | `createdFrom` |
| `SortBy`, when supplied, is in `RequestSortFields` | `sortBy` |
| `SortDirection`, when supplied, is `asc` or `desc` | `sortDirection` |
| `Page` ≥ 1 | `page` |
| `1` ≤ `PageSize` ≤ `100` | `pageSize` |

**Done when** — [x] `dotnet build` succeeds and each row of `REQ-F-007`'s invalid-input table maps to exactly one rule above.

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

- [x] Replace both interfaces and the service
- [x] Delete the test file
- [x] Move the in-memory permission filter **out** of `RequestService` — it becomes part of the query in T6

**Done when** — `GetAllAsync` and `GetRequestsAsync` appear nowhere in the solution *(checked after T6/T7, since `RequestRepository.cs` and `RequestsController.cs` are the callers still to be rewritten there — this task's own build-gate note says as much)*:

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

- [x] Inject `RequestsDbContext` **and `ICurrentUser`**
- [x] Compose in exactly this order — the order is what makes `REQ-N-001` hold:

| # | Step | Serves |
|---|---|---|
| 1 | `AsNoTracking()` | read path |
| 2 | **Permission restriction, first and unconditional** — `OwnerId == UserId \|\| AssignedToUserId == UserId`, skipped only when `IsAdministrator` | `REQ-F-008`, `REQ-F-009` |
| 3 | Each filter added **only when a value was supplied** | `REQ-F-001`–`REQ-F-004`, `REQ-F-006` |
| 4 | `CountAsync` → the total | `REQ-N-002` |
| 5 | Ordering, then `Skip`/`Take` | `REQ-F-005`, `REQ-N-002` |
| 6 | `Select` to `RequestDto` **inside** the query | `REQ-N-001` |
| 7 | Materialise | |

- [x] Partial match: `x.RequestNumber.Contains(value)` (ADR-006)
- [x] Date bounds: `CreatedAt >= from.Date` and `CreatedAt < to.Date.AddDays(1)`, both normalised to UTC with `DateTime.SpecifyKind`
- [x] Sort: a `switch` over `RequestSortFields`, each arm a typed `OrderBy`/`OrderByDescending` **plus `ThenBy(x => x.Id)`**. Default: `CreatedAt` descending, `Id` as tiebreaker
- [x] `status` and `requestType` sort by the **enumeration's underlying value**, which is what ordering on the property gives: `New → InProgress → Completed → Cancelled`, the request's life cycle, not alphabetical order. This is a decision, not a side effect — it goes in the README assumptions (T12)

**Done when**

- [x] `dotnet build` succeeds — **the first green build since T5** · **Plan contradiction found and recorded, not silently patched:** this did not actually hold at T6 alone. `Requests.Api/Controllers/RequestsController.cs` still called the removed `IRequestService.GetRequestsAsync` — it is in T7's file table, not T6's — so `dotnet build` failed with `CS1061` at this point regardless of how correctly T6 itself was done. Confirmed green only after T7's controller rewrite landed too; T5's `git grep` gate (which has the same dependency) is likewise confirmed clean only from that point on.
- [x] The plan for the permission path is the one below. Capture it; ADR-001 requires it quoted in the README:

```bash
sqlite3 src/Requests.Api/requests.db "EXPLAIN QUERY PLAN SELECT * FROM Requests WHERE OwnerId = 1 OR AssignedToUserId = 1 ORDER BY CreatedAt DESC LIMIT 25;"
```

```
MULTI-INDEX OR
  INDEX 1
    SEARCH Requests USING INDEX IX_Requests_OwnerId_CreatedAt (OwnerId=?)
  INDEX 2
    SEARCH Requests USING INDEX IX_Requests_AssignedToUserId_CreatedAt (AssignedToUserId=?)
USE TEMP B-TREE FOR ORDER BY
```

**Read the plan, do not just check that the word INDEX appears.** Each wrong outcome has one cause:

| What the plan says instead | What it means |
|---|---|
| `SEARCH … USING INDEX IX_Requests_Status` | A single-column index on `Status` or `RequestType` was added back in T2. The planner prefers it and abandons the permission path (§3.3) |
| `SCAN Requests USING INDEX IX_Requests_CreatedAt` | The permission predicate is not selective enough to be worth using — the owner spread in T3 was left at five. Scanning in date order and filtering really is cheaper at that distribution, so the planner is right and the seed is wrong |
| `SCAN Requests` with no index named | Neither composite index exists. Check `OnModelCreating`, and check that `requests.db` was deleted after the model change (§4) |

`USE TEMP B-TREE FOR ORDER BY` **is expected and is not a defect.** The `OR` forces a sort over the union of two index lookups; it is cheap because that union is 372 rows, which is exactly what the owner spread buys. The administrator path is different and also correct: `SCAN Requests USING COVERING INDEX IX_Requests_CreatedAt`, because an administrator has no restriction to narrow on and ordering by the index avoids the sort entirely.

- [x] Measured on the T3 seed, every query above runs in **under half a millisecond**, and the plan is unchanged after `ANALYZE`. A filtered search in the tens of milliseconds means one of the three rows above applies. *(Plan verified exactly as specified — `MULTI-INDEX OR` over the two composite indexes, `USE TEMP B-TREE FOR ORDER BY` — via `sqlite3` against the real seeded `requests.db`.)*

*(No `sqlite3` on the machine? Add `.LogTo(Console.WriteLine)` to the context options to capture EF's real SQL, then run the same `EXPLAIN QUERY PLAN` through a `SqliteCommand` in a scratch test.)*

**Traps**

- **`string.Contains`, never `EF.Functions.Like`.** `LIKE` makes `%` and `_` wildcards in user input, so a user typing `%` matches every row (§4, ADR-006).
- **`CreatedAt < to.Date.AddDays(1)`.** `<=` on the date excludes everything created on the end day — the whole of `REQ-F-003`'s clarified upper bound (§4, `[CLARIFIED #4]`).
- **Never `WHERE (@x IS NULL OR Column = @x)`.** A blanket predicate defeats the indexes T2 just created (§3.3 step 3).
- **`CountAsync` runs before `Skip`/`Take`**, and `totalCount` is the permission-restricted count — never `items.Count` (§3.4a).
- **Project inside the query.** A `Select` after `ToListAsync` pulls whole entities across the boundary and breaks `REQ-N-001`'s acceptance criterion.
- **The sort key set must not drift from `RequestSortFields`.** A key that validates in T4 but has no `switch` arm here falls through to the default ordering silently — the user gets a different order than the one requested and nothing reports it. Both sides read the same constants.
- **`ThenBy(x => x.Id)` is not decoration.** Without a tiebreaker, `REQ-F-005`'s determinism criterion fails intermittently and only under paging.
- **The application will return 500 on every request until T7.** `RequestRepository` now depends on `ICurrentUser`, which nothing registers yet. The build is green and the app starts; only request handling fails. Expected — do not debug it, continue to T7.

---

## T7 — API: authentication, login, controller, pipeline

**Serves** `REQ-F-007`, `REQ-F-010`–`REQ-F-013`, `REQ-F-103`, `REQ-D-002` · **Design** §3.4, §3.4a, ADR-004, ADR-008, ADR-009, §4 · **Rewritten for `[STAKEHOLDER #1]`** — the header scheme this task originally specified (ADR-002) was never built; this replaces that plan, not built code

**Files**

| File | Change |
|---|---|
| `src/Requests.Application/Auth/IAuthService.cs`, `AuthService.cs` | **New** — `LoginAsync(LoginCommand) → LoginResult?`; orchestrates the three files below. Plain class, no mediator (§3.2) |
| `src/Requests.Infrastructure/Auth/PasswordHasher.cs` | **New** — `IPasswordHasher` wrapping `PasswordHasher<User>` (ADR-009) |
| `src/Requests.Infrastructure/Auth/JwtTokenGenerator.cs` | **New** — `IJwtTokenGenerator`, signs a token with `NameIdentifier` and `Role` claims from `Jwt:Key`/`Issuer`/`Audience`/`ExpiryMinutes` (ADR-008) |
| `src/Requests.Infrastructure/Repositories/UserRepository.cs` | **New** — `IUserRepository.FindByUsernameAsync` |
| `src/Requests.Api/Controllers/AuthController.cs` | **New** — `[AllowAnonymous]`, `[HttpPost("login")]`; injects **only** `IAuthService`, same shape as `RequestsController` (ADR-008) |
| `src/Requests.Api/Controllers/RequestsController.cs` | `[Authorize]`; one `[HttpGet]` taking `[FromQuery] RequestSearchQuery` — **unchanged from the original plan; it never depended on how identity arrived** |
| `src/Requests.Api/Program.cs` | `AddAuthentication().AddJwtBearer(...)`, authorization, CORS, `JsonStringEnumConverter`, `Jwt` options binding |
| `src/Requests.Api/appsettings.json` | **New `Jwt` section** — `Key`, `Issuer`, `Audience`, `ExpiryMinutes` |

> `ClaimsCurrentUserAccessor.cs` is **not in this table on purpose** — ADR-008 confirms it is unchanged. It still reads `ClaimTypes.NameIdentifier` and `ClaimTypes.Role` off `HttpContext.User`; only what populates `HttpContext.User` (JWT bearer instead of a header handler) is different.

- [x] `AuthService.LoginAsync`: find the user by username (`IUserRepository`) → if found, verify the password (`IPasswordHasher`) → on success, issue a token (`IJwtTokenGenerator`) and return `LoginResult` with `Token`, `ExpiresAt`, `Role`, **and `Username`** (§3.2). Any failure — user not found, or `PasswordHasher<User>.VerifyHashedPassword` returns anything but `Success` — returns `null`; **never** a raw `==` on hashes (§4)
- [x] `AuthController.Login`: `null` from `AuthService` → the same generic 401 for both "unknown username" and "wrong password" (`REQ-F-012`) — the controller does not know or care which one happened, because `AuthService` already collapsed them
- [x] `JwtTokenGenerator`: claims are `ClaimTypes.NameIdentifier` (user id) and `ClaimTypes.Role` (`"User"` or `"Administrator"`); expiry from `Jwt:ExpiryMinutes` (`REQ-N-005`)
- [x] `Program.cs`: `AddAuthentication(JwtBearerDefaults.AuthenticationScheme).AddJwtBearer(o => { o.TokenValidationParameters = new() { ValidateIssuer = true, ValidIssuer = jwt.Issuer, ValidateAudience = true, ValidAudience = jwt.Audience, ValidateLifetime = true, IssuerSigningKey = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(jwt.Key)), ClockSkew = TimeSpan.Zero }; })` — **every one of these five fields matters** (ADR-008); `AddJsonOptions(o => o.JsonSerializerOptions.Converters.Add(new JsonStringEnumConverter()))`; CORS policy from `Cors:AllowedOrigins`; `UseCors` **after** `UseRouting` and **before** `UseAuthentication`/`UseAuthorization`

**Done when** — every line below behaves as stated. These are `REQ-F-007`, `REQ-F-012` and `REQ-F-013` in executable form. `$USER_TOKEN`/`$ADMIN_TOKEN` are the `token` field from the two login calls, using the two demo accounts T3a seeded.

```bash
curl.exe -s -X POST "http://localhost:60702/api/auth/login" -H "Content-Type: application/json" -d "{\"username\":\"<admin demo>\",\"password\":\"<seeded>\"}"  # 200, token + username + role "Administrator"
curl.exe -s -X POST "http://localhost:60702/api/auth/login" -H "Content-Type: application/json" -d "{\"username\":\"<admin demo>\",\"password\":\"wrong\"}"      # 401, generic message
curl.exe -s -X POST "http://localhost:60702/api/auth/login" -H "Content-Type: application/json" -d "{\"username\":\"nobody\",\"password\":\"x\"}"                # 401, the SAME generic message

curl.exe -i "http://localhost:60702/api/requests"                                                            # 401, no token
curl.exe -s "http://localhost:60702/api/requests" -H "Authorization: Bearer %USER_TOKEN%"                   # 200, regular-user total (re-measured in T3a)
curl.exe -s "http://localhost:60702/api/requests" -H "Authorization: Bearer %ADMIN_TOKEN%"                  # 200, totalCount = 200000
curl.exe -s "http://localhost:60702/api/requests?status=99"        -H "Authorization: Bearer %USER_TOKEN%"  # 400, errors.status
curl.exe -s "http://localhost:60702/api/requests?sortBy=ownerName" -H "Authorization: Bearer %USER_TOKEN%"  # 400, errors.sortBy
curl.exe -s "http://localhost:60702/api/requests?pageSize=101"     -H "Authorization: Bearer %USER_TOKEN%"  # 400, errors.pageSize
curl.exe -s "http://localhost:60702/api/requests?createdFrom=2026-09-01&createdTo=2026-01-01" -H "Authorization: Bearer %USER_TOKEN%"  # 400
curl.exe -s "http://localhost:60702/api/requests?page=100000"      -H "Authorization: Bearer %USER_TOKEN%"  # 200, items [], totalCount correct
curl.exe -s "http://localhost:60702/api/requests?requestNumber=000123" -H "Authorization: Bearer %USER_TOKEN%" # matches REQ-000123 mid-string
```

- [x] The regular-user and Administrator tokens return **different result sets and different totals** — the decisive acceptance test of `REQ-F-010`, now demonstrated through real login instead of a header value. Measured: `user`/`User123!` → `totalCount: 372`; `admin`/`Admin123!` → `totalCount: 200000`
- [x] `status` renders as `"InProgress"`, not `2`
- [x] Timestamps end in `Z`
- [x] Swagger still loads at `/swagger` (200), and a Bearer security scheme is wired so its "Authorize" button accepts a token pasted from a login call

**Traps**

- **The two login-failure branches must return the identical body.** A different message for "unknown user" versus "wrong password" leaks which usernames exist — exactly what `REQ-F-012`'s acceptance criterion forbids.
- **Verify through `IPasswordHasher.Verify`, never `hash == storedHash`.** `PasswordHasher<T>` salts its output, so the same password hashes differently each time; a direct comparison rejects every correct password (§4).
- **`Jwt:Key` must be ≥ 256 bits for HS256** (§4) — a short key throws at startup, not at first login, which is a confusing place to first see it.
- **`ClockSkew = TimeSpan.Zero` is not optional** (ADR-008, §4). The default 5-minute tolerance lets a token expired by less than that still validate — T8a's expired-token test would then get 200 instead of 401, and appear to pass for the wrong reason.
- **Set `ValidateIssuer`/`ValidateAudience`/`ValidateLifetime` explicitly.** Leaving any at their default disables that check silently — a token would validate on signature alone, which is weaker than `REQ-N-005` intends.
- **Register `IHttpContextAccessor`**, or `ClaimsCurrentUserAccessor` resolves a null context at runtime only.
- **Without `JsonStringEnumConverter` the table renders `Status: 2`** and the client's string unions never match (§4).
- **The CORS policy must allow the `Authorization` header, not only the origin** (§4). A bearer token makes every call a preflighted request; a policy with `WithOrigins(...)` alone returns no `Access-Control-Allow-Headers` and the browser blocks it. **Every `curl` line above will still pass** — this failure exists only in a browser, and surfaces in T9a as an unexplained network error against a server that all its own tests just cleared.
- `UseCors` placed after `UseAuthorization` fails the preflight the same way, and just as invisibly.
- **T3a's demo passwords must actually be seeded through `IPasswordHasher` built here.** If T3a ran first with a stub, come back and re-seed once this task's hasher exists (T3a's own trap list says the same thing from the other side). **Done**: `requests.db` was deleted and reseeded; `DbSeeder.Seed` now takes `IPasswordHasher` and hashes the two demo passwords (`admin`/`Admin123!`, `user`/`User123!`) for real, instead of writing the T3a stub marker.
- **This task's own `requestNumber=000123` example, run with `$USER_TOKEN`, will not actually match anything** once permission scoping is real: id 2 owns/assigns requests from the CTE's `(i % 1000) + 1` formula, and `REQ-000123` belongs to owner 124 / assignee 125, neither of which is 2. The mid-string match itself was verified instead with the Administrator token (finds `REQ-000123` correctly); a regular user's `requestNumber=000123` search correctly returns an empty page rather than a 500 or a leak, which is what `REQ-F-008` actually requires. The curl example's implicit assumption — that the logged-in demo user owns that specific row — just doesn't hold under the real 1000-owner spread.

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

- [x] The six of §3.6, no more:

| # | Test | Covers | Level |
|---|---|---|---|
| 1 | A regular user sees only owned or assigned requests | `REQ-F-008` | repository |
| 2 | An administrator sees all requests | `REQ-F-009` | repository |
| 3 | `000123` finds `REQ-000123` — a mid-string match | `REQ-F-001` | repository |
| 4 | Multiple statuses filter correctly **as a regular user** | `REQ-F-002`, `REQ-F-008` | repository |
| 5 | Paging returns the right rows **and the right total** | `REQ-N-002` | repository |
| 6 | An inverted date range is rejected | `REQ-F-007` | validation |

- [x] Tests 1 and 2 run **the same query** under two identities and assert that both the rows **and the totals** differ — that is the decisive test, not two unrelated assertions
- [x] Test 5 asserts `TotalCount > Items.Count` on a page-sized result
- [x] **Test 4 seeds at least one request that matches the status filter but belongs to another user**, and asserts it is absent from **both** `Items` and `TotalCount`. Without that row the test exercises an `IN` clause and proves nothing about the combination `REQ-F-008` actually requires (§3.6)

**Done when** — [x] `dotnet test` reports **6 passed**, and passes again on a second run (no cross-test leakage). Confirmed on two consecutive runs.

**Traps**

- **Each test owns its own connection and database.** A shared in-memory SQLite database leaks rows between tests and produces order-dependent failures.
- **Hold the connection open.** `Data Source=:memory:` discards the database the moment the last connection closes — including between `EnsureCreated()` and the first query.
- **No absolute dates.** Test data is created inside the test; assertions derive their bounds at run time (§3.3).
- Test 6 needs no database — it validates `RequestSearchQuery` directly.

---

## T8a — Authentication tests

**Serves** `REQ-F-012`, `REQ-F-013` · **Design** §3.6 · **`[STAKEHOLDER #1]`**

Kept separate from T8's six — they test the auth pipeline (T7), not the search feature, and T8's "why these six" reasoning is specifically about search. Both run through `WebApplicationFactory<Program>`, since `REQ-F-012`/`REQ-F-013` are pipeline behaviour, not repository behaviour.

**Files** — `tests/Requests.Tests/AuthTests.cs` *(new)*

- [x] Login with the seeded Administrator's correct credentials → 200 with a non-empty `token`
- [x] Login with a wrong password → 401 with the generic message; login with an unknown username → the **same** 401 body (asserted equal, not just both 401 — this is what actually tests `REQ-F-012`'s no-enumeration criterion)
- [x] `GET /api/requests` with no `Authorization` header → 401
- [x] `GET /api/requests` with a well-formed but expired token (construct one directly with `JwtTokenGenerator` and a negative expiry, rather than waiting out a real one) → 401. **This only works because T7 sets `ClockSkew = TimeSpan.Zero`** — with the library's 5-minute default, a token expired by 1 second would still validate and this assertion would fail for the wrong reason
- [x] `GET /api/requests` with a valid token → 200

**Done when** — [x] `dotnet test` reports **8 passed** (T8's six plus these two), and passes again on a second run. Confirmed on two consecutive runs. *(Implementation note: the five bullets above are covered by exactly two `[Fact]` methods — `Login_SucceedsForCorrectCredentials_AndReturnsIdenticalBodyForBothFailureCases` and `RequestsEndpoint_EnforcesBearerAuthentication` — matching this task's own "two authentication tests" framing in the cut-order table, rather than one method per bullet.)*

**Traps**

- **Asserting "401" for both wrong-password and unknown-username is not enough.** Assert the response **bodies are identical** — that is the actual content of `REQ-F-012`'s criterion, and a test that only checks the status code would pass even if the two cases leaked different messages.
- **Do not wait out a real token expiry.** Construct an already-expired one directly, or the test suite gains a multi-minute sleep.

---

# Phase B — Client

## T9 — Scaffold, configuration, API client

**Serves** `REQ-F-107`, `REQ-D-002`, `REQ-N-002` · **Design** ADR-005, ADR-007, §3.5

**Files** — new, under `frontend/`

- [x] `ng new frontend --style=scss --ssr=false`, then `ng add @angular/material`
- [x] `public/site.config.json` (Angular 18+; `src/assets/` on earlier versions) — `{ "apiBaseUrl": "http://localhost:60702/api" }`
- [x] `core/config/` — `app-config.service.ts` reading that file once at bootstrap, `api-base-url.token.ts` exposing the address by injection
- [x] Wire the initialiser in `app.config.ts` so the application does not render until configuration has loaded — **deviation**: this Angular version (18.2) has no `provideAppInitializer`, added in v19; used the `APP_INITIALIZER` multi-token instead, same effect
- [x] `core/models/` — `request.model.ts`, `search-query.model.ts`, `paged-result.model.ts`, mirroring §3.4a exactly. Enumerations are **string unions**, not numbers
- [x] `core/services/requests-api.service.ts` — one `search(query)` method building the query string per §3.4a
- [x] `provideNativeDateAdapter()` in `app.config.ts`

> `core/services/auth.service.ts`, `core/interceptors/auth.interceptor.ts` and `core/guards/auth.guard.ts` are **not** built here — they move to T9a as their own task (`[STAKEHOLDER #1]` replaces the `current-user.service.ts` + `identity.interceptor.ts` this step originally specified, before either was built).

**Done when**

- [x] The client boots *(confirmed — `ng serve`, no console errors, `site.config.json` fetched with 200)*; **a search returning rows is not yet checked** — no page issues one yet (T10), and `/api/requests` now requires a Bearer token that only T9a's interceptor supplies. Not a defect here; this bullet completes once T9a and T10 land
- [x] Editing `apiBaseUrl` in `site.config.json` and reloading retargets the client **without a rebuild** (ADR-007) — verified at the architecture level: the value is fetched at runtime via `HttpBackend` (bypassing interceptors) and is never inlined into the bundle. Not re-verified against a built `dist/` output, since nothing yet consumes `API_BASE_URL` to call the API visibly
- [x] No literal API address anywhere but that file: `git grep -n --untracked "localhost:60702" frontend/src` returns nothing — confirmed clean

**Traps**

- **Repeated `status` parameters use `params.append`, not `params.set`.** `set` keeps only the last value and multi-select silently filters by one status (§3.4a).
- **Format dates as local `yyyy-MM-dd`, never `toISOString().slice(0,10)`.** The range picker yields local midnight; at UTC+3 `toISOString` moves it to the previous day, and the user sees a range shifted by one day with no error. This is the client-side twin of §4's "incoming date bounds are normalised to UTC".
- **A configuration load failure is a startup error, not a fallback to some default address** (ADR-007).
- **Load `site.config.json` through `HttpBackend`, not the intercepted `HttpClient`.** Once T9a's auth interceptor exists, it would otherwise decorate a static-asset request with a stale or absent `Authorization` header, and the moment the interceptor needs anything from configuration the bootstrap becomes circular.
- **Without `provideNativeDateAdapter` the date-range input fails at runtime only** (§4).

---

## T9a — Login page, route guard, auth interceptor

**Serves** `REQ-F-108`, `REQ-F-109` · **Design** ADR-008, §3.5 · **`[STAKEHOLDER #1]`**

**Files** — new, under `frontend/src/app/`

| File | Change |
|---|---|
| `core/models/user.model.ts` | **New** — the login response shape: `token`, `username`, `role`, `expiresAt` (mirrors §3.4a exactly — nothing here is decoded from the JWT) |
| `core/services/auth.service.ts` | **New** — `login()`, `logout()`, the current `token`/`username`/`role`, `isAuthenticated()`; persists to `sessionStorage` (ADR-008) |
| `core/interceptors/auth.interceptor.ts` | **New** — attaches `Authorization: Bearer <token>`; on a `401` response, calls `AuthService.logout()` |
| `core/guards/auth.guard.ts` | **New** — functional guard; no valid session → redirect to `/login` |
| `features/login/login-page/` | **New** — `LoginPageComponent`: username/password form, calls `AuthService.login()`, shows the login error |
| `app.routes.ts` | Add `/login` (no guard); guard the request-search route |

- [ ] `AuthService.login()` stores `token`, `username`, `role`, `expiresAt` **read directly off the `POST /api/auth/login` response body** (§3.4a) into `sessionStorage` — no JWT decoding anywhere on the client
- [ ] `auth.interceptor.ts` skips the login request itself (no token to attach yet) and the `site.config.json` fetch (T9's trap)
- [ ] `LoginPageComponent`: on a 401 from login, show the server's generic message (`REQ-F-108`); on success, navigate to the search page
- [ ] A visible "logged in as `<username>` (`<role>`) · Logout" element, reading `AuthService.username`/`role` directly, placed wherever T10's search page hosts it

**Done when**

- [ ] Visiting the search route while logged out redirects to `/login`
- [ ] Logging in with each of T3a's two demo accounts, in turn, reaches the search page and every subsequent API call carries that account's token
- [ ] Logging in with a wrong password shows the error and does not navigate
- [ ] Logout clears the session and returns to `/login`; the guard then blocks the search route again

**Traps**

- **The interceptor must not attach a token to the login request.** A stale token on `POST /api/auth/login` is harmless to the server (the endpoint is `[AllowAnonymous]`) but signals a bug if it happens.
- **`username`/`role` come from the response body, never from decoding the token.** The server re-derives the real role from the token's claims on every request (`REQ-F-010`) — the client's copy is a display convenience, not an enforcement point, and decoding it client-side would be an unnecessary dependency for a value the response already hands over.
- **`sessionStorage`, not `localStorage`** (ADR-008) — carries across a reload within the tab, clears on tab close.
- **A 401 from an expired token must route through `logout()`, not just fail silently.** Otherwise the search page shows T10's error state forever instead of returning to `/login` (`REQ-F-109`).

---

## T10 — Search page, results table, three states

**Serves** `REQ-F-101`–`REQ-F-106`, `REQ-N-001`, `REQ-N-002` · **Design** §3.5, §4

**Files** — `frontend/src/app/features/request-search/` — two components, per §3.5

- [ ] `RequestSearchPageComponent` (stateful) — owns the filter form, sort state, page state, and the loading / error / results state; hosts the filter controls directly
- [ ] `RequestResultsTableComponent` (presentational) — inputs `rows`, `totalCount`, `page`, `pageSize`, `sort`, `loading`, `errorMessage`; outputs `sortChange`, `pageChange`; **holds no state and issues no HTTP**
- [ ] Controls, one per requirement: text input (`REQ-F-001`), `mat-select multiple` (`REQ-F-002`), `mat-date-range-input` (`REQ-F-003`), `mat-select` (`REQ-F-004`), `matSort` (`REQ-F-102`), `mat-table` (`REQ-F-103`), `mat-paginator` (`REQ-N-002`)
- [ ] The three states, visually distinct: `mat-progress-bar` (`REQ-F-104`), an error block rendering the `errors` map field by field (`REQ-F-105`), an explicit no-results message (`REQ-F-106`)
- [ ] A clear-filters control returning to the unfiltered state (`REQ-F-101`)
- [ ] Hosts T9a's "logged in as `<username>` (`<role>`) · Logout" element (`[STAKEHOLDER #1]`); `REQ-F-010` is now demonstrated by logging out and back in as the other demo account, not by an in-page switcher
- [ ] Flow: any filter / sort / page change → page resets to 1 on a filter change → debounce → request issued, superseding and cancelling any in flight

**Done when** — all four states seen against the running API:

- [ ] **Loading** — the progress bar is visible while a request is in flight
- [ ] **Results** — the paginator's page count reflects `totalCount`, not the 25 rows on screen
- [ ] **Error** — `sortBy=ownerName` (or any 400) renders the field-level message, never a blank screen
- [ ] **Empty** — a `requestNumber` filter that matches nothing (e.g. `999999`) shows the no-results message, clearly distinct from the other two. *(Revised from the original plan's "log in as an owner-of-nothing user": with real accounts, every seeded login owns something — a filter-driven empty result is the more direct demonstration of `REQ-F-106` regardless, since it does not depend on the permission boundary at all)*
- [ ] Logging out and back in as the Administrator demo account changes the row count **and the total** on screen, versus the regular-user demo account — the decisive contrast of `REQ-F-010`, now driven by T9a's real login instead of a switcher

**Traps**

- **The paginator is zero-based and the API is one-based** (§4). `PageEvent.pageIndex` is `0` on the first page, and `REQ-F-007` defines `page=0` as invalid input — so a direct binding opens the screen on a 400 before the user has touched anything. Convert in both directions: `page: pageIndex + 1` going out, `pageIndex: page - 1` coming back.
- **A cleared sort sends no sort parameters at all** (§4). `matSort`'s third click emits `direction: ''`, which serialises to `sortDirection=` and is rejected with 400. Either set `matSortDisableClear`, or omit both `sortBy` and `sortDirection` when the direction is empty.
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

**Serves** `REQ-D-002`–`REQ-D-007` · **Design** §5 step 8, ADR-001, ADR-002 *(superseded)*, ADR-006, ADR-007, ADR-008, ADR-009, ADR-010

**Files** — `README.md` *(new, repo root)*

One section per requirement, so the matrix is checkable by reading:

- [ ] **How to run** backend and frontend (`REQ-D-002`) — including where the API address is changed, and the two demo logins from T3a (username/password for the Administrator and regular-user accounts) so a reviewer can actually sign in
- [ ] **How to run the tests** (`REQ-D-003`) — now **8** (T8's six plus T8a's two)
- [ ] **Technologies and why** (`REQ-D-004`) — SQLite in place of the supplied InMemory provider needs its justification here (ADR-001), as does Angular (ADR-005)
- [ ] **Assumptions** (`REQ-D-005`) — its acceptance criterion is that **every `[DERIVED]` requirement appears with its rationale**. That is `REQ-N-002` (paging) and `REQ-N-003` (time handling) — `[STAKEHOLDER #1]`'s requirements are a separate category (see below) and do not count against this criterion. Plus:
  - case handling on the partial match follows the store's collation and is **unspecified** (ADR-006)
  - **the `Jwt:Key` in `appsettings.json` is a development convenience, committed only because this is a seeded demo database, and why that is not a production posture** (ADR-008 — this replaces the old "header scheme is not secure" note, which described a scheme that was never built)
  - password verification uses `PasswordHasher<User>` rather than full ASP.NET Core Identity, and why (ADR-009)
  - tokens are signed **HS256**, not RS256, because nothing outside this one service verifies a token yet — and RS256 is named as the next step if `REQ-A-001`'s future services ever need to (ADR-008)
  - the client stores the session in `sessionStorage`, not `localStorage`, and why (ADR-008)
  - the seed is 200,000 rows: it *demonstrates*; the *design* is what holds at millions (§3.3)
  - sorting by status or request type follows the **enumeration's life-cycle order**, not alphabetical order (T6)
  - **owners and assignees now identify real `Users` rows, backed by a foreign key (ADR-010, `[STAKEHOLDER #1]`)** — this replaces the original "identifiers only, no `User` table" assumption, which `requirements.md`'s `[STAKEHOLDER #1]` entry explicitly reverses
  - id 1's and id 2's measured request counts from T3a (the login demo's expected totals)
  - the `EXPLAIN QUERY PLAN` output captured in T6, with the measured timings and what they are evidence *of*: the work the database does per search does not grow with the table, which is `REQ-N-001`'s actual criterion
- [ ] **One technical decision with real alternatives** (`REQ-D-006`) — **ADR-008 is now the intended answer**: it documents a decision (ADR-002) that was later reversed, with the reversal itself on record — a stronger demonstration of reasoning under changing constraints than an unreversed ADR can give. ADR-002 and ADR-007 remain strong alternatives if a single, simpler example is preferred
- [ ] **What was not completed and how it would continue** (`REQ-D-007`) — every cut actually taken from the cut-order table, plus the standing next steps the design already names: keyset pagination if access turns into deep scrolling (ADR-003), a trigram index or search engine for the substring scan (ADR-006), FluentValidation to close the non-HTTP caller gap (ADR-004), full ASP.NET Core Identity if self-registration or external login are ever added (ADR-009), RS256 if a second service ever needs to verify a token independently (ADR-008)

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
| `REQ-F-011` | T3a `[STAKEHOLDER #1]` |
| `REQ-F-012` | T3a, T7, T8a, T9a `[STAKEHOLDER #1]` |
| `REQ-F-013` | T7, T8a, T9a `[STAKEHOLDER #1]` |
| `REQ-F-101` | T10 |
| `REQ-F-102` | T10 |
| `REQ-F-103` | T7, T10 |
| `REQ-F-104` | T10 |
| `REQ-F-105` | T4, T10 |
| `REQ-F-106` | T10 |
| `REQ-F-107` | T9 |
| `REQ-F-108` | T9a `[STAKEHOLDER #1]` |
| `REQ-F-109` | T9a, T10 `[STAKEHOLDER #1]` |
| `REQ-N-001` | T2, T3, T6, T10 |
| `REQ-N-002` | T4, T6, T9, T10 |
| `REQ-N-003` | T2, T6, T9 |
| `REQ-N-004` | T7 `[STAKEHOLDER #1]` |
| `REQ-N-005` | T7, T9a `[STAKEHOLDER #1]` |
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
