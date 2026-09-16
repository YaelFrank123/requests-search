# AI-usage

A record of how AI was used throughout this exercise — from Architecture (Parts B/C), through implementation (Part A), to testing. The use was extensive and deliberate: AI served as a design partner and reviewer, not as a one-shot "write me some code" tool. I used three tools in distinct roles — Claude Code for design and implementation, Cursor for code review after every meaningful step, and ChatGPT for a second opinion at junctions where I wanted an independent source.

## 1. Which AI tools I used

**Claude Code** (Claude, Sonnet 5) — the primary tool, in one continuous conversation across the whole exercise. Not a point-wise code completion tool (like Copilot) but an agent that read the repo, wrote documents, code and architecture diagrams (SVG), ran commands (`dotnet build`/`test`, `sqlite3`, `curl`), and answered as a reviewer in a separate role before implementation.

Because Claude Code was with the project from the first step, it carried every assumption accumulated along the way — so whenever I wanted to consult a tool with **no preconceptions about the project**, I went in parallel to **Cursor** and **ChatGPT**: the same question, without revealing the answer I already had and without leading toward a particular one. I did this, for example, **when producing the diagrams** — I showed a diagram to a tool that had not been part of the conversation that produced it, and asked it to read the diagram like a fresh reviewer: what it understands from the diagram as it stands, not what I intended it to convey. The gaps that surfaced there fed the revision rounds (see section 3).

**ChatGPT** — for general questions, mainly when I wanted a **second opinion** and was not satisfied with a single answer. The use was deliberate: when a decision looked significant to me, or when Claude Code's reasoning did not convince me, I put the same question to a different tool without leading it, and compared. Where both tools converged on the same answer, I accepted it; where they diverged, that was the signal to decide by the brief rather than by the tool (see section 4).

**Cursor** — for **code review** after every meaningful step. Not to write code, but as a second pair of eyes on code that already existed: after each substantive task in `tasks.md` (the repository layer, validation, the auth flow, the frontend) I put the diff through Cursor for a CR round. The advantage was that it had not seen the conversation chain that led to the code, so it read the code the way a fresh reviewer reads it — without the context that pre-explains every decision.

## 2. At which stages

| Stage | Use |
|---|---|
| **Architecture (Parts B/C)** | Initial structural design, the asynchronous outbox flow for notifications, and the cloud deployment design — before any code was written |
| **Architecture diagrams** | All diagrams were produced in Claude Code: the logical microservices diagram (Part B) and the two AWS deployment diagrams (Part C) — `cloud-aws-current-code.svg` for what the existing code actually deploys, and `cloud-aws-extended-architecture.svg` for the target architecture. A basic diagram first, then a deep interrogation that led to the finished artifact (see section 3) |
| **Planning / Spec** | `requirements.md` (WHAT, EARS phrasing), `design-feature.md` (HOW, ADRs) — written together with the AI, including a coverage table linking requirement ↔ decision ↔ code |
| **Independent review** | Before implementation, I ran the AI in the role of a **senior reviewer** over both documents against the brief and against the existing source. The output: `spec-review-fixes.md` — 10 numbered fixes, each with a precise problem and a reason. **8 of 10 were applied as written, 2 were rejected** (section 4 below) |
| **Implementation (backend + frontend)** | Writing code per `tasks.md`, task by task, with a build/test gate between tasks |
| **Code review after every meaningful step** | **Cursor** on the diff at the end of each substantive task (repository, validation, auth, frontend) — a second reviewer that had not seen the design conversation and therefore judged the code as it is, not by the intent behind it |
| **Second opinion at junctions** | **ChatGPT** for general questions not tied to this specific repo (JWT trade-offs, query planner behavior, Angular conventions) — asked in parallel without exposing the first answer, and compared before deciding |
| **Testing** | Writing the 8 tests (6 repository/validation + 2 authentication), and choosing the test cases themselves (see section 5) |
| **Mid-work stakeholder discussions** | When the authentication requirement reversed (`[STAKEHOLDER #1]` — full auth added) I went back over ADR-002 with it (originally: identity from a header) and built ADR-008 (JWT) as a separate, documented decision — recorded as a reversal, not as a silent patch |

## 3. If AI was used for design — what I changed from what it proposed, and why

The initial design proposal (kept in `archive/eager-growing-matsumoto.md` as process documentation, not as a source of truth) was bloated and mixed WHAT + HOW + WHEN in a single file. I split it myself into `requirements.md` / `design-feature.md` / `tasks.md`, then ran a separate **review** round over the result. The substantive changes that came out of that review and were applied are below (the main ones; the remaining fixes were wording and documentation — updating the coverage table, terminology clarifications, and so on):

| # | What the original proposal said | What changed | Why |
|---|---|---|---|
| 1 | Required case-insensitive matching + `EF.Functions.Like` | The requirement was dropped; the implementation moved to `string.Contains` | Case-insensitivity was achieved "by accident" thanks to SQLite alone — it would have broken silently on PostgreSQL/SQL Server. `Contains` also avoids escaping `%`/`_`, which the brief never asked for |
| 2 | No mention of `Kind` changing when reading from SQLite | Added a value converter that restores `DateTimeKind.Utc` on read | SQLite loses the `Kind`; without it the JSON loses its `Z` and the browser renders local time — a completely silent failure, since search itself keeps working |
| 3 | `status=99` (an undefined enum value) — unhandled | Added an `Enum.IsDefined` check in validation | The ASP.NET Core binder accepts any integer for an enum without checking that it is defined; `status=99` would return `200` with an empty list instead of `400` — exactly the silent swallow that `REQ-F-007` forbids |
| 4 | 5 tests included ordinary "multi-status filtering" | Replaced with a "mid-string match" test (and eventually multi-status was combined with permissions in one test) | `IN (...)` can hardly fail silently; a `StartsWith` written out of habit very much can — and that is precisely the trap documented in ADR-006 |
| 5 | A build order that did not note the third step breaks the build | Added an explicit note that the old tests are deleted **in that same step** | Without it, anyone following the plan hits a red build midway with no way to tell an expected failure from their own mistake |
| 6 | No note that the seed guard and seed dates become critical once moving to persistent SQLite | Added two explicit rules (guard, and relative dates) | With InMemory none of it mattered (everything resets each run); with a persistent file, without a guard every other startup duplicates 200,000 rows |

**The diagrams were built the same way — not in a single shot.** The logical diagram (Part B) and the AWS deployment diagrams (Part C) were produced in Claude Code, and the first output was a **basic diagram** (`2-architecture.svg`): the boxes and arrows were there, but the diagram described a structure rather than **decisions** — it did not distinguish a synchronous call from an asynchronous event, did not show that each service owns its datastore exclusively, and said nothing about what happens when one side goes down. From there I ran a **deep interrogation** in rounds: for every element in the diagram I asked what it guarantees, what it does *not* guarantee, and what happens if the party on the other end is unavailable. Each round produced a fix, and the three finished artifacts carry the answers on the face of the diagram:

- **`architecture-generic.svg`** — the logical, technology-agnostic diagram, six domains: an explicit legend separating `SYNC API` from `ASYNC MESSAGE`, an owned datastore per service, and outbox / at-least-once / DLQ marked on the flow itself rather than left in prose
- **`cloud-aws-current-code.svg`** — the deployment of the **code that actually exists** (the `Requests.Api` monolith), including the note that no API Gateway is needed because the application validates its own JWT
- **`cloud-aws-extended-architecture.svg`** — the **target** architecture, with API Gateway (JWT authorizer + throttling), an internal ALB, ECS on Fargate across 2 AZs, and outbox/DLQ/idempotency on the event path

Separating the two AWS diagrams is itself a result of that interrogation: a single diagram that mixes "what exists" with "what will exist" makes it hard for a reviewer to tell written code from intent.

**One more significant change, not from the review but from a mid-work stakeholder requirement:** ADR-002 (identity arrives from a header, no real auth) was **not deleted** but marked as superseded, and ADR-008 (full JWT) was added. Why document rather than overwrite: ADR-002 itself predicted (under "Consequences") that moving to a real token would change only the scheme registration and that `ClaimsCurrentUserAccessor` would remain untouched — that prediction was **tested in practice** in ADR-008 and confirmed: no change to `ClaimsCurrentUserAccessor` was needed.

## 4. Were there proposals I rejected — examples and reasoning

**The most significant proposal I rejected: Claude Code recommended avoiding JWT entirely.**

Its argument was that this adds too much complexity relative to the time budget — registering an authentication scheme, managing a signing key, token lifetime, storing the token client-side, an interceptor, a guard, handling 401s and refresh — and it proposed staying with header-supplied identity (ADR-002) and marking authentication as out of scope.

**I disagreed, and decided to implement JWT.** My reasoning: you cannot implement real **user management** without real authentication. Once there are two roles, and requests visible only to their owner or assignee, "identity comes from a header" is not a scope limitation but a hole: any client can declare itself to be any user, and the entire permission layer above it becomes decorative. The permission model was already the heart of the implementation (including the composite indexes built around it) — so it had to rest on an identity the server validates, not one the client declares.

As for the complexity argument itself: yes, it was real, but smaller than presented. ADR-002 had already predicted that moving to a real token would touch only the scheme registration and not `ClaimsCurrentUserAccessor` — meaning the cost was priced in up front. In practice the prediction held: moving to ADR-008 required no change to `ClaimsCurrentUserAccessor`. I took the savings elsewhere, deliberately: HS256 rather than RS256, `PasswordHasher<User>` rather than full ASP.NET Core Identity — that is, I gave up the extras around the JWT, not the JWT itself. A stakeholder requirement later confirmed this direction, but the decision was made before it, not because of it.

Other rejected proposals:

| Rejected proposal | Source | Why it was rejected |
|---|---|---|
| **ADR-007 option C** — a `site.config.json` read at runtime, as the initial default | The AI's original proposal (preferred over B "because runtime configuration was requested") | On re-checking the brief, no such requirement actually existed. Option B (build-time, `environment.ts`) achieves the property that matters — "no URL scattered through the code" — almost for free, against a real cost (an initializer, load-failure handling, an asset needing exclusion) that was not justified. It was swapped back once a stakeholder did require runtime config — and documented as a "retained alternative", not as a mistake |
| **`EF.Functions.Like` for partial matching** | An initial AI proposal for ADR-006, to "preserve case-insensitivity" | Case-insensitivity itself was rejected (see table above) — and once it was, `LIKE` had no advantage left, only cost: `%`/`_` in user input become wildcards and require escaping. `Contains` (translated to `instr`) is free of that risk entirely |
| **Single-column indexes on `Status`/`RequestType`** | An initial AI proposal ("add indexes to every filter column") | **Measured, not assumed**: with those indexes in place, the planner prefers them over the permission indexes as soon as a status filter is present — and filtered search went from 0.4ms to **41ms**. An index the planner picks by mistake is worse than an index that does not exist |
| **`StartsWith` for partial matching** (instead of Contains) | Considered during design as the "safer" (sargable) option | The brief defines "partial match" as matching **anywhere** in the string, not just at the start; all request numbers share a fixed prefix (`REQ-`), so a prefix search would force the user to type a prefix that carries no information — directly contrary to the meaning of "partial" |
| **Keyset/seek pagination** instead of offset | Considered as an alternative to ADR-003 | `REQ-N-002` requires `totalCount` for the paginator; keyset gives no total count and no jump to an arbitrary page — it does not satisfy the requirement as written. Documented as "the next step" if the scrolling pattern changes |
| **Full ASP.NET Core Identity** (`IdentityDbContext`/`UserManager`) | Alternative A in ADR-009 | Brings a whole table set (`AspNetUsers` etc.) and a surface of capabilities (lockout, email confirmation, external login) that nothing in the exercise asked for, against a model of two roles and seeded accounts. Bare `PasswordHasher<User>` gives the same PBKDF2 hashing without the surface |
| **RS256** (asymmetric signing) for the JWT | Considered in light of ADR-001 (`REQ-A-001`, future split into microservices) | No other service validates a token today — the extra machinery (key pair management, a JWKS endpoint) buys nothing right now. HS256 was chosen, and RS256 documented as "the next step" once a second service needs to validate independently |
| **Mediator pattern** for the login flow | Considered in order to "match" a common convention | Nothing in the project already uses a mediator; introducing one for a 3-step login flow is exactly the premature abstraction that §1 principle 1 forbids. A plain `AuthService` was chosen, in exactly the same shape as the existing `RequestService` |
| **A separate Angular component for the filter form** | Considered for classic separation of concerns | The form will not be reused anywhere else; the split would have cost readability (passing a FormGroup across a component boundary) without buying anything. The split that was worth it — the results table — was done, because there is a real boundary there (to prevent client-side sorting/paging) |

## 5. How I verified the result is correct

Verification was done **by measurement**, not by assumption — a principle that recurred throughout the work:

| What was checked | How |
|---|---|
| Index performance | A real `EXPLAIN QUERY PLAN` against the seeded `requests.db` — the output (`MULTI-INDEX OR` over the two composite indexes) was copied and documented in the README, not described "approximately" |
| The impact of a Status/RequestType index | Measured in practice: 0.4ms without it against 41ms with it, over the same 200,000 records |
| Seed time | Measured: roughly 7 seconds for 200,000 rows via a single CTE, against "minutes" for row-by-row `AddRange` (not run to completion — inferred from the mechanism) |
| FK enforcement in practice | A manual `INSERT` with `OwnerId=999999` was run directly — rejected with `FOREIGN KEY constraint failed` when the pragma is on (EF Core's default), accepted when off (the raw CLI) — proof that enforcement is real, not merely declared in the schema |
| Permission counts (372 out of 200,000) | Measured directly against the DB (`SELECT COUNT(*) WHERE OwnerId=... OR AssignedToUserId=...`), not computed theoretically — including a self-correction: I noticed that 372 for user 1 follows from the existing formula, but 372 for user 2 is a **new** value that had not been measured and was not assumed equal |
| Build/test at every stage | `dotnet build`/`dotnet test` were run as a gate between every two tasks in `tasks.md` — no task was marked done without its gate actually passing; the tests were run **twice in a row** to confirm no state leaks between them (shared SQLite in-memory) |
| The API end to end | A real `curl` series against a running server — correct/incorrect login, a request with no token / an expired token / a valid token, invalid enum values, `page` beyond the last — not just reading the code |
| The full login flow in the browser | Checked manually: signing in with both seeded accounts, a wrong password (stays on the page + a generic message), logout (returns to `/login`, the guard blocks re-entry) |
| Spec-to-code consistency | The coverage table in `requirements.md` was checked in both directions against §6 of `design-feature.md` at the end of every change round — never assumed to still be correct |
| Independent review before implementation | The AI was run as a senior reviewer over the spec **before** any code was written, and its recommendations went through filtering (8/10 applied, 2/10 explicitly rejected — section 4) rather than being applied automatically |
| Cross-tool CR after every step | The diff of each substantive task went through **Cursor** for review in a different tool than the one that wrote the code — so the reviewer would not inherit the author's assumptions. Accepted comments were addressed before moving to the next task |
| Contested decisions | At every junction where the reasoning did not convince me, I put the same question to **ChatGPT** without leading it. Disagreements between the tools were settled by the brief and by measurement, not by whichever answered with more confidence (the standout case: JWT — section 4) |
