# Requirements — Requests Search & Filtering

> **This document is the project's source of truth.**
> It states **what** the system must do, never **how**. Every technical decision — technology choice, layering, query strategy — lives in `design-feature.md` or `design-architecture-cloud.md` and cites requirement IDs from here.
> If a design document or the code contradicts this document, **this document wins** and they are corrected.

**Source:** the assignment brief (Hebrew), and nothing else. No requirement here was derived from an earlier planning document or from a proposed implementation.

## Conventions

| Prefix | Scope |
|---|---|
| `REQ-F-0xx` | Functional — server side |
| `REQ-F-1xx` | Functional — user interface |
| `REQ-N-0xx` | Non-functional |
| `REQ-A-0xx` | Architecture design (Part B) |
| `REQ-C-0xx` | Cloud design (Part C) |
| `REQ-T-0xx` | Tests |
| `REQ-D-0xx` | Deliverables |

- Acceptance criteria use **EARS**: `WHEN <trigger> THE SYSTEM SHALL <response>`.
- **`[DERIVED]`** — a requirement absent from the brief that follows **necessarily** from one that is present. Always carries its rationale and its parent. Collected in [Derived requirements](#derived-requirements).
- **`[CLARIFIED #n]`** — resolution of an ambiguity found in the brief. Full list in [Clarification decisions](#appendix-clarification-decisions).
- "requests the user is permitted to see" always means as constrained by `REQ-F-008` / `REQ-F-009`.

---

## 1. Search and filtering — server side

### REQ-F-001 — Partial match on Request Number
*Source: Part A → Backend → "Request Number, partial search"*

WHEN a search request supplies a Request Number search value
THE SYSTEM SHALL return those requests the user is permitted to see whose Request Number **contains the value at any position in the string**.

**Acceptance criteria**
- The value `000123` matches `REQ-000123`, i.e. a match in the middle of the string, not only at its start. `[CLARIFIED #3]`
- WHEN the value is absent or empty THE SYSTEM SHALL not apply this filter at all.
- **Case handling is not a requirement.** THE SYSTEM SHALL NOT be required to match across differing letter case, and SHALL NOT be required to distinguish it either. The behaviour follows the data store's default collation and is recorded as an assumption in the README (`REQ-D-005`).

> **Why case-insensitivity was withdrawn** (recorded because it is a decision, not an omission): request numbers are stored in a single fixed uppercase format, so the realistic search value is the numeric portion, where case cannot arise. Guaranteeing case-insensitivity *portably* costs either a provider-specific branch (`LIKE` on SQLite, `ILIKE` on PostgreSQL, collation-dependent on SQL Server) or a normalised lowercase column carrying its own index — a real and permanent cost for a case that does not occur. The requirement is therefore stated as **unspecified** rather than as case-sensitive, so that no provider's default can violate it.

### REQ-F-002 — Filter by Status, single or multiple
*Source: Part A → Backend → "Status, single or multiple"*

WHEN a search request supplies one or more Status values
THE SYSTEM SHALL return only requests whose Status is among the supplied values.

**Acceptance criteria**
- A single value and several values are supported through the same mechanism.
- WHEN no Status is supplied THE SYSTEM SHALL return requests in every status.
- An unrecognised Status value is handled under `REQ-F-007`.

### REQ-F-003 — Filter by creation date range
*Source: Part A → Backend → "creation date range"*

WHEN a search request supplies a start date, an end date, or both
THE SYSTEM SHALL return only requests whose creation date falls inside that range.

**Acceptance criteria**
- **The upper bound covers the whole end day.** WHEN the end date is `2026-09-14` THE SYSTEM SHALL include requests created at any time on that date, including `23:59`. `[CLARIFIED #4]`
- **Range bounds are interpreted as calendar dates in UTC.** `[CLARIFIED #5]`
- Each bound is independent — start only, end only, or both.
- A start date later than the end date is handled under `REQ-F-007`.

### REQ-F-004 — Filter by request type
*Source: Part A → Backend → "request type"*

WHEN a search request supplies a request type
THE SYSTEM SHALL return only requests of that type.

WHEN no type is supplied THE SYSTEM SHALL return requests of every type.

### REQ-F-005 — Sorting
*Source: Part A → Backend → "Additionally: Sorting"*

WHEN a search request specifies a sort field and direction
THE SYSTEM SHALL return results ordered accordingly.

**Acceptance criteria**
- Both sort directions are supported.
- WHEN no sort is specified THE SYSTEM SHALL apply a **deterministic** default ordering — two identical requests return the same rows in the same order.
- The set of sortable fields is **closed and defined in advance**; a field outside it is handled under `REQ-F-007`.
- *The default ordering and the exact sortable field set are fixed in `design-feature.md`.*

### REQ-F-006 — Combining filters

WHEN a search request supplies more than one filter
THE SYSTEM SHALL return only requests satisfying **all** of them together.

WHEN no filter is supplied THE SYSTEM SHALL return all requests the user is permitted to see, subject to `REQ-N-002`.

### REQ-F-007 — Invalid input handling
*Source: Part A → Backend → "handling of invalid input"*

WHEN a search request contains an invalid value
THE SYSTEM SHALL reject the entire request with an input error carrying **field-level detail** sufficient for the client to identify what was rejected and why.

**Acceptance criteria — the policy is strict** `[CLARIFIED #6]`
THE SYSTEM SHALL **not** perform a partial search, **not** silently ignore an invalid value, and **not** coerce it to a default.

Invalid values include at least:

| Case | Example |
|---|---|
| Unrecognised enumeration value | a Status or request type that does not exist |
| Unparseable date | `createdFrom=hello` |
| Inverted range | start date later than end date |
| Sort field outside the permitted set | `sortBy=ownerName` |
| Page number below 1 | `page=0` |
| Page size non-positive or above the configured maximum | `pageSize=0`, `pageSize=99999` |

> **Why strict** (recorded because it is a decision, not a default): a value that silently falls back to a default means a client-side bug — a misspelled sort field, say — is never discovered; the user simply receives a different ordering than the one requested. Explicit rejection surfaces the bug immediately.

---

## 2. Permissions

### REQ-F-008 — Regular user
*Source: Part A → Backend → Permissions → "a regular user sees only Requests they own or are assigned to"*

WHEN the requesting user is not an Administrator
THE SYSTEM SHALL return only requests that the user **owns** **or** that are **assigned** to them.

**Acceptance criteria**
- A request satisfying neither condition appears in no result set **and is not counted** in the total result count (`REQ-N-002`).
- The constraint holds under every combination of filters, sorting and page.

### REQ-F-009 — Administrator
*Source: Part A → Backend → Permissions → "Administrator sees everything"*

WHEN the requesting user is an Administrator
THE SYSTEM SHALL return requests without any ownership or assignment restriction.

### REQ-F-010 — Server-side enforcement
*Source: Part A → Backend → Permissions → "permissions are enforced server-side"*

THE SYSTEM SHALL enforce `REQ-F-008` and `REQ-F-009` on the server only.

**Acceptance criteria**
- WHEN a client supplies any parameter intended to widen the set of requests visible to it THE SYSTEM SHALL ignore that parameter and apply the restriction in full.
- The acting user's identity is **not** taken from a search parameter under client control.
- **Decisive acceptance test:** the exact same search request, performed as a regular user and as an Administrator, returns **different result sets and different total counts**.

> **Distinction fixed during clarification:** this requirement concerns **authorization** — what a given identity may see. **Authentication** — how that identity is proven — is **out of scope** (see [Out of scope](#out-of-scope)). `[CLARIFIED #1]`

---

## 3. User interface

### REQ-F-101 — Filter form
*Source: Part A → Frontend → "filter form"*

THE SYSTEM SHALL present a form letting the user supply a value for each filter in `REQ-F-001`–`REQ-F-004`.

**Acceptance criteria**
- Multi-value Status selection is supported in the UI (`REQ-F-002`).
- The date range is enterable as a start and an end (`REQ-F-003`).
- The user can clear any filter and return to the unfiltered state.

### REQ-F-102 — Sort control
*Source: Part A → Frontend → "sorting"*

THE SYSTEM SHALL let the user choose the sort field and direction, and SHALL show the current sort state.

### REQ-F-103 — Results table
*Source: Part A → Frontend → "results table"*

THE SYSTEM SHALL present the returned requests in a table containing at least the fields that are filterable and sortable.

### REQ-F-104 — Loading indication
*Source: Part A → Frontend → "loading indication"*

WHEN a search request is in flight THE SYSTEM SHALL display a visible loading indication.

### REQ-F-105 — Error indication
*Source: Part A → Frontend → "error indication"*

WHEN a search request fails THE SYSTEM SHALL display a visible error message.
THE SYSTEM SHALL **never** present an unexplained empty screen as the result of a failure.
WHEN the failure is an input rejection (`REQ-F-007`) THE SYSTEM SHALL show the user what was rejected.

### REQ-F-106 — Empty state
*Source: Part A → Frontend → "no results"*

WHEN a search request succeeds and returns zero requests
THE SYSTEM SHALL display an explicit message stating that no results match the current filters.

**Acceptance criterion:** the three states — loading, error, and no-results — are **visually distinct** and cannot be confused with one another.

### REQ-F-107 — UI technology
*Source: Part A → Frontend → "Angular or React may be chosen"*

THE USER INTERFACE SHALL be implemented in Angular or in React. *The actual choice and its rationale belong to `design-feature.md` and the README (`REQ-D-004`).*

---

## 4. Non-functional requirements

### REQ-N-001 — Data volume
*Source: Part A → Backend → "Performance: assume millions of records"*

THE SYSTEM SHALL be designed on the assumption that the request store holds millions of rows.

**Acceptance criteria**
- The volume of data crossing from the data store into the application per search request **does not grow** with the total row count.
- No code path loads all matching requests into memory before filtering and paging have been applied.
- The permission restriction (`REQ-F-008`) is part of the query itself, not a filter applied to an already fully-materialised result.

### REQ-N-002 — Paging `[DERIVED from REQ-N-001]`

THE SYSTEM SHALL return search results in pages.

**Acceptance criteria**
- WHEN a search request specifies a page and a page size THE SYSTEM SHALL return only that page's rows.
- THE SYSTEM SHALL include, in the response, the **total number of matching requests the user is permitted to see**, so the client can present page navigation.
- WHEN page or page size are not specified THE SYSTEM SHALL apply defined default values.
- WHEN the page size exceeds the configured maximum THE SYSTEM SHALL reject under `REQ-F-007`.
- WHEN the requested page lies beyond the last page of results THE SYSTEM SHALL return an empty result set with the correct total count, **not** an error. A structurally valid page number that happens to contain no rows is an empty result, not invalid input, and is therefore outside `REQ-F-007`.
- *The default and maximum values themselves are fixed in `design-feature.md`, not here.* `[CLARIFIED #7]`

> **Derivation rationale:** paging is not mentioned in the brief. But `REQ-N-001` posits millions of rows, and an endpoint returning every matching row is not implementable under that constraint — not in memory, not in bandwidth, and not in the user interface. This is a **necessary** consequence, not a desirable addition.

### REQ-N-003 — Time handling `[DERIVED from REQ-F-003]`

THE SYSTEM SHALL define and document a single, consistent time zone for all system timestamps.

**Acceptance criteria** `[CLARIFIED #5]`
- **UTC is the source of truth** for storage and for computing filter boundaries.
- WHEN a creation timestamp is displayed to a user THE SYSTEM SHALL display it consistently, and the behaviour SHALL be documented in the README (`REQ-D-005`).

> **Derivation rationale:** `REQ-F-003` defines a date range but fixes no time zone. Without an explicit decision the same range returns different results for clients in different zones — which makes `REQ-F-003` unverifiable.

---

## 5. Architecture design — Part B

### REQ-A-001 — Microservices design
*Source: Part B → "the system is growing and moving to Microservices. Future domains: Customers, Requests, Notifications, Documents, Reporting"*

THE DELIVERABLE SHALL include an architecture design addressing all five domains, the boundaries between them, and how they communicate.

### REQ-A-002 — Reliable communication in the notification scenario
*Source: Part B → Scenario → "when a Request is created or changes Status, a Notification must be sent… the Notification system may be temporarily unavailable"*

THE DELIVERABLE SHALL explain how notification delivery is guaranteed when a request is created or changes status, **including while the Notification service is temporarily unavailable**.

**Acceptance criteria**
- The explanation covers what happens to a notification while the service is down, and what happens to it when the service returns.
- The explanation states explicitly **which guarantees are provided and which are not**.
- The explanation addresses the effect — or absence of effect — on the availability of the Requests write path itself.

---

## 6. Cloud design — Part C

### REQ-C-001 — Deployment sketch
*Source: Part C → "sketch briefly how you would deploy the system to a Cloud environment… address the main components: Compute, DB, Messaging, Monitoring, Scaling"*

THE DELIVERABLE SHALL include a deployment sketch for one cloud environment, explicitly addressing all five components: **Compute, DB, Messaging, Monitoring, Scaling**.

**Explicit scope constraint from the brief:** no actual deployment and no infrastructure code are required.

---

## 7. Tests

### REQ-T-001 — Focused test set
*Source: Part A → "Tests, optional. Tests may be added. The emphasis is on choosing meaningful test cases"*

THE DELIVERABLE SHALL include automated tests covering the meaningful boundary cases.

**Acceptance criteria**
- The permission boundary is covered in both directions — regular user (`REQ-F-008`) and Administrator (`REQ-F-009`).
- Rejection of invalid input is covered (`REQ-F-007`).
- Paging is covered, including correctness of the total count (`REQ-N-002`).
- **The emphasis is a small number of meaningful tests**, not broad low-value coverage.

> The brief marks tests as optional. **The decision to include them is taken deliberately** and recorded here rather than left implicit. `[CLARIFIED #2]`

---

## 8. Deliverables

### REQ-D-001 — Code
*Source: Submission → "Backend + Frontend code"* — THE DELIVERABLE SHALL include the source of both sides.

### REQ-D-002 — README: how to run
THE README SHALL explain how to run the backend and the frontend.

### REQ-D-003 — README: how to run tests
THE README SHALL explain how to run the tests.

### REQ-D-004 — README: technologies and rationale
THE README SHALL state which technologies were chosen and why. WHEN a technology other than the one in the supplied repository is chosen THE README SHALL justify the change.

### REQ-D-005 — README: assumptions
THE README SHALL list the assumptions made.
**Acceptance criterion:** every requirement marked `[DERIVED]` in this document appears in that list together with its rationale.

### REQ-D-006 — README: a technical decision with alternatives
THE README SHALL describe **at least one** technical decision that had real alternatives, those alternatives, and the reasoning behind the choice.

### REQ-D-007 — README: what was not completed
THE README SHALL state what was not completed and how the work would have continued.

### REQ-D-008 — AI usage: tools
THE AI-USAGE DOCUMENT SHALL state which AI tools were used.

### REQ-D-009 — AI usage: stages
THE AI-USAGE DOCUMENT SHALL state at which stages — planning, implementation, testing, architecture.

### REQ-D-010 — AI usage: changes to the AI's proposal
THE AI-USAGE DOCUMENT SHALL state what was changed relative to the proposal received, and why.

### REQ-D-011 — AI usage: rejected suggestions
THE AI-USAGE DOCUMENT SHALL include **at least one example** of a suggestion that was rejected, with an explanation.

### REQ-D-012 — AI usage: verification
THE AI-USAGE DOCUMENT SHALL explain how the result was verified to be correct.

### REQ-D-013 — Diagrams
*Source: Submission → "Architecture + Cloud diagram"*
THE DELIVERABLE SHALL include a diagram for the architecture (`REQ-A-001`) and one for the cloud deployment (`REQ-C-001`).

### REQ-D-014 — Spec and tests
*Source: Submission → "Migrations / tests / Spec, if any"*
THE DELIVERABLE SHALL include the specification and test artefacts produced.

---

## Derived requirements

All requirements not present in the brief, collected. **This section is the direct source for `REQ-D-005`.**

| Requirement | Derived from | Rationale in brief |
|---|---|---|
| `REQ-N-002` Paging | `REQ-N-001` | An unpaged endpoint is not implementable against millions of rows |
| `REQ-N-003` Time handling | `REQ-F-003` | Without a defined time zone the date range is unverifiable |

**Derivation rule applied:** *a derived requirement must be a **necessary** consequence of a stated requirement, not a **desirable** companion to one.*
Both requirements above pass this rule. **Authentication was tested against it and rejected** — authorization can be enforced against a trusted identity source without building a sign-in mechanism.

---

## Out of scope

| Topic | Reason |
|---|---|
| **Authentication** — sign-in, password handling, token issuance | The brief requires *permission enforcement* (`REQ-F-010`) and never mentions sign-in, passwords or tokens. The counter-argument — "enforcement against an unverified identity is hollow" — was weighed and explicitly rejected; it is recorded as an alternative in ADR-002 and feeds `REQ-D-006`. Note that `design-feature.md` ADR-002 does register an ASP.NET Core *authentication scheme*; that is the framework pipeline used to carry an asserted identity and produce a 401 when it is missing, not verification of a credential. `[CLARIFIED #1]` |
| Actual deployment and infrastructure code | Explicitly excluded by the brief (Part C) |
| Creating, editing or deleting requests | The brief adds **search and filtering** to an existing display capability only |
| User and customer management | Not required; owner, assignee and customer are handled as identifiers only |

---

## Appendix: clarification decisions

Eight ambiguities found in the brief and resolved **before** this specification was written.

| # | Ambiguity | Decision | Affects |
|---|---|---|---|
| 1 | Is authentication in scope? | **No** — authorization only | `REQ-F-010`, Out of scope |
| 2 | Tests marked "optional" | **Included** — a focused set | `REQ-T-001` |
| 3 | Meaning of "partial search" | **Contains, at any position. Case handling unspecified.** Prefix matching was considered and rejected: every request number shares a fixed prefix, so a prefix search would force the user to type that prefix and would drain "partial" of meaning. Case-insensitivity was considered and rejected: it cannot be guaranteed across providers without extra machinery, and the fixed uppercase format means it buys nothing | `REQ-F-001` |
| 4 | Upper bound of the date range | **Covers the whole end day** | `REQ-F-003` |
| 5 | Time zone | **UTC as the source of truth** | `REQ-F-003`, `REQ-N-003` |
| 6 | Scope of "invalid input" | **Strict policy** — explicit rejection in every case, including unknown sort field and oversized page | `REQ-F-007` |
| 7 | Is paging required? | **Yes, as a derived requirement.** Default and maximum values are fixed at the design layer | `REQ-N-002` |
| 8 | Format of the Part B and Part C deliverables | **Diagrams embedded in Markdown documents** | `REQ-D-013` |

---

## Coverage matrix

The design column is filled in as the design documents are written. **A requirement with no design section is an orphan — that is, a gap.**

| Requirement | Origin | Design section |
|---|---|---|
| `REQ-F-001` | Part A — Backend | `design-feature.md` ADR-006, §3.3, §3.4a, §4 |
| `REQ-F-002`, `REQ-F-004`, `REQ-F-006` | Part A — Backend | `design-feature.md` §3.3, §3.4a, §4 |
| `REQ-F-003` | Part A — Backend | `design-feature.md` §3.3, §3.4a, §4 |
| `REQ-F-005` | Part A — Backend | `design-feature.md` §3.3, §3.4a |
| `REQ-F-007` | Part A — Backend | `design-feature.md` ADR-003, ADR-004, §3.4, §3.4a |
| `REQ-F-008`, `REQ-F-009` | Part A — Permissions | `design-feature.md` §3.2, §3.3 |
| `REQ-F-010` | Part A — Permissions | `design-feature.md` ADR-002, §3.2, §3.4 |
| `REQ-F-101`–`REQ-F-106` | Part A — Frontend | `design-feature.md` ADR-005, §3.4a, §3.5 |
| `REQ-F-107` | Part A — Frontend | `design-feature.md` ADR-005, ADR-007 |
| `REQ-N-001` | Part A — Performance | `design-feature.md` ADR-001, §3.3 |
| `REQ-N-002` | `[DERIVED]` | `design-feature.md` ADR-003, §3.3, §3.4a, §3.5 |
| `REQ-N-003` | `[DERIVED]` | `design-feature.md` §3.3, §3.4a, §4 |
| `REQ-T-001` | Part A — Tests | `design-feature.md` §3.6 |
| `REQ-D-002` | Submission | `design-feature.md` ADR-007, §5 step 8 |
| `REQ-D-003`–`REQ-D-012` | Submission | `design-feature.md` §5 step 8 |
| `REQ-A-001`, `REQ-A-002` | Part B | *pending — `design-architecture-cloud.md`* |
| `REQ-C-001` | Part C | *pending — `design-architecture-cloud.md`* |
| `REQ-D-001`, `REQ-D-013`, `REQ-D-014` | Submission | *`REQ-D-001` on completion of §5; `REQ-D-013` pending Part B/C; `REQ-D-014` = this directory* |
