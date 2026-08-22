# Chevoink Development Standards

> **Positioning**: These standards are distilled from the full practice of this project (including the 85→90 engineering & security sprint). They are **mandatory constraints**, not suggestions.
> They must be followed when developing new features for the current project or launching new products; they complement [ENGINEERING.md](./ENGINEERING.md) (the description of the current engineering state) — this document answers "how things must be done", while ENGINEERING answers "what things are now".
> Each rule is anchored to real files and numbers in the repository as much as possible; when rules conflict, the iron rules in Chapter 1 take the highest priority.
>
> Version: v1.0 (2026-08-16) · Maintenance: after each engineering sprint, write back newly distilled practices and keep in sync with the code
>
> Language: English | [简体中文](./DEVELOPMENT-STANDARDS.md)

## Table of Contents

1. [Charter: Ten Iron Rules](#1-charter-ten-iron-rules)
2. [Workflow Standards](#2-workflow-standards)
3. [Architecture Standards](#3-architecture-standards)
4. [Backend API Standards](#4-backend-api-standards)
5. [Frontend Standards](#5-frontend-standards)
6. [Agent / AI Engineering Standards](#6-agent--ai-engineering-standards)
7. [Database Standards](#7-database-standards)
8. [Testing Standards](#8-testing-standards)
9. [CI/CD & Deployment Standards](#9-cicd--deployment-standards)
10. [Security Standards](#10-security-standards)
11. [Performance Standards (Budget System)](#11-performance-standards-budget-system)
12. [Documentation Standards](#12-documentation-standards)
13. [Pitfall List (Distilled from Real Incidents)](#13-pitfall-list-distilled-from-real-incidents)
14. [Checklists (Directly Executable)](#14-checklists-directly-executable)

---

## 1. Charter: Ten Iron Rules

Scope: all code changes, no exceptions.

| # | Iron Rule | Key Point |
| --- | --- | --- |
| 1 | **Zero change to functionality and UI is the highest constraint of refactoring** | The 400 copy must be verbatim-identical, status-code order unchanged (401 before 400), UI untouched; any "while-we're-at-it optimization" must be batched separately |
| 2 | **Full tsc is the authoritative verification** | `npx tsc --noEmit` with 0 errors counts as passing; IDE/LSP incremental hints misreport in the intermediate state of refactoring ("module has no exported member", etc.) and are reference-only |
| 3 | **Every batch passes the quadruple gate** | `tsc --noEmit` → `npm test` → `npm run build` → `npm run lint`, all green before commit |
| 4 | **One commit per batch, individually revertible** | One concise line (`type: subject`); push triggers CI, batches are mutually independent, a failed batch is `git revert`-ed alone |
| 5 | **Production deployment goes through one path only** | `npm run deploy:prod`; the script output `Deployment finished successfully` is the criterion, any mid-way error means failure |
| 6 | **Secrets never enter the repository** | `.env` / `cert/` / `*.pem` / `*.keystore` / `*.apk` are excluded by `.gitignore`; scan for secrets before committing new directories (see [10.3](#10-security-standards)) |
| 7 | **The test-database guard cannot be bypassed** | The `DATABASE_URL` database name must contain `test` (`tests/setup.ts` validates at startup and throws to refuse execution on violation) |
| 8 | **Splitting moves only stateless / pure logic** | Component bodies are never split before test coverage exists; movable module-level declarations must be accompanied by guardrail unit tests in the same batch after moving |
| 9 | **Historical documents are not retroactively modified** | `plan/` and other planning snapshots preserve their original form; implementation evolution is navigated via mapping tables (see ENGINEERING.md §9.2) |
| 10 | **Post-deployment acceptance belongs to the user** | The assistant does not fetch/browse live pages to verify content on its own; it only guarantees all-green gates and successful script exit, and reports truthfully |

---

## 2. Workflow Standards

Scope: the organization of the whole process from project initiation to launch.

### 2.1 Plan Before Code

- Medium-to-large changes must first produce a planning document before any work, distilled into `plan/`: number = initiation order, **multiple documents with the same number = parallel workflows in the same phase** (not version overrides).
- A plan must contain: hard-constraint list, batch division, dependencies, **an explicit "not-doing list"**, risks and countermeasures, Rejected Alternatives.
- The "not-doing list" requires written rationale. Example: admin `/auth/login` is not zod-ized — the three-mode mutually exclusive branches are state-machine validation; schema-izing would require superRefine to duplicate branches and could change error ordering, so the risk outweighs the benefit.

### 2.2 Batch Discipline

| Rule | Requirement |
| --- | --- |
| Granularity | Each batch is independently revertible; batches are mutually independent and can run out of order |
| Gate | Every batch passes the quadruple gate all-green (Iron Rule 3) |
| Commit | One commit per batch, one concise line: `feat: wrap up zod adoption for remaining write endpoints`, `refactor: module-level split of the three backend files with guardrail unit tests` |
| Verification | After push, check the GitHub Actions runs status; proceed to the next batch only when all green |
| Deployment | Multiple zero-behavior-change batches are **merged into the final batch for unified deployment** to reduce production disturbance |

### 2.3 Reconnaissance Before Changes

- Before starting, read the **existing branches and copy** of the target endpoint/component; rewriting from memory is forbidden; copy is duplicated verbatim.
- For large files, enumerate top-level declarations first, then decide what to move (script enumeration beats the naked eye).
- Full inventory of consumers: before changing an exported structure, grep all importers to avoid runtime broken links.

---

## 3. Architecture Standards

Scope: placement and module-boundary decisions for all new code.

### 3.1 Layering and Directory Responsibilities

| Layer | Directory | Responsibility Boundary |
| --- | --- | --- |
| Route layer | `api/routes/*.ts` | Thin routes: session check → parameter validation → call data/business layer → assemble response; direct complex SQL logic is forbidden |
| Data layer | `api/lib/data/*.ts` | Prisma access wrappers + data-layer fallback validation |
| Business domain | `api/lib/agent/` etc. | Stateful engines aggregated into directories by domain (loop kernel / tools / permissions / knowledge sets) |
| Contract layer | `shared/contracts/` | **Single source** of types shared by frontend and backend; SSE events and request/response structures are all defined here |
| Frontend shell | `src/app` | Routing and app shell |
| Frontend domain | `src/features/<domain>/` | Closed-loop business domain: components / lib (pure logic) / api / store |
| Shared pieces | `src/components/` | Cross-domain reusable UI (ui/ primitives, layout/) |

### 3.2 File-Size Red Line and Splitting Discipline

| Rule | Value / Practice |
| --- | --- |
| Red line | A single file over 800 lines triggers split evaluation |
| Move only | Module-level stateless declarations / pure functions; behavioral equivalence preserved verbatim (including comments and copy) |
| Reconciliation | After splitting, grep the whole repository to confirm old imports are zeroed |
| Verification | Full tsc is authoritative (Iron Rule 2); consumers compiling through is the exit verification |
| Guardrail | Split-out pure logic gets unit tests in the same batch (Iron Rule 8) |
| Track record | run-service 1447→1043, loop 903→837, write-tools 826→285, AgentPanel 1096→1020 |

### 3.3 Module Exit Standards

- Tool/plugin-style collections use a **registry unified exit** (template: `api/lib/agent/tools/registry.ts`); consumers depend only on the registry, not on concrete implementation files.
- Type declarations and implementations go in separate files (contracts in `shared/contracts`, tool types in `tools/types.ts`).
- Frontend components and utility functions go in separate files: mixing triggers react-refresh warnings and breaks hot reload (example: `panel-helpers.tsx` pure functions separated from the `ProcessingHint.tsx` component).

### 3.4 New-Feature Placement Decision Tree

```
New requirement arrives
├─ Involves frontend-backend data exchange? → Add types in shared/contracts first (contract-first)
├─ Pure backend capability? → Add endpoint in api/routes + implementation in api/lib(/data)
├─ Pure frontend capability? → Belongs to src/features/<domain>/; only cross-domain goes to src/components
├─ New Agent tool? → Implement in api/lib/agent/tools/<group>.ts + register in registry (see Chapter 6)
└─ New config item? → Add parsing in api/config/env.ts + add template and comment in .env.example
```

---

## 4. Backend API Standards

Scope: all new endpoints in `api/routes/*` and `api/lib/*`.

### 4.1 Response Structure (Mandatory)

| Scenario | Structure | Basis |
| --- | --- | --- |
| Success | `{ success: true, data: {...} }` | `api/app.ts` `/api/health` template |
| Failure | `{ success: false, error: { code, message } }`, must return JSON | `api/app.ts` 500/404 fallback |
| Uncaught exception | 500 + `INTERNAL_SERVER_ERROR` + fixed copy 「服务暂时不可用，请稍后重试。」(The service is temporarily unavailable. Please try again later.); internal details only go to `console.error('[unhandled]', ...)` logs and are **never returned to the client** | `api/app.ts` error middleware |

### 4.2 Parameter Validation (Mandatory)

- Always go through `parseBody(schema, body, fallbackMessage)` (`api/lib/parse-body.ts`): on failure throws `DataAccessError(400, 'VALIDATION_ERROR', copy)`.
- **Position rule**: parseBody must be placed inside the try, **after** session checks like `requireSessionUserId` — ensuring 401 takes priority over 400 and validation details are not leaked when not logged in.
- Non-empty strings uniformly use the `nonEmptyText` pattern: `z.string().refine(v => v.trim().length > 0)`, semantically aligned with the original manual `.trim()` check.
- Optional fields use `.optional()` for loose matching; empty-body scenarios pass through per current semantics (example: privacy empty body returns the current value).

### 4.3 Copy and Status Codes

| Rule | Requirement |
| --- | --- |
| 400 copy | Verbatim-stable; additions/modifications must be synchronously anchored to integration tests (the it.each verbatim-comparison pattern in `tests/integration/p*-validation.test.ts`) |
| Status-code order | Not-logged-in 401 → no-permission 403 → validation 400 → resource-missing 404, preconditions reported first |
| Merged multi-validation | Originally merged checks (e.g. `!content?.trim() || !type`) still share one copy after adoption, not split |

### 4.4 Rate Limiting and In-Process Maps

All in-process Maps (rate limiting, caches, registries) **must**:

1. Bucket by real dimensions: after `trust proxy 1`, take `req.ip` (nginx single-hop reverse proxy, first value of X-Forwarded-For);
2. Set capacity caps to prevent unbounded growth (evict the oldest on overflow or reset the whole table; example: rate-limit Map clears beyond 2000 keys, session-state cache caps at 5000 entries evicting the oldest `checkedAt`);
3. Dual-window strategy for code-issuing endpoints (hourly + daily; example: code-issuing rate limit in `api/routes/auth.ts`).

### 4.5 Middleware Order (api/app.ts baseline)

cors (origin whitelist + credentials) → trust proxy → body parsing (limit 40mb, measured need for 9-image base64 posts) → uploads static (30d immutable) → unified session gate (fail-open on anomaly: the gate's own failure must not take down the whole site) → business routes → health → 500/404 fallback. New middleware must not break the semantics of this order.

---

## 5. Frontend Standards

Scope: all changes in `src/**`.

### 5.1 Type Baseline (Non-Regressable)

`tsconfig.json` is fully enabled: `strict` + `noUnusedLocals` + `noUnusedParameters` + `noFallthroughCasesInSwitch`. Loosening the configuration to bypass errors is forbidden; unused variables use the `_` prefix (eslint `no-unused-vars` at error level, `^_` exempted).

### 5.2 Component Discipline

| Rule | Description |
| --- | --- |
| Component bodies are not split | Large components without test coverage (StudioWorkspace at 4167 lines, etc.) stay whole; any JSX cutting is a regression gamble |
| Module-level extraction | Extract only top-level pure functions / constants / independent small components, preserved verbatim; importers change their imports, diff comparable line by line |
| Extraction requires tests | Extracted pure functions get guardrail unit tests in the same batch (template: `tests/unit/panel-helpers.test.ts`, copy mappings anchored verbatim with toEqual) |
| Single file responsibility | A component file exports only components; utility functions go in separate files (react-refresh/only-export-components) |

### 5.3 State and Data

- **zustand** stores runtime / interaction state (e.g. runId/phase/messages in `agentStore`); **React Query** stores server state (queryKey reuses shared caches; example: `['community','me']` shared in three places).
- Alias consistency: tsconfig `paths` and `resolve.alias` in `vitest.config.ts` must synchronously maintain `@/*` (otherwise unit-test resolution breaks).

### 5.4 Reuse Existing Assets (Check Before Building)

| Need | Existing Asset |
| --- | --- |
| Class-name merging | `cn` (`src/lib/utils`) |
| Mobile overlays | `BottomSheet`; confirmation `ConfirmDialog`; skeleton `Skeleton` |
| Soft-keyboard avoidance | Three-signal architecture + 700ms no-signal fallback (estimated at 55% of screen height); do not listen to resize yourself |
| Clipboard | `copyToClipboard` (navigator.clipboard primary path + execCommand fallback) |
| Device adaptation | `device-context` / DeviceProvider; reader three-device layouts in `reader/layouts/` |

---

## 6. Agent / AI Engineering Standards

Scope: `api/lib/agent/**` and all LLM / toolchain changes.

### 6.1 Tool Contract Stability (Highest Priority)

A tool's `name` / `description` / parameter schema is a **model-visible contract**: verbatim changes equal behavior changes; they must go through batches and copy anchoring as functional changes, and must not be modified in passing during refactoring.

### 6.2 Permissions and Budgets

| Item | Current Value | Basis |
| --- | --- | --- |
| Permission tiers | Three tiers: read / write / dangerous (`WRITE_PERMISSION` / `DANGEROUS_PERMISSION`) | `api/lib/agent/permissions.ts`, chapter-tools/novel-tools |
| High-risk operations | Publish/delete/take-down: `allowAlways: false` in permission.ask, "always allow" forbidden | `shared/contracts/agent-events.ts` |
| ask_user budget | 3 per run | permissions.ts `ASK_USER_BUDGET_PER_RUN` |
| Web search budget | 5 per run | `WEB_SEARCH_BUDGET_PER_RUN` |
| Web deep-read budget | 8 per run | `WEB_READ_BUDGET_PER_RUN` |
| Turns / tokens | `AGENT_MAX_TURNS` default 100; `AGENT_RUN_TOKEN_BUDGET` default 2 million, combined with context slimming to prevent window explosion | `api/config/env.ts` |
| Auto-approval | `AGENT_AUTO_APPROVE` default true (product decision); `false` one-click fallback to the approval flow — changing the default is a functional change and requires project initiation | `api/config/env.ts` |

### 6.3 Event-Stream Architecture (Immutable Contract)

- All SSE events are persisted to `AgentRunEvent` by `seq`; live and replay share the same source; reconnects resume via `Last-Event-ID`.
- New event types must go through an additive union (old messages / old clients skip safely) and synchronously update `shared/contracts/agent-events.ts`.
- Rollback snapshots of write operations are persisted server-side only and stripped before the message-list API returns; they must not be sent to the frontend.

### 6.4 External-Dependency Degradation Templates

| Scenario | Standard Practice | Example |
| --- | --- | --- |
| AI service unconfigured / failed | The tool backfills a "service not configured" observation result and **does not block the run** | view_image vision side-channel |
| Search engine failure | Multi-tier degradation chain (Bocha → Sogou → Bing), individually disableable | `WEB_SEARCH_PROVIDER=auto` |
| DB failure | stale fallback: reuse historical success state ≤10 minutes old (ban and tokenVersion comparisons as usual); degrade-open only beyond the window; fail-closed is forbidden | `api/lib/auth-session.ts` |
| Gate's own anomaly | Fail-open + downstream falls back to local signature verification; admin-function failures must not take down the whole site | `api/app.ts` session gate |

---

## 7. Database Standards

Scope: `prisma/schema.prisma`, migrations, and data-access code.

| Rule | Requirement | Basis |
| --- | --- | --- |
| Migration discipline | Always `prisma migrate deploy` (idempotent); confirm `No pending migrations` before launch; hand-editing published migrations is forbidden | Remote step of the deployment script |
| Migration naming | `YYYYMMDDHHMMSS_subject` (lowercase underscore), e.g. `20260812190000_admin_console` | `prisma/migrations/` |
| Index awareness | Build composite indexes on where + orderBy fields of list/sort queries; large tables first | `20260815120000_add_list_indexes` |
| Double-insurance validation | Enum-like fields: route zod validation + data-layer fallback (prevents bypassing routes via direct calls) | privacy fallback in `api/lib/data/user.ts` |
| Revocation mechanism | Session-like data requiring immediate invalidation uses a version field (`tokenVersion`); caches compare version numbers | `20260815130000_add_user_token_version` |
| Test database | Database name contains `test` (Iron Rule 7); migrations and integration tests share the same test database | `tests/setup.ts` |

---

## 8. Testing Standards

Scope: `tests/**`; the verification obligation for all new logic.

### 8.1 Organization and Naming

| Directory | Responsibility | Current Baseline |
| --- | --- | --- |
| `tests/unit/*.test.ts` | Pure-logic unit tests (prisma mockable) | 8 files, 76 cases (studio-lib 24 / auth-session 14 / schemas 9 / panel-helpers 7 / phone 6 / password 6 / active-runs 5 / parse-body 5) |
| `tests/integration/*.test.ts` | supertest against the real Express app; DB group runs on the test database | 4 files, 68 cases (p0 27 / p1 21 / p2 15 / app-smoke 5) |

### 8.2 Mandatory Patterns

| Pattern | Practice |
| --- | --- |
| Out-of-the-box | Without a DB environment, pure unit tests are all green; the DB group auto-degrades via `describe.skipIf(!dbAvailable)`; when `tests/.env.test` is missing, a minimal environment is injected in place |
| Copy anchoring | Validation endpoints must have verbatim copy-comparison tests: `it.each` cases array + assertions `status 400 + code VALIDATION_ERROR + message verbatim`, plus "no-false-rejection" cases (legal requests 200/404) |
| 401 ordering | Not-logged-in cases form an independent group (no DB needed), asserting 401 before any validation |
| mock prisma | `vi.mock('../../api/lib/prisma.js', ...)` returns a stub object; time-sensitive tests use `vi.useFakeTimers()` + `vi.setSystemTime()`, with `vi.useRealTimers()` in afterEach |
| Process isolation | vitest `pool: 'forks'`: in-process caches do not cross-contaminate; reverting to threads is forbidden |
| Guardrail obligation | Any module-level split/extraction must add guardrail unit tests **in the same batch** (Iron Rule 8); copy mappings anchored in full with `toEqual` |
| Test data | Registration cases use reproducible pseudo-randomness (e.g. `+861398${Date.now().toString().slice(-7)}`), not depending on existing data |

---

## 9. CI/CD and Deployment Standards

Scope: `.github/workflows/ci.yml`, `scripts/deploy-production.ps1`, `deploy/*`.

### 9.1 CI Five Gates (Order Must Not Be Shuffled)

```
postgres:16 service container (chevoink_test) → npm ci → prisma generate → migrate deploy
→ npm run check → npm run lint → vitest run --coverage → npm run build
→ npm audit --omit=dev --audit-level=high
```

- Coverage produces reports only, with no threshold set (pending baseline anchoring); `concurrency` cancels old runs to prevent pile-up.
- Triggers: push to main / PR; any red gate blocks merging.

### 9.2 Deployment Pipeline (deploy:prod)

Local gates (check → test → audit → build) → tar whitelist packaging (excluding node_modules/dist/.git) → SSH readiness probe with 8 retries → scp upload falling back to sftp on failure (3 retries each) → remote extraction to `/opt/chevoink/app/current` → `deploy/deploy-production.sh` (npm ci --omit=dev, migrate deploy, server-side build, nginx config validation) → PM2 reload → health check `/api/health` with 10 retries → public-network HEAD check → `Deployment finished successfully`.

### 9.3 Operations Red Lines

| Red Line | Consequence and Avoidance |
| --- | --- |
| nginx config changes must preserve the certbot SSL block | The deployment script once overwrote the config and wiped the certificate, interrupting HTTPS; back up and diff the original file before changes |
| tar whitelist is manually maintained | New top-level directories must be synchronized into the `deploy-production.ps1` whitelist; referencing deleted files fails packaging |
| Deployment verdict rests on script exit | Occasional failures of individual curls at the end of the script are a known phenomenon; `Deployment finished successfully` is the sole success marker |
| Zero-behavior-change batches merged for deployment | Reduces production disturbance; functional-change deployments are done and accepted separately |

---

## 10. Security Standards

Scope: all code involving authentication, secrets, and external input.

### 10.1 Sessions and Authentication

- HttpOnly Cookie primary channel + Bearer fallback (survives Android shell process kills); Cookie parameters are environmentalized via `AUTH_COOKIE_*`.
- Three-tier session-state guarantee: 60s TTL cache → DB real-time query → DB-failure stale fallback (≤10 minutes, ban and tokenVersion comparisons as usual); degrade-open beyond the window with a `warnAuthDegrade` log.
- Ban immediacy: ban cache is actively evicted (`evictUserBanCache`); waiting for TTL natural expiry is not allowed.
- Endpoint precondition order: 401 → 403 → 400 → 404 (see 4.3).

### 10.2 Response-Header Baseline (deploy/nginx.chevoink.conf)

HSTS `max-age=31536000` · `X-Content-Type-Options: nosniff` · `X-Frame-Options: DENY` · full CSP Report-Only policy. Note that nginx `add_header` does not inherit across levels: any location with add_header must repeat the whole header set.

### 10.3 Secret Management

- `.env.example` is the authoritative configuration list; real secrets live only in the local `.env` and on the server, never entering the repository.
- Run a secret scan before committing directories/documents; regex baseline: `sk-[A-Za-z0-9]{16,}` / `AKID[A-Za-z0-9]{10,}` / `-----BEGIN` / `(password|secret|token)\s*[:=]\s*…` / `postgresql://user:pass@`.
- Local development defaults (e.g. `postgres:postgres@localhost`) are public defaults and may enter the repository; real production strings may not.

### 10.4 Dependencies and External Input

| Item | Rule |
| --- | --- |
| Dependency audit | `npm audit --omit=dev --audit-level=high` with 0 high-severity; dual gates in CI and deployment |
| SSRF | Server-side fetching tools (web_read) must carry target-address protection and budget caps |
| Uploads | File names contain random IDs, content is immutable; static serving `immutable` + 30d |
| Body size | `express.json({ limit: '40mb' })` is the upper baseline (measured for 9-image base64); new scenarios exceeding it require project initiation |
| Admin console | Login failures are locked and rate-limited by IP+account dual keys; high-risk operations write to `AdminAuditLog` |

---

## 11. Performance Standards (Budget System)

Scope: changes affecting load size, request paths, and memory growth.

### 11.1 Build-Size Budget (2026-08-16 baseline, gzip)

| Artifact | Current | Budget Cap |
| --- | --- | --- |
| Entry index | 75.2 kB | ≤ 80 kB |
| StudioPage (route-split) | 64.7 kB | ≤ 70 kB |
| react-vendor | 57.5 kB | ≤ 60 kB |
| ReaderPage | 32.0 kB | ≤ 40 kB |
| Main styles | 16.3 kB | ≤ 20 kB |

New dependencies must state their size impact in the batch description; over-budget items require justification or splitting / lazy loading.

### 11.2 Transfer and Caching

- Route-level lazy-loaded splitting; artifact content-hash file names + long caching; `index.html` no-cache guarantees second-level releases.
- nginx http2 + gzip level 6 (css/js/json/svg, compressed from ≥1 kB).
- Images go through the WebP migration and compression pipeline (the `scripts/migrate-images-webp.mjs` pattern).

### 11.3 Server-Side Resource Discipline

| Scenario | Standard | Example |
| --- | --- | --- |
| TTL Map caches | Must set capacity caps + eviction strategy | Session-state cache 5000 entries evicting the oldest |
| High-frequency DB writes | In-memory throttled merged writes | lastActiveAt 60s throttle, async persistence not blocking requests |
| External concurrency | In-process semaphore caps | Vision service concurrency 4 (free tier 5, leaving 1 buffer) |
| Site-wide unified metrics | Heat/sorting formulas maintained in one place: `(views×1 + likes×3 + comments×4 + favorites×5 + content scale) / (days+2)^1.4` | Shared by related recommendations and rankings |

---

## 12. Documentation Standards

Scope: all documents in the repository.

| Document | Audience | Responsibility | Maintenance Rule |
| --- | --- | --- | --- |
| `README.md` | Users / triers | Product introduction, quick start, download & install | Updated synchronously with functional changes |
| `docs/ENGINEERING.md` | Engineers | **Authoritative current state** of architecture/decisions/tests/deployment/performance/security/debt | After each sprint, update the "Last updated" line and corresponding sections |
| `docs/DEVELOPMENT-STANDARDS.md` (this document) | Developers | Mandatory standards and checklists | Write back new distillations, keep in sync with the code |
| `plan/*.md` | Historical archives | Planning snapshots per phase, **not retroactively modified** | Evolution navigated via mapping tables (ENGINEERING §9.2) |
| `plan/README.md` | Archive navigation | Numbering semantics, reading order, mapping-table pointers | Updated when the archive structure changes |

Commit messages, tags, and Release notes are uniformly one-line concise (Iron Rule 4), with no multi-paragraph long bodies.

---

## 13. Pitfall List (Distilled from Real Incidents)

Scope: everyone; when encountering suspected tool/environment issues, check this table first.

| # | Symptom | Root Cause | Avoidance Action |
| --- | --- | --- | --- |
| 1 | LSP reports "module has no exported member" / "import conflicts with local declaration" | IDE incremental analysis lags behind the intermediate state of multi-file refactoring | Trust the full `npx tsc --noEmit` result; ignore intermediate-state misreports |
| 2 | Prisma type errors (select field does not exist, etc.) | Prisma generated types lag | If the same code passed tsc before the change, judge it a misreport; run full tsc to confirm |
| 3 | Inline `node -e` in PowerShell with quotes/Chinese throws ParserError | PowerShell 5.1 quote-escaping and encoding limits | Write the script into a .cjs temp file then `node xxx.cjs` (.dbg/ is gitignored) |
| 4 | Grep results incomplete | A single call returns at most 15 matches | For large-file structure enumeration, use a node script to traverse line by line |
| 5 | Wrong indentation appears after SearchReplace (e.g. 4 spaces mixed into 2-space code) | Editing tool occasionally misaligns indentation | Review the diff after every edit; patch misalignments immediately |
| 6 | Deployment packaging failure | tar whitelist references deleted files | After deleting files/directories, reconcile the deploy-production.ps1 whitelist |
| 7 | HTTPS interruption after deployment | The deployment script overwrote the server nginx config and wiped the certbot SSL block | nginx config changes must synchronously maintain the certificate block |
| 8 | Unbounded memory growth in rate-limit / cache | In-process Map without eviction | Every in-process Map must set a capacity cap (4.4) |
| 9 | Tests misread dev/prod config | dotenv override overwrites injection | tests/setup.ts triple gate: DOTENV_PATH points to .env.test + database-name test guard + forks isolation |
| 10 | Local integration tests all red | No local PostgreSQL | Expected behavior: the DB group auto-skips via skipIf; CI runs in full with the service container |

---

## 14. Checklists (Directly Executable)

### A. New Feature Development (12 items)

- [ ] 1. Requirement written into plan/ (or batch description), including the "not-doing list"
- [ ] 2. Contract-first: define request/response/event types in `shared/contracts`
- [ ] 3. Route endpoint: session check → parseBody zod validation (401 first)
- [ ] 4. Response structure `{success,data}` / `{success:false,error:{code,message}}`
- [ ] 5. Data-layer encapsulation + enum fallback; index evaluation
- [ ] 6. Frontend placement in features/<domain>/, reusing existing assets (5.4)
- [ ] 7. In-process Maps set capacity caps; rate-limit bucketing dimensions correct
- [ ] 8. Integration tests: verbatim copy comparison + no-false-rejection cases + 401 ordering group
- [ ] 9. Quadruple gate all green (tsc → test → build → lint)
- [ ] 10. One-line commit + push, CI all green
- [ ] 11. Relevant ENGINEERING.md sections synchronized (architecture/decisions/env vars)
- [ ] 12. If deployment is involved, follow the Chapter 9 pipeline; user acceptance

### B. Refactoring / Splitting (8 items)

- [ ] 1. Zero-functional-change declaration: copy verbatim, status-code order, UI untouched
- [ ] 2. Enumerate top-level declarations of target files, determine the move list (move only stateless / pure logic)
- [ ] 3. Verbatim move (including comments and copy), new-file export reconciliation
- [ ] 4. Original file deletes moved declarations + imports changed; grep confirms old imports zeroed
- [ ] 5. All consumers compile through (registry unified exit preferred)
- [ ] 6. Split-out pure logic gets guardrail unit tests in the same batch
- [ ] 7. Full tsc with 0 errors is authoritative (ignore LSP intermediate-state misreports)
- [ ] 8. Quadruple gate + independent commit, individually revertible

### C. Launch (9 items)

- [ ] 1. All batches quadruple-gate green and pushed
- [ ] 2. CI runs all success
- [ ] 3. `npm audit --omit=dev --audit-level=high` with 0 high-severity
- [ ] 4. No pending migrations (prisma migrate deploy pre-check)
- [ ] 5. Run `npm run deploy:prod` (built-in local gates)
- [ ] 6. Confirm output `Deployment finished successfully`
- [ ] 7. Health check and public-network HEAD both 200 (included in the script)
- [ ] 8. Hand over to user acceptance (do not check live content yourself)
- [ ] 9. Write back ENGINEERING.md "Last updated" and relevant data

### D. New Product Initiation (Reusing This Repository's Skeleton)

- [ ] 1. Engineering baseline: tsconfig strict fully enabled + eslint (unused-vars error, react-refresh) + `@/` alias (synchronized between tsconfig and vitest)
- [ ] 2. Contract layer: `shared/contracts` directory first, single type source for frontend and backend
- [ ] 3. Testing baseline: vitest forks pool + setup.ts test-database triple guard + skipIf out-of-the-box
- [ ] 4. CI: check → lint → test(coverage) → build → audit five gates + postgres service container
- [ ] 5. Deployment script: local gates + whitelist packaging + upload fallback + health check + explicit success marker
- [ ] 6. Security baseline: .gitignore secret list, nginx security-header template, response structure and 500 fallback
- [ ] 7. Documentation trio: README (users) / ENGINEERING (current state) / DEVELOPMENT-STANDARDS (standards)
- [ ] 8. Carry over the pitfall list (Chapter 13) as a whole to avoid repeating past mistakes
