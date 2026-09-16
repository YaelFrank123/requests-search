# CandidateTest — Requests Search & Filtering

Take-home exam solution: search/filtering feature (Backend + Frontend), plus architecture and cloud design documents.

- Requirements: [`specs/requirements.md`](specs/requirements.md)
- Feature design (ADRs, API contract, data model): [`specs/design-feature.md`](specs/design-feature.md)
- AI usage: [`AI-usage.md`](AI-usage.md)

## How to run

### Backend

```bash
cd BE
dotnet run --project src/Requests.Api
```

- API listens on `http://localhost:60702` (see `BE/src/Requests.Api/Properties/launchSettings.json`).
- On first run it applies EF Core migrations to create `BE/src/Requests.Api/requests.db` (SQLite) and seeds it: 1,000 users and 200,000 requests. This takes a few seconds the first time only.
- **If you change the EF model**, add a migration (`dotnet ef migrations add <Name> --project src/Requests.Infrastructure --startup-project src/Requests.Api`) — `Database.Migrate()` applies pending migrations automatically on the next run.
- Demo logins (seeded, see `BE/src/Requests.Infrastructure/Persistence/DbSeeder.cs`):
  | Username | Password | Role |
  |---|---|---|
  | `admin` | `Admin123!` | Administrator |
  | `user` | `User123!` | User |
- Swagger UI is available at `/swagger` when running in Development.

### Frontend

```bash
cd FE
npm install
npm start
```

- Serves on `http://localhost:4200`.
- The API address is read from `FE/src/assets/config/site.config.json` (`apiBaseUrl`), not hardcoded — change it there if the backend runs on a different port, no rebuild required. `site.config-dev.json`, `site.config-qa.json` and `site.config-prod.json` in the same folder are per-environment bases; only `site.config.json` is fetched at runtime.
- Log in with one of the demo accounts above; the app is guarded and redirects to `/login` without a valid session.

## How to run tests

```bash
cd BE
dotnet test
```

Runs the `Requests.Tests` project against a real SQLite database (in-memory-mode SQLite, not EF's InMemory provider — see `SqliteTestDatabase.cs`), so the same query translation used in production is exercised. Covers the permission boundary (regular user vs. Administrator), invalid-input rejection, paging/total-count correctness, and the login/token pipeline. See `REQ-T-001` in `specs/requirements.md` for the coverage rationale — the goal is a small, meaningful set, not broad low-value coverage.

No frontend tests were added in the time available (see "What wasn't completed" below).

## Technologies chosen, and why

The repository as supplied already fixed .NET 8 / ASP.NET Core Web API / EF Core on the backend; that stack was kept rather than replaced, since nothing about the brief motivated a change and switching would have spent the time budget on risk instead of on the feature.

- **Backend:** .NET 8, ASP.NET Core Web API, EF Core — as supplied.
- **Architecture: Clean Architecture** (`Requests.Domain` → `Requests.Application` → `Requests.Infrastructure` → `Requests.Api`), the layering the supplied repository already used, kept rather than collapsed into fewer projects. It keeps the domain and business rules (search/permission logic) free of any framework or EF Core dependency, so the query and permission logic in `Requests.Application` is testable in isolation and the persistence provider can be swapped (as it was, InMemory → SQLite) without touching it. It's a proven, widely-understood shape for a project of this size — efficient to work in and easy for another engineer to navigate without extra onboarding.
- **Database: SQLite file**, replacing the supplied EF Core **InMemory** provider. `REQ-N-001` requires the design to hold up against millions of rows, and the InMemory provider does not translate LINQ into real SQL or enforce indexes — it cannot demonstrate that requirement at all. SQLite gives real query translation and real indexes with zero external dependency (no server to install or document), so `REQ-D-002` ("how to run") stays a one-line `dotnet run`. See `ADR-001` in `specs/design-feature.md` for the full comparison against a networked engine (PostgreSQL/SQL Server), which was rejected specifically because it would have turned "how to run" into a setup task disproportionate to a 3-hour exam.
- **Authentication: full JWT**, added at your explicit request after the spec was first written (`[STAKEHOLDER #1]` in `specs/requirements.md`). The brief itself asked only for *authorization* (permission enforcement), not sign-in — but an authorization check enforced against a client-asserted identity (e.g. a header) isn't a real security boundary, only a simulated one. Implementing full login (`POST /api/auth/login`, salted password hashes, a signed bearer token, server-side verification on every request) makes the permission boundary actually real rather than assumed. See `ADR-008`/`ADR-009` in `specs/design-feature.md`.
- **Frontend:** Angular (the brief allowed Angular or React) — chosen as the team's existing stack, matching the profile this exam is aimed at (see `ADR-005` in `specs/design-feature.md` for the full rationale, including why Angular Material was used for the form/table controls).

## Assumptions

Every assumption below follows *necessarily* from a stated requirement — see `specs/requirements.md` §"Derived requirements" for the full rule and rationale:

- **Paging is required**, with defined default and maximum page sizes, even though the brief never mentions it. An endpoint returning every matching row is not implementable against millions of rows — not in memory, not in bandwidth, not in the UI.
- **UTC is the single time zone** for storage and for computing date-range boundaries. `REQ-F-003` defines a date range but fixes no time zone; without one, the same range would return different results depending on the client's local time.
- **Request Number partial match is case-unspecified**, not guaranteed case-insensitive. Request numbers are stored in one fixed uppercase format, so guaranteeing case-insensitivity portably (a provider-specific `LIKE`/`ILIKE`/collation branch, or an extra normalized+indexed column) would be permanent machinery paid for a case that never actually occurs.
- **Invalid input is rejected strictly** — never silently ignored or defaulted (an unknown sort field, an inverted date range, a page size of `0`, etc. all fail the request with field-level detail). A value that silently falls back to a default hides client-side bugs instead of surfacing them.
- **The `Jwt:Key` in `appsettings.json` is a development convenience, not a production posture** — it is source-controlled and clearly labeled as such; a real deployment would pull it from a secret store (see the cloud design document).

## A technical decision with real alternatives

See "Technologies chosen, and why" above for the two decisions made at your request (SQLite over InMemory; full JWT authentication) — both are written up in full, with the alternatives that were considered and rejected, as `ADR-001` and `ADR-008`/`ADR-009` in [`specs/design-feature.md`](specs/design-feature.md).

## What wasn't completed, and how I'd continue

- **Broader code review.** The implementation was reviewed as it was written, but a dedicated, second-pass review (of the kind `/code-review` or a second engineer would do) was not performed end-to-end. I'd run one before treating this as production-ready.
- **Broader test coverage.** `REQ-T-001` deliberately scopes tests to a small, meaningful set (the permission boundary, invalid-input rejection, paging/total-count, and the auth pipeline) rather than exhaustive coverage. Given more time I'd add: frontend unit/component tests (none exist yet — see `dist/test-out` if a run was attempted), an EF Core query-plan check asserting the permission filter actually uses the intended index rather than just returning correct rows, and boundary tests for the date-range edge (`23:59:59.999` on the end day).
- **Lookup tables instead of hardcoded enums.** `RequestStatus` and `RequestType` are currently plain C# enums baked into the schema, not rows in their own tables. That's fine for a fixed, small set of values at this scale, but it means adding or renaming a value requires a code change and a migration rather than a data change, and the UI's dropdown options are duplicated from the same hardcoded list instead of being fetched from the API. I'd continue by adding `RequestStatuses`/`RequestTypes` tables, exposing them through a small reference-data endpoint, and having the frontend populate its filter options from that endpoint instead of a local hardcoded list.
- **More thorough error handling.** Error handling exists for the cases the requirements call out explicitly (`REQ-F-007` invalid input, `REQ-F-013` auth failures), but it isn't yet consistent end-to-end — some failure paths (e.g. unexpected server errors, network failures on the frontend) don't yet have the same level of field-level detail or a uniform response shape. I'd continue by adding a global exception-handling middleware that maps every unhandled exception to the same `ProblemDetails` shape already used for validation errors, and auditing the frontend's HTTP error interceptor against every backend error case to make sure each one produces a clear, distinct message rather than a generic fallback.
- **Security review of the JWT mechanism.** The JWT implementation (`ADR-008`/`ADR-009`) was built to satisfy the stated requirements (`REQ-F-012`/`013`, `REQ-N-004`/`005`) but was not put through a dedicated security review — e.g. confirming the signing algorithm can't be downgraded/confused (`alg: none`), that token validation checks issuer/audience/lifetime together rather than any one alone, that the signing key has no weaker fallback path, and that no sensitive data leaks into the token's claims. I'd continue by running that review (and ideally a basic pen-test pass) before treating the auth flow as production-ready, beyond the dev-only key caveat already noted under Assumptions.
- **Structured logging / correlation IDs.** There's no structured logging or correlation ID threaded through a request today — just the default ASP.NET Core console logger. That's enough to see that a request happened, but not enough to trace one request's path through validation → permission filter → query → response, or to correlate a frontend error report with the matching backend log line. I'd continue by adding middleware that stamps each request with a correlation ID (returned in a response header), enriches the logger scope with it, and moves to structured (JSON) logs — this is also what the cloud design docs' Monitoring component (`REQ-C-001`) assumes exists but doesn't yet.
- **API rate limiting.** The spec explicitly scoped *login* lockout out ("Out of scope" in `specs/requirements.md`) — but that decision was about brute-force protection on credentials specifically, not about the search endpoint. Today `GET /api/requests/search` has no throttling at all, so a single client could hammer it with no pushback. I'd continue by adding ASP.NET Core's built-in rate-limiting middleware on the search endpoint, tuned loosely (this is a demo, not a public API) — mainly so there's *something* there rather than nothing, and to close a gap that's otherwise silently absent.

## Architecture and cloud design (Part B / Part C)

Three diagrams in the repository root, addressing `REQ-A-001`/`REQ-A-002` (microservices architecture) and `REQ-C-001` (cloud deployment):

- [`architecture-generic.svg`](architecture-generic.svg) — the microservices architecture for the project's future, more complex form: the domain split (Customers, Requests, Notifications, Documents, Reporting), the boundaries between them, and how reliable communication is guaranteed for the create/status-change → notification scenario while the Notification service may be temporarily unavailable.
- [`cloud-aws-current-code.svg`](cloud-aws-current-code.svg) — a cloud deployment sketch (AWS) for the project **as it exists today** — the single Requests API and its SQLite/relational store, addressing Compute, DB, Messaging, Monitoring and Scaling.
- [`cloud-aws-extended-architecture.svg`](cloud-aws-extended-architecture.svg) — a cloud deployment sketch (AWS) for the **extended, microservices** architecture in `architecture-generic.svg` — the same five components, but for that split-service future.

*See `AI-usage.md` for how these diagrams were produced.*
