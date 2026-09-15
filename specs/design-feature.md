# Design — Part A: Requests Search & Filtering

> **This document states HOW.** Every section cites the requirement IDs it serves.
> `requirements.md` is the source of truth. Where this document contradicts it, this document is wrong and gets corrected.
> Scope: Part A only.

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
- The gap between what runs locally and what would be recommended in production is documented in the README.

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

> **Terminology, because the word is doing two jobs.** "Authentication scheme" here means the framework's authentication *pipeline* — a handler, `[Authorize]`, and a 401 when identity is absent. It is a transport for an identity the caller asserts. **No credential is verified**, and nothing here contradicts authentication being out of scope in `requirements.md`. What is in scope is *authorization*: deciding what a given identity may see.

**The counter-argument, recorded as required by the specification.** A strict reading says enforcement against an identity the client asserts is hollow: anyone may send `X-Is-Admin: true`. This is true, and it is the reason option C exists. It was rejected because the brief asks for *permission enforcement*, not *identity verification*, and because the derivation rule adopted in `requirements.md` admits only **necessary** consequences — authorization can be enforced against a trusted identity source without building a sign-in mechanism. In a larger system identity would arrive from an identity provider outside this service entirely.

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

**Context.** `REQ-F-001` requires a match at **any position**, and explicitly makes **case handling a non-requirement**. Two translation paths exist in EF Core on SQLite and they do not behave alike:

| Expression | Translates to | Case behaviour on SQLite | Wildcards in user input |
|---|---|---|---|
| `x.RequestNumber.Contains(v)` | `instr(...) > 0` | Case-sensitive | None — matched literally |
| `EF.Functions.Like(x.RequestNumber, "%" + v + "%")` | `LIKE` | Case-insensitive for ASCII | `%` and `_` are wildcards and **must be escaped** |

**Decision: `string.Contains`.**

**Rationale.** With case-insensitivity out of the requirement, `LIKE` buys a behaviour nobody asked for and charges for it: every user-supplied value would need escaping for `%` and `_` plus an `ESCAPE` clause, or a user typing `%` matches every row. `Contains` has no wildcard semantics at all, so that class of defect does not exist.

The earlier choice of `LIKE` also satisfied case-insensitivity **by provider accident** rather than by intent: SQLite's `LIKE` happens to be case-insensitive for ASCII. On PostgreSQL `LIKE` is case-sensitive and would need `ILIKE`; on SQL Server it depends on collation. A requirement upheld that way breaks on a provider swap with no compile error and no exception — which is the strongest reason to withdraw it rather than to keep leaning on it.

**Consequences.**
1. **Case behaviour follows the store.** On SQLite `instr` is case-sensitive. `REQ-F-001` depends on neither behaviour, which is the point of stating it as unspecified. The README records it as an assumption (`REQ-D-005`).
2. **Not sargable.** A substring search scans; no index can serve it. This is unchanged from the `LIKE` option — both scan. The production path (a trigram index, a normalised search column, or a dedicated search engine) is noted in the README.

### ADR-007 — Source of the API base URL
*Serves `REQ-D-002`, `REQ-F-107`*

**Context.** The client must reach the API. Where that address comes from decides whether changing environment is a code change or a configuration change.

**Alternatives.**

| Option | For | Against |
|---|---|---|
| **A** Hard-coded in the API service | Nothing to set up | Changing the address means editing source and rebuilding |
| **B** Angular `environment.ts` build-time replacement | Idiomatic, typed, and entirely adequate at this scope | The address is baked into the bundle, so each environment needs its own build |
| **C** Runtime `site.config.json`, read at bootstrap | The address is edited after the build, as deployment configuration rather than as source | Bootstrap must wait for the file before the application renders |

**Decision: C — a runtime `site.config.json`.**

It is served as a static asset, read once during bootstrap by an application initialiser, and exposed through an injection token. **No component or service holds a literal URL.**

The justification stands on its own: an endpoint address is configuration, not code. It also makes the client **symmetric with the server**, which already reads its connection string and CORS origins from `appsettings` rather than from source — the same rule applied on both sides.

> Option B is not a poor choice and would not be a defect at this scope. C is selected because **runtime configuration is a stakeholder requirement for this project** — it is not asked for by the brief, and B is not inadequate. Were that requirement absent, B would be the correct choice here, and the move between them is contained: the token stays and only its provider changes, from a constant to an initialiser.

**Consequences.**
- The application does not render until configuration has loaded. A failure to load is a startup error, **not** a silent fallback to some default address.
- The file is deployment configuration, so it is not treated as build output.
- The README states where the address is changed (`REQ-D-002`).

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

**UTC value converter** (`REQ-N-003`, `REQ-F-003`): SQLite has no date type, so a `DateTime` returns from the store with `Kind = Unspecified`. Both `DateTime` properties on `Request` are configured in `OnModelCreating` with a conversion that writes the value unchanged and restores the kind on read — `v => v` on write, `v => DateTime.SpecifyKind(v, DateTimeKind.Utc)` on read. The assertion is legitimate because only UTC is ever written (`REQ-N-003`). Without it the JSON response omits the `Z` suffix and every browser reads the timestamp as local time, while filtering still works — so nothing fails loudly. Because the write side is the identity function, the stored representation is unchanged and the indexes on `CreatedAt` are unaffected. *Alternative considered:* storing ticks as `long`, rejected because it makes the database file unreadable by hand and buys nothing here.

**Sort mapping** (`REQ-F-005`): a static map from permitted sort keys to typed expressions. No reflection-based dynamic ordering. A key absent from the map is a validation failure under `REQ-F-007`, not a silent fallback. The default ordering is `CreatedAt` descending, with `Id` as a tiebreaker so it is deterministic as the requirement demands.

**Seeding** (`REQ-N-001`): the 500-row seed is replaced by a bulk insert of **200,000** rows executed as a single `INSERT … SELECT` over a recursive CTE, which completes in about a second. Row-by-row `AddRange` at this volume takes minutes and is not used. *200,000 rows demonstrate the behaviour; the design is what holds at millions, and the README says exactly that rather than implying the seed proves it.* The generated database file is not committed.

Two rules that the move to a persisted store makes load-bearing. **The existing empty-check guard is preserved** — with InMemory it was decorative because every run started empty; with a file it is the only thing preventing a second startup from adding another 200,000 rows. And **seeded dates are relative to the moment of seeding**, so the data ages with the file: no test and no README example may assert against an absolute date. They assert against what the seed actually produced, or they filter by a range derived at run time.

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

### 3.4a API contract

This is the seam between the two sides. Both §3.4 and §3.5 cite it rather than each assuming a shape; a mismatch here is a silent failure, not a compile error.

**Endpoint:** `GET /api/requests`

**Identity headers** (ADR-002): `X-User-Id` — integer, required; `X-Is-Admin` — `true` / `false`, optional. Absent or unparseable `X-User-Id` → **401**.

**Query parameters**

| Name | Type | Example | Serves |
|---|---|---|---|
| `requestNumber` | string | `000123` | `REQ-F-001` |
| `status` | enum name, **repeatable** | `status=New&status=InProgress` | `REQ-F-002` |
| `requestType` | enum name | `requestType=Legal` | `REQ-F-004` |
| `createdFrom` | date `yyyy-MM-dd`, UTC | `2026-01-01` | `REQ-F-003` |
| `createdTo` | date `yyyy-MM-dd`, UTC, **inclusive of that whole day** | `2026-09-14` | `REQ-F-003` |
| `sortBy` | one of `requestNumber`, `status`, `requestType`, `createdAt` | `createdAt` | `REQ-F-005` |
| `sortDirection` | `asc` \| `desc` | `desc` | `REQ-F-005` |
| `page` | integer ≥ 1, default **1** | `2` | `REQ-N-002` |
| `pageSize` | integer 1–**100**, default **25** | `25` | `REQ-N-002` |

Enumerations are accepted and returned **by name**, never by number (see `JsonStringEnumConverter`, §3.4). All timestamps in and out are UTC (`REQ-N-003`) and are serialised with the `Z` suffix, which depends on the value converter in §3.3.

An enumeration value that binds but is not a defined member — `status=99`, for example — is rejected with **400** under `REQ-F-007`. The query-string binder accepts numeric values for enums without checking that they are defined, so this is enforced in validation (ADR-004), not by binding.

**200 response**

```json
{
  "items": [
    {
      "id": 1234,
      "requestNumber": "REQ-001234",
      "customerId": 35,
      "ownerId": 5,
      "assignedToUserId": 2,
      "status": "InProgress",
      "requestType": "Legal",
      "createdAt": "2026-03-11T09:42:00Z"
    }
  ],
  "totalCount": 3847,
  "page": 2,
  "pageSize": 25
}
```

`totalCount` is the count **after** the permission restriction (`REQ-F-008`). It is what the paginator binds to, and it is never the length of `items`.

A page beyond the last returns `200` with `items: []` and the correct `totalCount` (`REQ-N-002`), so the client recovers by navigating back rather than by handling an error.

**400 response** — `ValidationProblemDetails`, produced by `[ApiController]` from `IValidatableObject` (ADR-004). The field-level detail is what `REQ-F-007` requires and what the UI renders in its error state (`REQ-F-105`).

```json
{
  "title": "One or more validation errors occurred.",
  "status": 400,
  "errors": {
    "createdFrom": ["createdFrom must not be later than createdTo."],
    "sortBy": ["'ownerName' is not a sortable field."]
  }
}
```

### 3.5 User interface
*`REQ-F-101`–`REQ-F-107`, `REQ-N-002`*

**Structure** under `frontend/src/app/`:

```
core/
  config/         app-config.service.ts, api-base-url.token.ts
  models/         request.model.ts, search-query.model.ts, paged-result.model.ts
  services/       requests-api.service.ts, current-user.service.ts
  interceptors/   identity.interceptor.ts
features/request-search/
  request-search-page/      (stateful — owns state and hosts the filter controls)
  request-results-table/    (presentational)
app.routes.ts, app.config.ts, app.component.*
```

**Models** — interfaces only, no behaviour. They exist so that the API service and the table agree on field names instead of each guessing.

| Model | Describes |
|---|---|
| `RequestDto` + `RequestStatus`, `RequestType` | One result row, mirroring §3.4a exactly. Enumerations are **string** unions, not numeric |
| `RequestSearchQuery` | Filter, sort and page state as one object — the single definition of "a search" |
| `PagedResult<T>` | The response envelope: `items`, `totalCount`, `page`, `pageSize` |

**Components** — two, not three.

| Component | Kind | Owns | Inputs | Outputs |
|---|---|---|---|---|
| `RequestSearchPageComponent` | stateful | the filter form group, sort state, page state, and the loading / error / results state; renders the filter controls directly | — | — |
| `RequestResultsTableComponent` | presentational | nothing | `rows`, `totalCount`, `page`, `pageSize`, `sort`, `loading`, `errorMessage` | `sortChange`, `pageChange` |

> **Why the filter form is not its own component.** It would never be reused, and splitting it would buy readability at the cost of passing a form group across a boundary for no other purpose. The split that *is* worth making is the table, because that boundary is what keeps sorting and paging on the server (see the state rules below).

**Services and configuration**

| Element | Responsibility |
|---|---|
| `AppConfigService` + `API_BASE_URL` token | Reads `site.config.json` once at bootstrap and exposes the address by injection (ADR-007). **The only place the API address exists** |
| `RequestsApiService` | One method, `search(query)`, building the query string exactly as §3.4a defines — including the repeated `status` parameter. Takes the base address by injection; holds no literal URL |
| `CurrentUserService` | Holds the acting identity for the demonstration switcher (`REQ-F-010`, ADR-002) |
| `identityInterceptor` | Attaches the identity headers to every outgoing request, so no component or service handles them |

**Material elements**, each mapped to the requirement it serves:

| Requirement | Element |
|---|---|
| `REQ-F-001` | `matInput` text field |
| `REQ-F-002` | `mat-select` with `multiple` |
| `REQ-F-003` | `mat-date-range-input` (requires the date adapter — §4) |
| `REQ-F-004` | `mat-select` |
| `REQ-F-102` | `matSort` with `mat-sort-header` |
| `REQ-F-103` | `mat-table` |
| `REQ-N-002` | `mat-paginator`, `length` bound to `totalCount` |
| `REQ-F-104` | `mat-progress-bar` |
| `REQ-F-105` | inline error block rendering the `errors` map from §3.4a |
| `REQ-F-106` | explicit empty-state message, visually distinct from the other two |

**State ownership** — three rules, because this is the decision that is expensive to reverse:

1. **All query state lives in the page component.** Filter, sort and page are one unit — changing a filter resets to page 1 — and requests are issued from one place only.
2. **The results table holds no state and calls no HTTP.** It renders inputs and emits events; the page decides what an event means.
3. **The table is not bound to the component library's built-in client-side sort and page source** (§4). Sort and page events travel up and become a new server request. Bound the other way, the table would sort the twenty-five rows it already holds instead of the two hundred thousand on the server — and `REQ-N-001` would break silently.

**Flow:** a filter, sort or page change updates page state → debounced → a request is issued, superseding and cancelling any in flight → the response replaces `rows` and `totalCount` → exactly one of the three states in `REQ-F-104`–`REQ-F-106` is rendered.

### 3.6 Tests
*`REQ-T-001`*

Six tests. Five run against the real repository over SQLite in-memory, each with its own database so they cannot leak into one another. The sixth tests the query object's validation directly and needs no database.

| Test | Covers | Level |
|---|---|---|
| A regular user sees only owned or assigned requests | `REQ-F-008` | repository |
| An administrator sees all requests | `REQ-F-009` | repository |
| A value matching mid-string finds the request — `000123` finds `REQ-000123` | `REQ-F-001` | repository |
| Multiple statuses filter correctly | `REQ-F-002` | repository |
| Paging returns the right rows and the right total count | `REQ-N-002` | repository |
| An inverted date range is rejected | `REQ-F-007` | validation |

**Why these six.** The two permission tests are the decisive acceptance test named in `REQ-F-010` — the same search as two identities must return different sets and different totals. The mid-string test catches a `StartsWith` written by reflex, the single most likely silent defect in the feature (ADR-006). The paging test asserts that `totalCount` is the filtered, permission-restricted count and not `items.Length`, the defect that makes the paginator show one page. The multi-status test is the weakest of the six — a plain `IN` clause rarely fails quietly — but `REQ-F-002` is an explicit requirement of the brief, and leaving it with no coverage at all is a worse trade than one cheap test.

---

## 4. Explicit design constraints

Each of these prevents a specific defect. They are listed because every one of them is easy to get wrong and silent when wrong.

*On the `Enum.IsDefined` row: the check validates that the **value** is defined, not that the **wire format** was a name. `status=2` therefore passes and binds to `InProgress`. That is sufficient for `REQ-F-007` and cheaper than policing the format.*

| Constraint | Protects | Failure if ignored |
|---|---|---|
| `RequestSearchQuery` is a `record` **with a body and `init` properties**, not a positional record | `REQ-F-001`–`REQ-F-007` | A positional record has no parameterless constructor; model binding fails |
| The status collection is typed `List<T>` or `T[]`, **not `IReadOnlyList<T>`** | `REQ-F-002` | The collection binder requires an `ICollection<T>`-compatible target; `IReadOnlyList<T>` binds to null silently |
| The status property carries `[FromQuery(Name = "status")]` if the query-string name differs from the property name | `REQ-F-002` | Values arrive unbound |
| Date upper bound is `CreatedAt < end.Date.AddDays(1)` | `REQ-F-003` | Everything created on the end day is excluded |
| Incoming date bounds are normalised to UTC | `REQ-F-003`, `REQ-N-003` | A local-midnight boundary shifts results by hours |
| `DateTime` properties carry a converter restoring `DateTimeKind.Utc` on read | `REQ-N-003`, `REQ-F-003` | SQLite returns `Unspecified`, the response omits `Z`, and the browser shifts every displayed timestamp to local time. Filtering still works, so nothing fails loudly |
| `string.Contains` for the partial match, **not** `EF.Functions.Like` | `REQ-F-001` | `LIKE` treats `%` and `_` in user input as wildcards, so a user typing `%` matches every row. If `LIKE` is ever reintroduced, the value must be escaped and an `ESCAPE` clause supplied (ADR-006) |
| `JsonStringEnumConverter` registered | `REQ-F-103` | Enumerations render as integers |
| Angular Material's date adapter is provided | `REQ-F-101` | The date-range input fails at runtime |
| The results table is **not** bound to the component library's built-in client-side sorting and paging source | `REQ-N-001`, `REQ-N-002` | Sorting and paging silently happen on one page of data |
| Paginator length comes from the response total | `REQ-N-002` | Navigation shows one page regardless of the real result size |
| `RequestSearchQuery.Validate` checks `Enum.IsDefined` for every supplied `status` and for `requestType` | `REQ-F-002`, `REQ-F-004`, `REQ-F-007` | The binder accepts any integer for an enum, so `status=99` binds, matches nothing, and returns an empty page with `200` instead of a `400` — the exact silent absorption `REQ-F-007` forbids |
| After any model change, the existing database file is deleted before the next run | `REQ-N-001` | `EnsureCreated()` does nothing when the file already exists, so a new column or index is never created and the failure surfaces later as a confusing runtime error |

---

## 5. Build order

Dependency-ordered. Each step names what it serves and how it is verified.

| # | Step | Serves | Verification |
|---|---|---|---|
| 1 | Solution file; switch provider to SQLite; `EnsureCreated`; indexes in `OnModelCreating`; 200k bulk seed | `REQ-N-001`, ADR-001 | Application starts; database file is created and populated |
| 2 | `ICurrentUser`, `PagedResult<T>`, `RequestSearchQuery` with validation | `REQ-F-001`–`REQ-F-007`, `REQ-N-002` | Compiles; validation rules reviewed against `REQ-F-007`'s table |
| 3 | Replace `IRequestRepository` / `IRequestService` / `RequestService`. **In the same step, delete the two existing tests and `FakeRequestRepository`** — they implement and call the removed `GetAllAsync`, so the solution does not build until they go. Replacements arrive in step 6 | `REQ-F-010` | `dotnet build` succeeds; no unfiltered data path remains anywhere |
| 4 | `RequestRepository.SearchAsync`, sort mapping | `REQ-F-001`–`REQ-F-009`, `REQ-N-001` | `EXPLAIN QUERY PLAN` shows index use on the permission path |
| 5 | Authentication scheme, `ClaimsCurrentUserAccessor`, controller, `Program.cs`, `appsettings` | `REQ-F-010`, `REQ-F-007` | No identity → 401; regular and administrator identities return different totals |
| 6 | Five tests | `REQ-T-001` | `dotnet test` green |
| 7 | UI: project setup; `site.config.json` and the config service; models; API client and identity interceptor; search page with the filter controls; results table; the three states | `REQ-F-101`–`REQ-F-107`, `REQ-N-002` | All four interaction states exercised against the running API; changing the address in `site.config.json` retargets the client without a rebuild |
| 8 | README and AI-usage document | `REQ-D-002`–`REQ-D-012` | Every `REQ-D` acceptance criterion satisfied |


---

## 6. Coverage

| Requirement | Design section |
|---|---|
| `REQ-F-001` | ADR-006, §3.3, §3.4a, §4 |
| `REQ-F-002`, `REQ-F-004`, `REQ-F-006` | §3.3, §3.4a, §4 |
| `REQ-F-003` | §3.3, §3.4a, §4 |
| `REQ-F-005` | §3.3, §3.4a |
| `REQ-F-007` | ADR-003, ADR-004, §3.4, §3.4a |
| `REQ-F-008`, `REQ-F-009` | §3.2, §3.3 |
| `REQ-F-010` | ADR-002, §3.2, §3.4 |
| `REQ-F-101`–`REQ-F-106` | ADR-005, §3.4a, §3.5 |
| `REQ-F-107` | ADR-005, ADR-007 |
| `REQ-N-001` | ADR-001, §3.3 |
| `REQ-N-002` | ADR-003, §3.3, §3.4a, §3.5 |
| `REQ-N-003` | §3.3, §3.4a, §4 |
| `REQ-T-001` | §3.6 |
| `REQ-D-002` | ADR-007, §5 step 8 |
| `REQ-D-003`–`REQ-D-012` | §5 step 8 |
