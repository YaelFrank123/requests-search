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

**Decision: B — SQLite**, schema created at startup via EF Core **migrations** (`Database.Migrate()`).

**Consequences.**
- **Migrations, not `EnsureCreated()`.** An initial migration (`InitialCreate`) captures the schema declared in `OnModelCreating`, including indexes. `Database.Migrate()` applies pending migrations on startup, which is the standard EF Core Code First workflow and needs no external dependency — it still runs against the local SQLite file, so `REQ-D-002` is unaffected. A schema change is a new migration rather than a silently-skipped model change against a stale file.
- `REQ-N-001` becomes verifiable: `EXPLAIN QUERY PLAN` shows whether an index is used. That output is quoted in the README.
- The gap between what runs locally and what would be recommended in production is documented in the README.

### ADR-002 — Source of the acting identity
*Serves `REQ-F-010`, `REQ-F-008`, `REQ-F-009`*

> **Superseded 2026-09-15 by ADR-008**, following `[STAKEHOLDER #1]` in `requirements.md`. The analysis below was correct under the scope in force when it was written — authentication was out of scope, and Option B was the right call under that constraint. It is kept as the record of that reasoning, not as the live decision. **ADR-008 now governs `REQ-F-010`'s identity source.**

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
- **This prediction was exercised, not just made.** ADR-008 performs exactly this swap: `ClaimsCurrentUserAccessor` carries over unchanged, and only the scheme registration in `Program.cs` differs.
- This ADR is the intended answer to `REQ-D-006` for the scope in force when it was written; ADR-008 is now the stronger candidate for `REQ-D-006` under the current scope, since it documents a decision that was later reversed with the reversal itself on record.

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

### ADR-008 — Authentication mechanism
*Serves `REQ-F-011`–`REQ-F-013`; supersedes ADR-002's identity-source decision*

**Context.** `[STAKEHOLDER #1]` (`requirements.md`) reverses the earlier exclusion of authentication. `REQ-F-013` requires the acting identity to come from a verified credential, not an asserted header. ADR-002 chose a header-based `ClaimsPrincipal` specifically *because* verification was out of scope; that constraint no longer holds, so the decision is re-opened rather than patched.

**Alternatives.**

| Option | For | Against |
|---|---|---|
| **A** Keep ADR-002's header scheme | Nothing to build | The identity stays client-asserted; `REQ-F-013` is not satisfiable. This is the option `[STAKEHOLDER #1]` reverses |
| **B** Server-side session + cookie | Simple revocation | Needs server-side session state, which nothing else here requires — a poor fit for a stateless API consumed by a separately-deployed SPA |
| **C** JWT bearer token, issued at login | Stateless — no session store; standard `AddJwtBearer()` pipeline; the token *is* the `ClaimsPrincipal` source, so `ICurrentUser` and `ClaimsCurrentUserAccessor` (ADR-002) carry over unchanged | Cannot be revoked before it expires — accepted, and bounded by `REQ-N-005`'s fixed, short lifetime |

**Decision: C — JWT bearer.**

**Signing algorithm: HS256, not RS256.** A real alternative, not a default — flagged in review because `requirements.md` REQ-A-001 already commits this project to a future microservices split (Customers, Notifications, Documents, Reporting). HS256 (symmetric) means every future service that verifies a token needs the same secret; RS256 (asymmetric) would let them verify with a public key while only this service signs. **Decision: HS256 now** — nothing outside this one service verifies a token yet, so the extra machinery (key pair management, JWKS endpoint) buys nothing today. **RS256 is the documented next step** the moment a second service needs to verify identity independently, exactly as ADR-003 already treats keyset pagination as the next step if access patterns change.

**Token validation, stated explicitly** (closes a review gap — the design previously said `TokenValidationParameters = ...` without saying what that means): `ValidateIssuer` and `ValidateAudience` against `Jwt:Issuer`/`Jwt:Audience`, `ValidateLifetime = true`, `IssuerSigningKey` = a `SymmetricSecurityKey` built from `Jwt:Key`, and **`ClockSkew = TimeSpan.Zero`**. The default skew is 5 minutes, which would let a token expired by less than that still validate — silently defeating any test that constructs an already-expired token (T8a) and silently loosening `REQ-N-005`'s "fixed lifetime" in practice. Zero skew is also simply easier to reason about than picking a tolerance.

**Client-side storage: `sessionStorage`.** Considered against `localStorage` (survives longer, more XSS surface) and in-memory only (safest, but a reload always forces a fresh login with no "remember me" to justify that cost). `sessionStorage` clears on tab close, survives a reload, and needs no extra machinery — the simplest option that doesn't force a re-login on every refresh.

**Consequences.**
- `HeaderAuthenticationHandler` (ADR-002) is never built; `AddAuthentication().AddJwtBearer(...)` is registered in `Program.cs` instead.
- `ClaimsCurrentUserAccessor` is unchanged — this is precisely the seam ADR-002 built for this swap (see its updated Consequences). It reads `ClaimTypes.NameIdentifier` and `ClaimTypes.Role` exactly as before; only what populates `HttpContext.User` differs.
- The signing key lives in `appsettings.json` under a new `Jwt` section (`Key`, `Issuer`, `Audience`, `ExpiryMinutes`), alongside the existing `ConnectionStrings` and `Cors` sections. The README states plainly that a source-controlled symmetric key is a development convenience and not a production posture — the same candour ADR-002 already applied to the header scheme.
- `X-User-Id` / `X-Is-Admin` are removed from the API contract (§3.4a) and from the CORS allowed-headers list (§4); the client's identity interceptor (§3.5) is replaced by one that attaches `Authorization: Bearer <token>`.

### ADR-009 — Credential verification
*Serves `REQ-F-012`, `REQ-N-004`*

**Context.** A submitted password must be verified against a stored value without ever storing or comparing it in plaintext.

**Alternatives.**

| Option | For | Against |
|---|---|---|
| **A** Full ASP.NET Core Identity (`IdentityDbContext`, `UserManager`, `SignInManager`) | Batteries included; the conventional default | Brings its own table set (`AspNetUsers`, `AspNetRoles`, …) and a surface — external login, lockout, email confirmation — that nothing here asks for. Heavier than `REQ-F-011`'s two-role, seeded-account model needs |
| **B** `Microsoft.AspNetCore.Identity.PasswordHasher<User>` against a plain `Users` table in `RequestsDbContext` | The same PBKDF2 verification Identity itself uses, as one injectable class with no schema or pipeline attached | Login and claims issuance are hand-written instead of supplied by `SignInManager` |
| **C** A hand-rolled hash (e.g. raw SHA-256) | No package dependency | Not salted, not iterated — a known-weak construction for password storage. Violates `REQ-N-004` in substance even where it appears to satisfy it in letter |

**Decision: B.** This is the same shape of call ADR-004 already made for validation — the built-in mechanism that covers the requirement, without the machinery around it that nothing here needs. Two roles and seeded accounts do not need `UserManager`'s surface.

**Consequences.**
- `Requests.Application` gains `IPasswordHasher` (`Hash(string password)`, `Verify(string hash, string password)`); `Requests.Infrastructure` implements it as a thin wrapper over `PasswordHasher<User>`.
- If self-registration, lockout, or external login are ever added, this is the ADR to revisit first — Option A becomes the stronger trade once those exist. Recorded for `REQ-D-007`.

### ADR-010 — Users/Requests referential integrity and seeding
*Serves `REQ-F-011`, `REQ-N-001`*

**Context.** By `requirements.md`'s original decision, `Request.OwnerId` and `AssignedToUserId` were "identifiers only" with no backing table (§3.3's seed note). `REQ-F-011` now requires every such identifier to name a real account, while the existing seed (§3.3, T3) spreads ownership over 1,000 synthetic ids specifically to keep the permission predicate selective at `REQ-N-001`'s assumed volume — that selectivity still needs to hold.

**Decision.** Keep the 1,000-id spread, back it with 1,000 real `User` rows seeded the same way (T3's recursive-CTE technique, applied to `Users` first), and add a real foreign key from `Request.OwnerId` / `AssignedToUserId` to `Users.Id`. Of the 1,000, a small fixed set of low ids get real, documented login credentials for demonstration — id 1 as Administrator, id 2 as a regular user with non-trivial ownership. The rest exist only to hold realistic FK-backed volume, exactly as they did before this ADR, just no longer orphaned references.

**Consequences.**
- Seeding order changes: `Users` must be inserted before `Requests`, since the foreign key depends on it. Both happen inside `DbSeeder.Seed`, in one pass, guarded by the existing `if (db.Requests.Any()) return` — extended to cover `Users` too, so a second run re-seeds neither.
- **This invalidates the `requests.db` file T3 already produced** — it has no `Users` table. It is deleted and regenerated, the same trap §4 already documents for any model change, not a new one.
- **Id 1's count (372) is unaffected by this ADR** — it comes from the `Requests` seed formula alone (§3.3), which this ADR does not touch; seeding `Users` first changes insert order, not the CTE's arithmetic. What genuinely has no prior measurement is **id 2**: the original design only ever needed one regular-user identity (toggled between "user" and "administrator" by a header flag on that same id), never a second distinct one. Id 2's count is measured when this is built, not assumed to equal 372.
- No navigation properties are added between `Request` and `User` — the foreign key is enforced at the schema level (`HasOne(...).WithMany().HasForeignKey(...)`, no inverse collection on `User`). `RequestDto`'s projection (§3.2) does not change shape; nothing in `REQ-F-011`–`013` or `[STAKEHOLDER #1]` asks for the owner's username to appear in search results, so it is not added.

---

## 3. Design by layer

### 3.1 Domain
*`REQ-F-001`–`REQ-F-004`, `REQ-F-011` (ADR-010)*

`Request`, `RequestStatus` and `RequestType` already carry every field the specification filters and sorts on. Searching, sorting and paging are query concerns, not domain invariants, so nothing changes here for Part A's original scope.

**Addition, `[STAKEHOLDER #1]`:** `Entities/User.cs` (`int Id`, `string Username`, `string PasswordHash`, `UserRole Role`) and `Entities/UserRole.cs` (`User`, `Administrator`), the same shape as `RequestStatus`/`RequestType` — a plain enum, no framework dependency. `Request` itself gains no new property: `OwnerId`/`AssignedToUserId` are unchanged in type, only now foreign-key-constrained (ADR-010).

### 3.2 Application
*`REQ-F-001`–`REQ-F-013`, `REQ-N-002`, `REQ-N-004`, `REQ-N-005`*

| Element | Serves | Notes |
|---|---|---|
| `Common/ICurrentUser` | `REQ-F-008`–`REQ-F-010` | `UserId`, `IsAdministrator`. The seam that keeps the layers below ignorant of how identity arrived (ADR-002, ADR-008) |
| `Common/PagedResult<T>` | `REQ-N-002` | `Items`, `TotalCount`, `Page`, `PageSize` |
| `Requests/Search/RequestSearchQuery` | `REQ-F-001`–`REQ-F-007`, `REQ-N-002` | See the binding constraints in §4 |
| `IRequestRepository.SearchAsync` | `REQ-F-010`, `REQ-N-001` | **Replaces `GetAllAsync`; it is not kept alongside it** |
| `IRequestService.SearchAsync` | all of Part A | Orchestration only |
| `Common/IPasswordHasher` | `REQ-F-012`, `REQ-N-004` | `Hash`/`Verify` (ADR-009) — `[STAKEHOLDER #1]` |
| `Common/IJwtTokenGenerator` | `REQ-F-012`, `REQ-N-005` | Issues a signed token carrying the user id and role claims (ADR-008) — `[STAKEHOLDER #1]` |
| `Users/IUserRepository` | `REQ-F-012` | `FindByUsernameAsync` — the only lookup the login flow needs — `[STAKEHOLDER #1]` |
| `Auth/LoginCommand`, `Auth/LoginResult` | `REQ-F-012` | Plain records, not a mediator pattern — nothing in this project uses one, and introducing one for a three-step login flow would be exactly the premature abstraction §1 principle 1 warns against. `LoginResult` carries `Token`, `ExpiresAt`, `Role` **and `Username`** — the client needs `Username` to render `REQ-F-109`'s "logged in as" element without decoding the token itself — `[STAKEHOLDER #1]` |
| `Auth/IAuthService`, `Auth/AuthService` | `REQ-F-012` | One method, `LoginAsync(LoginCommand) → LoginResult?`: find the user (`IUserRepository`), verify the password (`IPasswordHasher`), issue the token (`IJwtTokenGenerator`). Mirrors `RequestService`'s shape exactly — orchestration only, no framework dependency, which is why it lives in `Requests.Application` rather than `Requests.Infrastructure` — `[STAKEHOLDER #1]` |

**Why `GetAllAsync` is removed rather than retained.** An unfiltered, reachable data path is precisely the defect that `REQ-F-010` exists to prevent. Leaving it in place would mean the enforcement holds only as long as every future caller remembers to use the other method.

**`ICurrentUser` is injected into the repository, not passed as an argument.** Passing identity as a parameter leaves a code path where a caller can supply a different one. Injection removes that possibility, which is what `REQ-F-010` asks for.

**Repository returns `RequestDto`, not `Request`.** This is a read path; projecting to the DTO inside the query means only the displayed columns leave the database, which serves `REQ-N-001`. The naming is a known compromise — an object shaped like this is closer to a query handler than to a repository — and it is kept only to minimise churn in the supplied structure.

### 3.3 Infrastructure
*`REQ-N-001`, `REQ-N-002`, `REQ-F-001`–`REQ-F-009`, `REQ-F-011` (ADR-010)*

**Query composition order in `SearchAsync`** — fixed, because the order is what makes `REQ-N-001` hold:

1. `AsNoTracking()` — read path, no change tracking
2. **Permission restriction first and unconditionally** (`REQ-F-008`), skipped only for an administrator (`REQ-F-009`)
3. Each supplied filter added only when a value was actually provided (`REQ-F-001`–`REQ-F-004`, `REQ-F-006`) — never a blanket `WHERE x IS NULL OR …`, which defeats indexes
4. `CountAsync` for the total (`REQ-N-002`)
5. Ordering (`REQ-F-005`), then `Skip`/`Take` (`REQ-N-002`)
6. Projection to `RequestDto` inside the query (`REQ-N-001`)
7. Materialise

Two round trips — count, then page — are expected and correct.

**Indexes in `OnModelCreating`** (`REQ-N-001`), shaped to the queries actually issued: `(OwnerId, CreatedAt)` and `(AssignedToUserId, CreatedAt)` for the permission path combined with the default ordering; a single-column index on `CreatedAt`; `RequestNumber` for exact lookups, acknowledging that `REQ-F-001` will not use it (ADR-006).

**Deliberately absent: single-column indexes on `Status` and `RequestType`.** Measured against 200,000 seeded rows, their presence makes the planner prefer them over the permission indexes as soon as a status filter is applied — `Status IN (1,2)` matches a quarter of the table, the permission predicate a fraction of a percent, and SQLite reads the selectivity the wrong way round. The filtered search costs **41 ms with those indexes present and 0.4 ms without them**. An index the planner chooses and should not is worse than no index at all. Status and request type are never filtered on their own here: the permission restriction is always present and always the more selective term, so the composite indexes above are the ones that matter.

**UTC value converter** (`REQ-N-003`, `REQ-F-003`): SQLite has no date type, so a `DateTime` returns from the store with `Kind = Unspecified`. Both `DateTime` properties on `Request` are configured in `OnModelCreating` with a conversion that writes the value unchanged and restores the kind on read — `v => v` on write, `v => DateTime.SpecifyKind(v, DateTimeKind.Utc)` on read. The assertion is legitimate because only UTC is ever written (`REQ-N-003`). Without it the JSON response omits the `Z` suffix and every browser reads the timestamp as local time, while filtering still works — so nothing fails loudly. Because the write side is the identity function, the stored representation is unchanged and the indexes on `CreatedAt` are unaffected. *Alternative considered:* storing ticks as `long`, rejected because it makes the database file unreadable by hand and buys nothing here.

**Sort mapping** (`REQ-F-005`): a static map from permitted sort keys to typed expressions. No reflection-based dynamic ordering. A key absent from the map is a validation failure under `REQ-F-007`, not a silent fallback. The default ordering is `CreatedAt` descending, with `Id` as a tiebreaker so it is deterministic as the requirement demands.

**Seeding** (`REQ-N-001`): the 500-row seed is replaced by a bulk insert of **200,000** rows executed as a single `INSERT … SELECT` over a recursive CTE, which completes in a few seconds — about seven on this schema, where every inserted row also updates four indexes. Row-by-row `AddRange` at this volume takes minutes and is not used. **Owners and assignees are spread over a thousand identifiers**, not the five the supplied seed used: at five, one user is permitted to see a third of the table, the permission restriction stops being selective, and `REQ-N-001` cannot be demonstrated on the very path that exists to serve it. There is no `User` table to keep in step — owner and assignee are identifiers only, by decision recorded in `requirements.md`. *200,000 rows demonstrate the behaviour; the design is what holds at millions, and the README says exactly that rather than implying the seed proves it.* The generated database file is not committed.

Two rules that the move to a persisted store makes load-bearing. **The existing empty-check guard is preserved** — with InMemory it was decorative because every run started empty; with a file it is the only thing preventing a second startup from adding another 200,000 rows. And **seeded dates are relative to the moment of seeding**, so the data ages with the file: no test and no README example may assert against an absolute date. They assert against what the seed actually produced, or they filter by a range derived at run time.

**`Users` table (ADR-010, `[STAKEHOLDER #1]`).** Mapped in `OnModelCreating` alongside `Request`: `Id`, `Username` (unique index), `PasswordHash`, `Role`. `Request.OwnerId` and `AssignedToUserId` get a foreign key to `Users.Id` via `HasOne(...).WithMany().HasForeignKey(...)` — no navigation property either direction, consistent with `Request`'s existing shape. **Seed order: `Users` first, then `Requests`**, both inside `DbSeeder.Seed` and both behind the existing `if (db.Requests.Any()) return` guard, extended to gate the `Users` insert too. 1,000 `Users` rows are bulk-inserted with the same recursive-CTE technique as the 200,000 `Requests` rows; ids 1 and 2 additionally get a known `Username`/`PasswordHash` (via `IPasswordHasher`) for demonstration — Administrator and regular user respectively — documented in the README together with the plaintext demo passwords (a seeded, throwaway database, not a security boundary). **Consequence already flagged in ADR-010: this re-seeds from scratch**, so `requests.db` is deleted before the first run after this change, same as any other model change (§4).

**`JwtTokenGenerator : IJwtTokenGenerator` and `PasswordHasher : IPasswordHasher`** (ADR-008, ADR-009) live here as the framework-facing implementations of the Application-layer abstractions — `Microsoft.IdentityModel.Tokens`/`System.IdentityModel.Tokens.Jwt` for signing, `Microsoft.AspNetCore.Identity`'s `PasswordHasher<User>` for hashing. Neither is referenced above `Requests.Infrastructure`, preserving the dependency rule (§1, principle 1).

### 3.4 API
*`REQ-F-007`, `REQ-F-010`–`REQ-F-013`, `REQ-F-101`–`REQ-F-106`*

| Element | Serves |
|---|---|
| JWT bearer authentication scheme → `ClaimsPrincipal`; missing, unparseable or expired token yields **401**, never a default user | `REQ-F-010`, `REQ-F-013` (ADR-008) |
| `ClaimsCurrentUserAccessor` implementing `ICurrentUser` over `HttpContext.User` | `REQ-F-008`–`REQ-F-010` |
| `[Authorize]` on the controller; `ParseUserId` and the manual header reads never existed in this build | `REQ-F-010` |
| Single `[HttpGet]` action binding `[FromQuery] RequestSearchQuery` | `REQ-F-001`–`REQ-F-007` |
| `AuthController` — `[HttpPost("login")]`, `[AllowAnonymous]`, the one unauthenticated endpoint in the API; injects only `IAuthService` (§3.2), same shape as `RequestsController` injecting only `IRequestService` | `REQ-F-012` — `[STAKEHOLDER #1]` |
| `JsonStringEnumConverter` | `REQ-F-103` — without it the table renders `Status: 2` instead of a name |
| CORS policy for the UI origin, from configuration | `REQ-F-101`–`REQ-F-106` |
| `appsettings.json` — connection string, CORS origins, `Jwt` section (ADR-008) | `REQ-D-002` |

### 3.4a API contract

This is the seam between the two sides. Both §3.4 and §3.5 cite it rather than each assuming a shape; a mismatch here is a silent failure, not a compile error.

**Endpoint:** `POST /api/auth/login` *(ADR-008, `[STAKEHOLDER #1]` — serves `REQ-F-012`)*

Request:
```json
{ "username": "admin", "password": "…" }
```

200 response:
```json
{
  "token": "eyJhbGciOi…",
  "expiresAt": "2026-09-15T14:30:00Z",
  "username": "admin",
  "role": "Administrator"
}
```

`username` is returned so the client can render `REQ-F-109`'s "logged in as" element directly from this response — no client-side token decoding needed for display (review finding: the client cannot get this value any other way).

401 response (credentials do not match any account — `REQ-F-012`'s generic-rejection criterion):
```json
{ "title": "Invalid username or password.", "status": 401 }
```

**Endpoint:** `GET /api/requests`

**Authorization** (ADR-008, supersedes ADR-002's header scheme): standard `Authorization: Bearer <token>` header, where `<token>` is the value returned by `/api/auth/login`. Absent, unparseable or expired token → **401**. `X-User-Id` / `X-Is-Admin` no longer exist on this contract.

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
*`REQ-F-101`–`REQ-F-109`, `REQ-N-002`*

**Structure** under `frontend/src/app/`:

```
core/
  config/         app-config.service.ts, api-base-url.token.ts
  models/         request.model.ts, search-query.model.ts, paged-result.model.ts, user.model.ts
  services/       requests-api.service.ts, auth.service.ts
  interceptors/   auth.interceptor.ts
  guards/         auth.guard.ts
features/
  login/
    login-page/              (stateful — the login form, calls AuthService, shows REQ-F-108's error)
  request-search/
    request-search-page/      (stateful — owns state and hosts the filter controls)
    request-results-table/    (presentational)
app.routes.ts, app.config.ts, app.component.*
```

`current-user.service.ts` and `identity.interceptor.ts` (the identity-switcher design this section originally specified) are **not built** — `[STAKEHOLDER #1]` replaces the demonstration switcher with real login before any of it existed. `auth.service.ts` and `auth.interceptor.ts` take their place, described below.

**Models** — interfaces only, no behaviour. They exist so that the API service and the table agree on field names instead of each guessing.

| Model | Describes |
|---|---|
| `RequestDto` + `RequestStatus`, `RequestType` | One result row, mirroring §3.4a exactly. Enumerations are **string** unions, not numeric |
| `RequestSearchQuery` | Filter, sort and page state as one object — the single definition of "a search" |
| `PagedResult<T>` | The response envelope: `items`, `totalCount`, `page`, `pageSize` |

**Components** — two, not three, within `features/request-search/` (that count is unchanged by `[STAKEHOLDER #1]`; `LoginPageComponent` below is a separate feature area, not a third component in this one).

| Component | Kind | Owns | Inputs | Outputs |
|---|---|---|---|---|
| `RequestSearchPageComponent` | stateful | the filter form group, sort state, page state, and the loading / error / results state; renders the filter controls directly | — | — |
| `RequestResultsTableComponent` | presentational | nothing | `rows`, `totalCount`, `page`, `pageSize`, `sort`, `loading`, `errorMessage` | `sortChange`, `pageChange` |
| `LoginPageComponent` *(`features/login/`, `[STAKEHOLDER #1]`)* | stateful | the login form and its error state | — | — |

> **Why the filter form is not its own component.** It would never be reused, and splitting it would buy readability at the cost of passing a form group across a boundary for no other purpose. The split that *is* worth making is the table, because that boundary is what keeps sorting and paging on the server (see the state rules below).

**Services and configuration**

| Element | Responsibility |
|---|---|
| `AppConfigService` + `API_BASE_URL` token | Reads `site.config.json` once at bootstrap and exposes the address by injection (ADR-007). **The only place the API address exists** |
| `RequestsApiService` | One method, `search(query)`, building the query string exactly as §3.4a defines — including the repeated `status` parameter. Takes the base address by injection; holds no literal URL |
| `AuthService` *(`[STAKEHOLDER #1]`, ADR-008)* | `login(username, password)` calling `POST /api/auth/login`; stores `token`, `username`, `role` **straight from that response** in `sessionStorage` (ADR-008) — no client-side JWT decoding anywhere; `logout()` clears it and navigates to `/login` (`REQ-F-109`) |
| `authInterceptor` *(`[STAKEHOLDER #1]`)* | Attaches `Authorization: Bearer <token>` to every outgoing request to a protected endpoint, so no component or service handles it directly; on a `401` response, delegates to `AuthService.logout()` (`REQ-F-109`) |
| `authGuard` *(`[STAKEHOLDER #1]`)* | A functional route guard on the request-search route: no valid session → redirect to `/login` (`REQ-F-109`) |

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
| `REQ-F-108` *(`[STAKEHOLDER #1]`)* | `matInput` fields for username and password, same pattern as `REQ-F-001`'s text field |

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
| Multiple statuses filter correctly **as a regular user**, over data containing matching requests owned by someone else | `REQ-F-002`, `REQ-F-008` | repository |
| Paging returns the right rows and the right total count | `REQ-N-002` | repository |
| An inverted date range is rejected | `REQ-F-007` | validation |

**Why these six.** The two permission tests are the decisive acceptance test named in `REQ-F-010` — the same search as two identities must return different sets and different totals. The mid-string test catches a `StartsWith` written by reflex, the single most likely silent defect in the feature (ADR-006). The paging test asserts that `totalCount` is the filtered, permission-restricted count and not `items.Length`, the defect that makes the paginator show one page. The multi-status test carries a second load, and it is the reason it earns its slot. On its own an `IN` clause rarely fails quietly, which is what made it the weakest of the six. Run as a **regular user**, over a set that includes requests matching the status but belonging to someone else, it becomes the only test asserting `REQ-F-008`'s criterion that the restriction **holds under every combination of filters** — the failure where a filter is composed in a way that replaces the permission clause instead of narrowing it. That combination is otherwise untested: the two permission tests apply no filter, and a filter test that runs as an administrator asserts nothing about identity.

**Two more, `[STAKEHOLDER #1]`.** Kept separate from the six above rather than folded into "the six" — they test the authentication pipeline (ADR-008), not the search feature, and the six's rationale is specifically about search. Both run at the API level (`WebApplicationFactory`), since that is where `REQ-F-012`/`REQ-F-013` actually operate.

| Test | Covers | Level |
|---|---|---|
| Login with correct credentials returns a token; login with wrong credentials returns 401 with the generic message | `REQ-F-012` | API |
| `GET /api/requests` with no token, and with an expired token, both return 401; with a valid token it returns 200 | `REQ-F-013` | API |

---

## 4. Explicit design constraints

Each of these prevents a specific defect. They are listed because every one of them is easy to get wrong and silent when wrong.

*On the `Enum.IsDefined` row: the check validates that the **value** is defined, not that the **wire format** was a name. `status=2` therefore passes and binds to `InProgress`. That is sufficient for `REQ-F-007` and cheaper than policing the format.*

| Constraint | Protects | Failure if ignored |
|---|---|---|
| `RequestSearchQuery` is a `record` **with a body and `init` properties**, not a positional record | `REQ-F-001`–`REQ-F-007` | A positional record has no parameterless constructor; model binding fails |
| The status collection is typed `List<T>` or `T[]`, **not `IReadOnlyList<T>`** | `REQ-F-002` | The collection binder requires an `ICollection<T>`-compatible target; `IReadOnlyList<T>` binds to null silently |
| The status property is named `Status`, matching its query-string name, so no `[FromQuery(Name = …)]` is needed | `REQ-F-002` | A differing name arrives unbound — and reaching for the attribute to fix it pulls an MVC reference into `Requests.Application`, which may reference only `Requests.Domain` (§1, principle 1) |
| Date upper bound is `CreatedAt < end.Date.AddDays(1)` | `REQ-F-003` | Everything created on the end day is excluded |
| Incoming date bounds are normalised to UTC | `REQ-F-003`, `REQ-N-003` | A local-midnight boundary shifts results by hours |
| `DateTime` properties carry a converter restoring `DateTimeKind.Utc` on read | `REQ-N-003`, `REQ-F-003` | SQLite returns `Unspecified`, the response omits `Z`, and the browser shifts every displayed timestamp to local time. Filtering still works, so nothing fails loudly |
| `string.Contains` for the partial match, **not** `EF.Functions.Like` | `REQ-F-001` | `LIKE` treats `%` and `_` in user input as wildcards, so a user typing `%` matches every row. If `LIKE` is ever reintroduced, the value must be escaped and an `ESCAPE` clause supplied (ADR-006) |
| `JsonStringEnumConverter` registered | `REQ-F-103` | Enumerations render as integers |
| Angular Material's date adapter is provided | `REQ-F-101` | The date-range input fails at runtime |
| The results table is **not** bound to the component library's built-in client-side sorting and paging source | `REQ-N-001`, `REQ-N-002` | Sorting and paging silently happen on one page of data |
| Paginator length comes from the response total | `REQ-N-002` | Navigation shows one page regardless of the real result size |
| The paginator's zero-based `pageIndex` is converted to the one-based `page` of §3.4a, in both directions | `REQ-N-002`, `REQ-F-007` | The first render sends `page=0`, which `REQ-F-007` defines as invalid input, so the screen opens on a 400 before the user has touched anything |
| The CORS policy allows the `Authorization` header, not only the origin | `REQ-F-010`, `REQ-F-013`, `REQ-F-101`–`REQ-F-106` | A bearer token makes every call a preflighted request, and a policy naming only the origin fails the preflight. The failure is invisible to `curl`, so every non-browser test exonerates the server |
| A cleared sort control sends no sort parameters at all | `REQ-F-005`, `REQ-F-007` | `matSort`'s third click emits an empty direction, which is submitted as `sortDirection=` and rejected with 400 |
| `RequestSearchQuery.Validate` checks `Enum.IsDefined` for every supplied `status` and for `requestType` | `REQ-F-002`, `REQ-F-004`, `REQ-F-007` | The binder accepts any integer for an enum, so `status=99` binds, matches nothing, and returns an empty page with `200` instead of a `400` — the exact silent absorption `REQ-F-007` forbids |
| After any model change, a new migration is added (`dotnet ef migrations add <Name>`) | `REQ-N-001` | Editing `OnModelCreating` without a matching migration leaves the running database's schema stale; `Database.Migrate()` only applies migrations that exist |
| The `Jwt:Key` in `appsettings.json` is at least 256 bits (32 ASCII characters) `[STAKEHOLDER #1]` | `REQ-F-013` | HS256 throws at startup on a shorter key — a fast, loud failure, but worth listing so it isn't mistaken for a code defect |
| Password verification always goes through `IPasswordHasher.Verify`, never a direct `==` on hashes `[STAKEHOLDER #1]` | `REQ-N-004` | `PasswordHasher<T>` output is salted, so two hashes of the same password differ; a direct comparison rejects every correct password |
| `JwtBearerOptions.TokenValidationParameters.ClockSkew` is set to `TimeSpan.Zero` `[STAKEHOLDER #1]` | `REQ-N-005`, `REQ-F-013` | The library default is 5 minutes; a token expired by less than that still validates, so a test (or a real client) built around "expired means rejected" silently passes when it should fail |

---

## 5. Build order

Dependency-ordered. Each step names what it serves and how it is verified.

| # | Step | Serves | Verification |
|---|---|---|---|
| 1 | Solution file; switch provider to SQLite; `InitialCreate` migration + `Database.Migrate()`; indexes in `OnModelCreating`; 200k bulk seed for `Requests`; **`Users` table, FK from `Request.OwnerId`/`AssignedToUserId`, and 1,000-row `Users` seed with two documented demo logins (ADR-010, `[STAKEHOLDER #1]`)** | `REQ-N-001`, ADR-001, `REQ-F-011` | Application starts; database file is created and populated; `SELECT COUNT(*) FROM Users` = 1000 |
| 2 | `ICurrentUser`, `PagedResult<T>`, `RequestSearchQuery` with validation | `REQ-F-001`–`REQ-F-007`, `REQ-N-002` | Compiles; validation rules reviewed against `REQ-F-007`'s table |
| 3 | Replace `IRequestRepository` / `IRequestService` / `RequestService`. **In the same step, delete the two existing tests and `FakeRequestRepository`** — they implement and call the removed `GetAllAsync`, so the solution does not build until they go. Replacements arrive in step 6 | `REQ-F-010` | No unfiltered data path remains anywhere. **The solution does not build until step 4** — `RequestRepository` still implements the removed `GetAllAsync`, so steps 3 and 4 run back-to-back and the build gate is at the end of step 4 |
| 4 | `RequestRepository.SearchAsync`, sort mapping | `REQ-F-001`–`REQ-F-009`, `REQ-N-001` | `dotnet build` succeeds — the first green build since step 3; `EXPLAIN QUERY PLAN` shows index use on the permission path |
| 5 | **JWT bearer authentication (ADR-008), `IPasswordHasher`/`IJwtTokenGenerator` implementations (ADR-009), `AuthController` login endpoint**, `ClaimsCurrentUserAccessor`, controller, `Program.cs`, `appsettings` `Jwt` section | `REQ-F-010`–`REQ-F-013`, `REQ-F-007` | No token → 401; login with valid/invalid credentials behaves per `REQ-F-012`; regular-user and Administrator tokens return different totals |
| 6 | Six search tests, plus **two authentication tests (`[STAKEHOLDER #1]`, §3.6)** | `REQ-T-001`, `REQ-F-012`, `REQ-F-013` | `dotnet test` green — 8 passed |
| 7 | UI: project setup; `site.config.json` and the config service; models; API client and **auth interceptor**; **login page and route guard (`[STAKEHOLDER #1]`, `REQ-F-108`/`109`)**; search page with the filter controls; results table; the three states | `REQ-F-101`–`REQ-F-109`, `REQ-N-002` | All four search-interaction states exercised against the running API, reached only after a real login; changing the address in `site.config.json` retargets the client without a rebuild |
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
| `REQ-F-010` | ADR-002 *(superseded)*, ADR-008, §3.2, §3.4 |
| `REQ-F-011` | ADR-010, §3.1, §3.3 |
| `REQ-F-012` | ADR-008, ADR-009, §3.2, §3.3, §3.4, §3.4a, §3.6 |
| `REQ-F-013` | ADR-008, §3.4, §3.4a, §3.6 |
| `REQ-F-101`–`REQ-F-106` | ADR-005, §3.4a, §3.5 |
| `REQ-F-107` | ADR-005, ADR-007 |
| `REQ-F-108`, `REQ-F-109` | §3.5 |
| `REQ-N-001` | ADR-001, §3.3 |
| `REQ-N-002` | ADR-003, §3.3, §3.4a, §3.5 |
| `REQ-N-003` | §3.3, §3.4a, §4 |
| `REQ-N-004` | ADR-009, §3.2, §4 |
| `REQ-N-005` | ADR-008, §3.4a |
| `REQ-T-001` | §3.6 |
| `REQ-D-002` | ADR-007, §5 step 8 |
| `REQ-D-003`–`REQ-D-012` | §5 step 8 |
