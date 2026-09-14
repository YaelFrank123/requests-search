# Design — Part A: Requests Search & Filtering

> **This document states HOW.** Every section cites the requirement IDs it serves.
> `requirements.md` is the source of truth. Where this document contradicts it, this document is wrong and gets corrected.
> Scope: Part A only. Parts B and C are designed in `design-architecture-cloud.md`.

---

## 1. Principles

These constrain every decision below.

1. **Dependency rule.** `Domain ← Application ← Infrastructure ← Api`. No project references outward. The existing solution already satisfies this and it is preserved.
2. **Permission restriction is part of the query.** Serving `REQ-F-010` means the restriction is composed into the data-store query, never applied to an already-materialised result. This is also what makes `REQ-N-001` achievable.
3. **No unbounded query.** Any code path returning a collection is paged (`REQ-N-002`).
4. **Invalid input is rejected, never absorbed.** No silent defaults, no partial searches (`REQ-F-007`).
5. **Every alternative that was real gets an ADR.** Shortcuts are documented, not hidden — this feeds `REQ-D-006` and `REQ-D-007`.

---

## 2. Decisions and alternatives (ADRs)

### ADR-001 — Data store provider
*Serves `REQ-N-001`, `REQ-F-001`, `REQ-N-002`*

**Context.** The supplied repository uses the EF Core **InMemory** provider with 500 seeded rows. `REQ-N-001` requires the system to be designed for millions of rows, and its acceptance criteria are stated in terms of what crosses the store→application boundary.

**Alternatives.**

| Option | For | Against |
|---|---|---|
| **A** Keep InMemory | Zero setup | InMemory evaluates everything client-side and **never raises a translation error**, so the safety net that catches a query which cannot run in a database is absent. Indexes are accepted but ignored. `REQ-N-001` becomes an assertion that cannot be checked. |
| **B** SQLite file | Real query translation and real index enforcement; no external dependency, so `REQ-D-002` stays a one-line instruction; large seeds are practical | `LIKE '%x%'` still scans (see ADR-006); ASCII-only case rules |
| **C** PostgreSQL / SQL Server | Closest to production; trigram indexes would make `REQ-F-001` indexable | Requires the reviewer to run a container or a server before anything works, which weighs directly against `REQ-D-002` |

**Decision: B — SQLite**, schema created at startup via `EnsureCreated()`.

**Consequences.**
- **No migrations.** `EnsureCreated()` builds the schema, including indexes declared in `OnModelCreating`. EF migrations are neither required nor added.
- `REQ-N-001` becomes verifiable: `EXPLAIN QUERY PLAN` shows whether an index is used. That output is quoted in the README.
- The production recommendation remains a managed relational database — see `design-architecture-cloud.md`. The gap between "what runs locally" and "what is recommended in production" is itself documented in the README.

### ADR-002 — Source of the acting identity
*Serves `REQ-F-010`, `REQ-F-008`, `REQ-F-009`*

**Context.** `REQ-F-010` requires server-side enforcement. Authentication is explicitly out of scope. The supplied controller reads `X-User-Id` / `X-Is-Admin` directly and **falls back to user 1 when the header is absent** — a silent identity assignment that makes the decisive acceptance test in `REQ-F-010` meaningless.

**Alternatives.**

| Option | For | Against |
|---|---|---|
| **A** Keep header parsing in the controller | Nothing to build | Identity is a controller detail; the silent fallback remains; nothing separates "who is calling" from "how we learned it" |
| **B** A real authentication scheme over the same headers, producing a `ClaimsPrincipal`, consumed through an `ICurrentUser` abstraction | Standard pipeline; missing identity yields 401 rather than a silent default; the layers below never learn where identity came from | The credential itself is still unverified |
| **C** Full sign-in with issued tokens | Verified credentials | **Out of scope.** Requires a user store, password handling and token issuance, none of which the brief asks for |

**Decision: B.**

**The counter-argument, recorded as required by the specification.** A strict reading says enforcement against an identity the client asserts is hollow: anyone may send `X-Is-Admin: true`. This is true, and it is the reason option C exists. It was rejected because the brief asks for *permission enforcement*, not *identity verification*, and because the derivation rule adopted in `requirements.md` admits only **necessary** consequences — authorization can be enforced against a trusted identity source without building a sign-in mechanism. In the target architecture identity arrives from an identity provider outside this service entirely (`design-architecture-cloud.md`).

**Consequences.**
- The README states plainly that the header scheme is **not secure** and why that is acceptable here.
- Swapping to real tokens later replaces the scheme registration only. `ICurrentUser` and its accessor are unchanged, because a token-based middleware populates `HttpContext.User` exactly as this scheme does.
- This ADR is the intended answer to `REQ-D-006`.

### ADR-003 — Paging strategy
*Serves `REQ-N-002`, `REQ-N-001`*

**Alternatives.** *Offset* (`Skip`/`Take`) versus *keyset/seek* pagination.

**Decision: offset.** `REQ-N-002` requires the response to carry the **total number of matching requests** so the client can present page navigation. Keyset pagination provides neither a total count nor the ability to jump to an arbitrary page, so it cannot satisfy that criterion.

**Consequences, stated honestly.**
- At great depth the database still walks the skipped rows. This is acceptable for a filtered search screen, where users narrow rather than page to row 900,000.
- **The filtered `COUNT` is the dominant cost at scale, not `Skip`/`Take`.** This is the first thing to revisit if the endpoint is ever slow, and the README says so.
- Keyset pagination is the documented next step if the access pattern turns into deep scrolling.

**Values fixed here, as `requirements.md` defers them:** default page size **25**, maximum **100**, first page is **1**. Exceeding the maximum is rejected under `REQ-F-007`.

### ADR-004 — Where validation lives
*Serves `REQ-F-007`*

**Alternatives.** Manual guard clauses raising an exception caught by middleware; FluentValidation; `IValidatableObject` on the query model.

**Decision: `IValidatableObject` on the query model.** `[ApiController]` then produces a 400 with field-level detail automatically, which is exactly the shape `REQ-F-007` demands, and it adds no new files. Validation of user input is ordinary flow, not an exceptional condition, so modelling it as a thrown exception would be a poor fit.

**Consequence.** Validation is enforced at the API boundary; a non-HTTP caller of the service would bypass it. Documented; in production FluentValidation registered in the pipeline would close that gap.

### ADR-005 — User interface framework
*Serves `REQ-F-107`, `REQ-F-101`–`REQ-F-106`*

**Decision: Angular with Angular Material.** `REQ-F-101`–`REQ-F-106` call for a multi-select, a date-range input, a sortable table, a paginator and three distinct status states. Angular Material supplies all of them, and Angular's Reactive Forms and RxJS give debouncing and in-flight request cancellation directly rather than through separate library choices.

> This decision is independent of everything on the server. If React is the stronger ground, it flips without touching a line of the backend design.

### ADR-006 — Partial-match implementation
*Serves `REQ-F-001`, `REQ-N-001`*

**Context.** `REQ-F-001` requires a **case-insensitive** match at **any position**. Two translation paths exist in EF Core on SQLite, and they do not behave alike:

| Expression | Translates to | Case behaviour |
|---|---|---|
| `x.RequestNumber.Contains(v)` | `instr(...) > 0` | **Case-sensitive** — fails the acceptance criterion |
| `EF.Functions.Like(x.RequestNumber, "%" + v + "%")` | `LIKE` | **Case-insensitive for ASCII** — satisfies it |

**Decision: `EF.Functions.Like` with `%`-wrapping.** `string.Contains` is not used for this filter.

**Two consequences that must be handled in code, not assumed away.**
1. **User input must be escaped.** `%` and `_` are wildcards in `LIKE`; a user typing `%` would otherwise match every row. The value is escaped and an `ESCAPE` clause is supplied.
2. **A leading wildcard is not sargable.** This filter scans; no index can serve it. This is the accepted cost of reading "partial search" literally. The production path — a trigram index or a dedicated search engine — is described in `design-architecture-cloud.md` and noted in the README.

---

## 3. Design by layer

### 3.1 Domain — unchanged
*`REQ-F-001`–`REQ-F-004`*

`Request`, `RequestStatus` and `RequestType` already carry every field the specification filters and sorts on. Searching, sorting and paging are query concerns, not domain invariants, so nothing is added here.

### 3.2 Application
*`REQ-F-001`–`REQ-F-010`, `REQ-N-002`*

| Element | Serves | Notes |
|---|---|---|
| `Common/ICurrentUser` | `REQ-F-008`–`REQ-F-010` | `UserId`, `IsAdministrator`. The seam that keeps the layers below ignorant of how identity arrived (ADR-002) |
| `Common/PagedResult<T>` | `REQ-N-002` | `Items`, `TotalCount`, `Page`, `PageSize` |
| `Requests/Search/RequestSearchQuery` | `REQ-F-001`–`REQ-F-007`, `REQ-N-002` | See the binding constraints in §4 |
| `IRequestRepository.SearchAsync` | `REQ-F-010`, `REQ-N-001` | **Replaces `GetAllAsync`; it is not kept alongside it** |
| `IRequestService.SearchAsync` | all of Part A | Orchestration only |

**Why `GetAllAsync` is removed rather than retained.** An unfiltered, reachable data path is precisely the defect that `REQ-F-010` exists to prevent. Leaving it in place would mean the enforcement holds only as long as every future caller remembers to use the other method.

**`ICurrentUser` is injected into the repository, not passed as an argument.** Passing identity as a parameter leaves a code path where a caller can supply a different one. Injection removes that possibility, which is what `REQ-F-010` asks for.

**Repository returns `RequestDto`, not `Request`.** This is a read path; projecting to the DTO inside the query means only the displayed columns leave the database, which serves `REQ-N-001`. The naming is a known compromise — an object shaped like this is closer to a query handler than to a repository — and it is kept only to minimise churn in the supplied structure.

### 3.3 Infrastructure
*`REQ-N-001`, `REQ-N-002`, `REQ-F-001`–`REQ-F-009`*

**Query composition order in `SearchAsync`** — fixed, because the order is what makes `REQ-N-001` hold:

1. `AsNoTracking()` — read path, no change tracking
2. **Permission restriction first and unconditionally** (`REQ-F-008`), skipped only for an administrator (`REQ-F-009`)
3. Each supplied filter added only when a value was actually provided (`REQ-F-001`–`REQ-F-004`, `REQ-F-006`) — never a blanket `WHERE x IS NULL OR …`, which defeats indexes
4. `CountAsync` for the total (`REQ-N-002`)
5. Ordering (`REQ-F-005`), then `Skip`/`Take` (`REQ-N-002`)
6. Projection to `RequestDto` inside the query (`REQ-N-001`)
7. Materialise

Two round trips — count, then page — are expected and correct.

**Indexes in `OnModelCreating`** (`REQ-N-001`), shaped to the queries actually issued: `(OwnerId, CreatedAt)` and `(AssignedToUserId, CreatedAt)` for the permission path combined with the default ordering; single-column indexes on `Status`, `RequestType`, `CreatedAt`; `RequestNumber` for exact lookups, acknowledging that `REQ-F-001` will not use it (ADR-006).

**Sort mapping** (`REQ-F-005`): a static map from permitted sort keys to typed expressions. No reflection-based dynamic ordering. A key absent from the map is a validation failure under `REQ-F-007`, not a silent fallback. The default ordering is `CreatedAt` descending, with `Id` as a tiebreaker so it is deterministic as the requirement demands.

**Seeding** (`REQ-N-001`): the 500-row seed is replaced by a bulk insert of **200,000** rows executed as a single `INSERT … SELECT` over a recursive CTE, which completes in about a second. Row-by-row `AddRange` at this volume takes minutes and is not used. *200,000 rows demonstrate the behaviour; the design is what holds at millions, and the README says exactly that rather than implying the seed proves it.* The generated database file is not committed.

### 3.4 API
*`REQ-F-007`, `REQ-F-010`, `REQ-F-101`–`REQ-F-106`*

| Element | Serves |
|---|---|
| Header authentication scheme → `ClaimsPrincipal`; missing or unparseable identity yields **401**, never a default user | `REQ-F-010` (ADR-002) |
| `ClaimsCurrentUserAccessor` implementing `ICurrentUser` over `HttpContext.User` | `REQ-F-008`–`REQ-F-010` |
| `[Authorize]` on the controller; `ParseUserId` and the manual header reads are deleted | `REQ-F-010` |
| Single `[HttpGet]` action binding `[FromQuery] RequestSearchQuery` | `REQ-F-001`–`REQ-F-007` |
| `JsonStringEnumConverter` | `REQ-F-103` — without it the table renders `Status: 2` instead of a name |
| CORS policy for the UI origin, from configuration | `REQ-F-101`–`REQ-F-106` |
| `appsettings.json` — connection string, CORS origins | `REQ-D-002` |

### 3.5 User interface
*`REQ-F-101`–`REQ-F-107`*

One stateful page component owns filter, sort and page state and performs the HTTP call; presentational child components for the filter form and the results table receive inputs and emit events. Filter changes are debounced, and an in-flight request is cancelled when a newer one supersedes it.

- **Filter form** (`REQ-F-101`): text input, multi-select for status, single select for type, date-range input. Clearing a control removes that filter.
- **Sort control** (`REQ-F-102`) and **results table** (`REQ-F-103`).
- **Paging** (`REQ-N-002`): the paginator's length is fed from the response's total count — **never from the length of the returned array**.
- **Three distinct states** (`REQ-F-104`, `REQ-F-105`, `REQ-F-106`): a loading indicator, an inline error block that surfaces field-level detail from `REQ-F-007`, and an explicit "no results match these filters" message. They are mutually exclusive and separately styled, as `REQ-F-106` requires.

### 3.6 Tests
*`REQ-T-001`*

Five tests against the real repository over SQLite in-memory, each with a distinct database so they cannot leak into one another:

| Test | Covers |
|---|---|
| A regular user sees only owned or assigned requests | `REQ-F-008` |
| An administrator sees all requests | `REQ-F-009` |
| An inverted date range is rejected | `REQ-F-007` |
| Multiple statuses filter correctly | `REQ-F-002` |
| Paging returns the right rows and the right total count | `REQ-N-002` |

---

## 4. Explicit design constraints

Each of these prevents a specific defect. They are listed because every one of them is easy to get wrong and silent when wrong.

| Constraint | Protects | Failure if ignored |
|---|---|---|
| `RequestSearchQuery` is a `record` **with a body and `init` properties**, not a positional record | `REQ-F-001`–`REQ-F-007` | A positional record has no parameterless constructor; model binding fails |
| The status collection is typed `List<T>` or `T[]`, **not `IReadOnlyList<T>`** | `REQ-F-002` | The collection binder requires an `ICollection<T>`-compatible target; `IReadOnlyList<T>` binds to null silently |
| The status property carries `[FromQuery(Name = "status")]` if the query-string name differs from the property name | `REQ-F-002` | Values arrive unbound |
| Date upper bound is `CreatedAt < end.Date.AddDays(1)` | `REQ-F-003` | Everything created on the end day is excluded |
| Incoming date bounds are normalised to UTC | `REQ-F-003`, `REQ-N-003` | A local-midnight boundary shifts results by hours |
| `EF.Functions.Like` with escaped input, not `string.Contains` | `REQ-F-001` | Case-sensitive matching; unescaped `%` matches everything |
| `JsonStringEnumConverter` registered | `REQ-F-103` | Enumerations render as integers |
| Angular Material's date adapter is provided | `REQ-F-101` | The date-range input fails at runtime |
| The results table is **not** bound to the component library's built-in client-side sorting and paging source | `REQ-N-001`, `REQ-N-002` | Sorting and paging silently happen on one page of data |
| Paginator length comes from the response total | `REQ-N-002` | Navigation shows one page regardless of the real result size |

---

## 5. Build order

Dependency-ordered. Each step names what it serves and how it is verified.

| # | Step | Serves | Verification |
|---|---|---|---|
| 1 | Solution file; switch provider to SQLite; `EnsureCreated`; indexes in `OnModelCreating`; 200k bulk seed | `REQ-N-001`, ADR-001 | Application starts; database file is created and populated |
| 2 | `ICurrentUser`, `PagedResult<T>`, `RequestSearchQuery` with validation | `REQ-F-001`–`REQ-F-007`, `REQ-N-002` | Compiles; validation rules reviewed against `REQ-F-007`'s table |
| 3 | Replace `IRequestRepository` / `IRequestService` / `RequestService` | `REQ-F-010` | No unfiltered data path remains anywhere |
| 4 | `RequestRepository.SearchAsync`, sort mapping | `REQ-F-001`–`REQ-F-009`, `REQ-N-001` | `EXPLAIN QUERY PLAN` shows index use on the permission path |
| 5 | Authentication scheme, `ClaimsCurrentUserAccessor`, controller, `Program.cs`, `appsettings` | `REQ-F-010`, `REQ-F-007` | No identity → 401; regular and administrator identities return different totals |
| 6 | Five tests | `REQ-T-001` | `dotnet test` green |
| 7 | UI: project setup, API client, filter form, results table, three states | `REQ-F-101`–`REQ-F-107` | All four interaction states exercised against the running API |
| 8 | README and AI-usage document | `REQ-D-002`–`REQ-D-012` | Every `REQ-D` acceptance criterion satisfied |

Parts B and C, and the diagrams of `REQ-D-013`, follow in `design-architecture-cloud.md` after step 8.

---

## 6. Coverage

| Requirement | Design section |
|---|---|
| `REQ-F-001` | ADR-006, §3.3, §4 |
| `REQ-F-002`, `REQ-F-004`, `REQ-F-006` | §3.3, §4 |
| `REQ-F-003` | §3.3, §4 |
| `REQ-F-005` | §3.3 |
| `REQ-F-007` | ADR-003, ADR-004, §3.4 |
| `REQ-F-008`, `REQ-F-009` | §3.2, §3.3 |
| `REQ-F-010` | ADR-002, §3.2, §3.4 |
| `REQ-F-101`–`REQ-F-106` | ADR-005, §3.5 |
| `REQ-F-107` | ADR-005 |
| `REQ-N-001` | ADR-001, §3.3 |
| `REQ-N-002` | ADR-003, §3.3, §3.5 |
| `REQ-N-003` | §3.3, §4 |
| `REQ-T-001` | §3.6 |
| `REQ-D-002`–`REQ-D-012` | §5 step 8 |
| `REQ-A-001`, `REQ-A-002`, `REQ-C-001`, `REQ-D-013` | *`design-architecture-cloud.md`* |
