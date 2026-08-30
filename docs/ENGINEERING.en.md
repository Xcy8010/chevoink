# Chevoink Engineering Documentation

> This document consolidates the system architecture, key technical decisions, testing & CI, deployment strategy, performance data, security posture & risk trade-offs, technical debt and evolution plans.
> All content is grounded in the current repository code and the real planning documents under `plan/`, and is updated continuously as the project evolves.
> `plan/00`–`plan/20` are true planning snapshots of landed phases; `plan/21` is the active 2.0 implementation plan. For the mapping between historical file paths and the current implementation, see [Section 9](#9-plan-document-index).
>
> Last updated: 2026-08-26
>
> Language: English | [简体中文](./ENGINEERING.md)

## Table of Contents

1. [System Architecture](#1-system-architecture)
2. [Key Technical Decisions](#2-key-technical-decisions)
3. [Testing & CI Report](#3-testing--ci-report)
4. [Deployment Strategy](#4-deployment-strategy)
5. [Performance Data](#5-performance-data)
6. [Security Posture & Risk Trade-offs](#6-security-posture--risk-trade-offs)
7. [Technical Debt](#7-technical-debt)
8. [Evolution Plan](#8-evolution-plan)
9. [plan/ Document Index](#9-plan-document-index)
10. [Recommendation System Rollout Record](#10-recommendation-system-rollout-record)

---

## 1. System Architecture

### 1.1 Overall Architecture Diagram

```
┌────────────────────────── Clients ─────────────────────────┐
│  Web (React SPA)              Android APP (Capacitor shell) │
│  src/features/*:              loads the remote site +       │
│  home/discover/reader/        in-app update banner;         │
│  studio/community/messages/   APK distributed via GitHub    │
│  profile/search/admin         Releases & /download/         │
└───────────────┬──────────────────────────────────────────────┘
                │ HTTPS (nginx 443 ssl http2)
┌───────────────▼──────────────────────────────────────────────┐
│  nginx (TLS termination · security headers · gzip · statics) │
│  Config: deploy/nginx.chevoink.conf                          │
└───────┬──────────────────────────────┬───────────────────────┘
        │ static dist/                 │ /api reverse proxy
┌───────▼───────┐          ┌───────────▼────────────────────────┐
│  Vite build   │          │  Express 4 (PM2: chevoink-api)     │
│  artifacts,   │          │  api/routes/*: 13 route modules    │
│  code-split   │          │  auth/novels/comments/posts/topics/│
│  by route     │          │  conversations/users/home/search/  │
└───────────────┘          │  meta/ai/agent/admin               │
                           ├──────────────────────────────────────┤
                           │  api/lib/                            │
                           │  ├── data/      data access layer   │
                           │  ├── agent/     writing Agent engine│
                           │  │   loop kernel + run-service +    │
                           │  │   32 tools + permission guards + │
                           │  │   knowledge sets                 │
                           │  └── auth-session / rate-limit /    │
                           │      audit                          │
                           └───────────────┬─────────────────────┘
                                           │ Prisma 6
                           ┌───────────────▼─────────────────────┐
                           │ PostgreSQL 16 (29 tables ·          │
                           │ 26 migrations)                      │
                           └─────────────────────────────────────┘
```

### 1.2 Frontend Structure (src/)

| Directory | Responsibility |
| --- | --- |
| `src/app` | App shell & routing |
| `src/features/reader` | Bookstore shelf, immersive reader, TTS narration |
| `src/features/studio` | Studio: chapter editor, AI cover, Agent panel (`agent/` subdomain: agentStore + SSE event stream + components) |
| `src/features/community` / `messages` | Community posts & topics, direct messages & online presence |
| `src/features/discover` / `home` / `search` / `novel-detail` / `profile` | Discovery feed, detail pages, personal center |
| `src/features/admin` | Admin console (data dashboard, user/novel/content governance) |

Frontend and backend share type contracts through `shared/contracts/`, including the Agent SSE protocol and the frozen Agent 2.0 `TaskSpec`, `ChangeSet`, `Volume`, and `MemoryEvidence` contracts, so interface mismatches are caught at compile time.

### 1.3 Backend Structure (api/)

- **Route layer** `api/routes/`: 13 route modules; all inputs are validated via `parseBody` + zod schemas; unified `{ success, data }` / `{ code, message }` response structures.
- **Data layer** `api/lib/data/`: Prisma access wrappers with data-layer fallback validation (e.g. privacy-level enum fallback).
- **Agent engine** `api/lib/agent/` (corresponds to `plan/10`, `plan/13`):
  - `loop.ts` execution kernel (executeAgentRun) + `active-runs.ts` run registry;
  - `run-service.ts` run lifecycle & session CRUD, `session-messages.ts` messages/rollback, `plan-artifacts.ts` plan artifacts;
  - `tools/`: 32 registered tools (list in [1.5](#15-agent-tool-inventory-32-tools)), split by dependency into eleven files: chapter/novel/write/read/cover/search/platform/interact/todo/attachment/export; `governance.ts` freezes risk classifications and postconditions for every tool;
  - `permissions.ts` permission guards & budgets (per run: ask_user 3 / web search 5 / web deep-read 8 / platform search 5 / platform deep-read 8);
  - `knowledge/` + `skills/`: writing knowledge and operational knowledge sets (corresponds to the `plan/14` hallucination-governance plan).

### 1.4 Agent SSE Event Protocol (shared/contracts/agent-events.ts)

During a run, frontend and backend communicate through a one-way SSE event stream; **live and replay share the same source**: every event is persisted to the `AgentRunEvent` table with a `seq`; reconnects resume via `Last-Event-ID`, and a page refresh replays the full history. Events share a common header `{ seq, runId, ts }` and come in 13 body types:

| Event | Semantics |
| --- | --- |
| `run.started` | Run started (Agent summary, execution mode, task title) |
| `message.start` | Assistant message started |
| `text.delta` / `reasoning.delta` | Streaming deltas for body / reasoning |
| `tool.call` | Tool call started (with `autoApproved` flag) |
| `tool.delta` | Streaming progress of tool arguments (e.g. chapter text produced word by word) |
| `tool.result` | Tool call result (success summary / display payload / duration) |
| `permission.ask` / `permission.resolved` | Approval request & result ("always allow" forbidden for high-risk ops, with expiry) |
| `step.finish` | One turn finished (turn number + token usage) |
| `run.paused` | Paused (user stop / approval timeout) |
| `run.finished` | Finished (succeeded/failed/cancelled + total usage + artifact list + output summary) |
| `error` | Recoverable error |

The frontend message-part model `AgentMessagePart` (text / reasoning / tool-call / attachment) is built from the events above; write-operation tools additionally carry rollback snapshots (persisted server-side only, stripped before the message-list API returns), powering "one-click rollback inside the conversation".

### 1.5 Agent Tool Inventory (32 tools)

| Group | Tools | Notes |
| --- | --- | --- |
| Read (5) | novelGetContext · chapterRead · chapterListSummaries · memorySearch · planRead | Novel context, chapter content, cross-session memory, plan artifacts |
| Research (2) | webSearch · webRead | Multi-tier fallback search with Bocha as the primary engine; web deep-read with SSRF protection |
| Platform reference (2) | platformNovelSearch · platformNovelRead | Locates published platform works and the author's own unpublished works by title/tag/genre keywords; reads synopsis/categories/chapter text with a visibility hard gate at the DB where layer; similar-work detection via feature-term search + synopsis comparison, falling back to web search when the platform yields nothing |
| Attachments (2) | viewImage · readFile | GLM-4.1V vision side-channel; pdf/docx/txt/md reading |
| Export (1) | novelExport | One-click zip export of the novel (plans/catalog/chapters/work info & publishing advice); read-only, skips approval; supports chapter subsets and four-scope trimming; artifacts stored in an in-memory store (TTL 15 min) for the frontend download card |
| Chapter write (5) | chapterCreate · chapterWrite · chapterAppend · chapterEditRange · chapterRename | Atomic revision conflict detection + 409 semantics + rollback snapshots |
| Novel management (2) | novelRename · novelUpdateMeta | Title & metadata updates |
| Plan artifacts (3) | planSave · planRename · planDelete | Save/rename/delete outline plans |
| Cover (3) | coverPromptSet · coverGenerate · coverApply | Prompt, generation, apply & persist |
| High-risk (3) | novelPublish · novelArchive · novelDelete | Publish/take-down/delete, strictest permission level |
| Memory & interaction (3) | memorySave · todoWrite · askUser | Cross-session preference memory, self-driven todos, ask the user (budget 3 per run) |
| Wrap-up (1) | planExit | Exit plan-editing mode |

The tool registry has a single exit at `api/lib/agent/tools/registry.ts`; name/description/parameter schemas are verbatim-stable (the schema is the model-visible contract; changing it equals changing behavior).

### 1.5.1 Work Skills and shared installation

- **Cross-device entry points**: the Work inspector, collapsed Work rail, IDE navigation, and mobile “More” all use the same work-skills panel. The Studio skeleton reserves the Skills position so navigation does not jump after load.
- **Creation path**: an author can press “New” in the panel or explicitly ask in chat, “create a … skill for me.” The Agent saves only reusable long-term preferences through `skill_create_draft` as a private, disabled draft; one positive and one negative deterministic test run after creation or editing, and `skill_publish` always requires explicit confirmation in the current turn.
- **Installation path**: the Agent can inspect pending account-bound shared invitations with `skill_shared_invites`, then install a specifically named invitation into the current work through `skill_install_shared`. Since installation changes future automatic routing, it is always confirmed per operation.
- **Third-party boundary**: the Agent never auto-imports arbitrary GitHub or external source. UI import requires an allow-listed licence, attribution, and an immutable `owner/repo@commit` source, followed by static audit, positive/negative tests, and the publication gate.
- **Runtime**: the server deterministically routes enabled skills from task phase, intent, and positive/negative triggers; the model does not rescan the catalogue every turn. Tool history uses single-layer disclosure rows; active tools show only a thin progress line, a text sheen, and a rotating status mark instead of a full-card flash.

### 1.6 Data Model Overview (prisma/schema.prisma)

29 tables, organized by domain:

- **Accounts**: User, SmsVerificationCode, AdminAuditLog
- **Writing & reading**: Novel, Chapter, CoverAsset, ReadingProgress, NovelRead, ParagraphUnderline, NovelFavorite
- **Recommendation**: RecommendationEvent
- **Community interaction**: Post, Topic, PostTopic, PostLike, PostBookmark, Comment, CommentLike, UserFollow
- **Direct messages**: Conversation, ConversationMember, Message
- **Agent**: AgentSession, AgentRun, AgentMessage, AgentRunEvent, AgentArtifact, ProjectMemoryEntry, AiUsageLog

---

## 2. Key Technical Decisions

| Decision | Conclusion | Rationale |
| --- | --- | --- |
| Frontend-backend type contracts | Single source in `shared/contracts/`, compiled by both sides | Eliminates interface field drift; Agent SSE event structures are defined here (`plan/09`) |
| Input validation | zod schemas + unified `parseBody` parsing across the board; admin login keeps a manual three-mode branch | The manual branch is a state-machine validation; schema-izing it would duplicate branches and could change error ordering — risk outweighs benefit |
| Session scheme | HttpOnly Cookie as primary channel + Bearer fallback channel | Survives Android shell process kills (`plan/04` three-device adaptation) |
| Auth degradation | On DB failure, prefer reusing historical session state ≤10 minutes old (stale fallback); only degrade-open beyond the window | Availability-first is the established design baseline; full fail-closed would take down site-wide login state on DB jitter |
| Agent execution mode | Autonomous execution with maximum permissions by default (`AGENT_AUTO_APPROVE=true`) | Product decision: zero-interruption writing flow (README selling point); `false` switches back to the approval flow in one flip, see [Section 6](#6-security-posture--risk-trade-offs) |
| Agent engine | Unified loop scheduling kernel + tool registry + event stream | High-fidelity replication of opencode (`plan/11`); the frontend only consumes the standard event stream |
| Chapter concurrency | `Chapter.revision` + `expectedRevision` optimistic locking; Agent writes use atomic version-guarded updateMany | Prevents silent overwrites across Web, legacy APP, and Agent writes; the legacy no-field path remains compatible but still advances the version |
| Event stream architecture | All SSE events persisted with seq; live and replay share one source; Last-Event-ID resume | No message loss on disconnect/refresh; history replay and live share one code path, eliminating dual-implementation drift |
| API response shape | `{ success, data }` on success, `{ code, message }` on failure, always JSON | Single error-handling path on the frontend; validation copy is verbatim-anchored in integration tests (p0/p1/p2-validation) |
| Hallucination governance | Knowledge sets (worldbuilding/character cards) + Skill injection + web-research budgets | `plan/14`: read the facts before writing; budgets prevent runaway |
| Web search | Multi-tier fallback strategy with Bocha as the primary engine | Automatic switch on single-engine failure keeps the research chain available |
| Image understanding | Zhipu GLM-4.1V vision side-channel + in-process concurrency semaphore (default 4) | Free tier allows 5 concurrent; keep 1 in reserve (`api/config/env.ts`) |
| Large-file governance | Module-level splits move only stateless/pure logic; full tsc is the authoritative verification | Completed in this sprint: run-service 1447→1043 lines, write-tools 826→285, loop 903→837, AgentPanel 1096→1020 |
| Frontend component split discipline | Never split untested component bodies; only extract module-level pure declarations | Any JSX slicing without coverage is a regression risk; extracted pure functions get guardrail unit tests |
| One-click export | Server-side dependency-free ZIP writer (store, no compression) + shared Fanqie vocabulary contract | Avoids adding jszip (artifacts are mostly plain text; store mode suffices); the vocabulary lives in `shared/contracts/fanqie-tags.ts` shared by both sides; AI publishing-advice output is clamped to the official vocabulary (no invented tags); AI unavailability degrades to fallback copy without blocking the export |

---

## 3. Testing & CI Report

### 3.1 Test Matrix (Vitest + Supertest)

| Category | File | Cases | Coverage highlights |
| --- | --- | --- | --- |
| Unit | studio-lib | 24 | Studio form/review pure logic |
| Unit | auth-session | 14 | Session state cache, ban eviction, three-state stale fallback, cache capacity cap |
| Unit | schemas | 9 | zod schema positive/negative cases |
| Unit | panel-helpers | 7 | Pure declarations extracted from AgentPanel (stage copy verbatim-anchored) |
| Unit | phone / password | 6 / 6 | Phone number & password rules |
| Unit | active-runs | 5 | Agent run registry (register/count/stop) |
| Unit | parse-body | 5 | Request body parsing & 400/401 boundaries |
| Unit | agent2-contracts / agent-baseline | 5 / 2 | TaskSpec/ChangeSet/Volume/MemoryEvidence contracts and revision baseline isolation |
| Unit | agent-tool-governance / agent-eval-metrics | 3 / 2 | Governance coverage for all 32 tools and stable eval aggregation |
| Integration | p0/p1/p2-validation | 27 / 21 / 15 | Three generations of validation copy verbatim comparison (DB group) + 401 precedence (no-DB group) |
| Integration | app-smoke | 5 | Health check & basic route smoke |
| Integration | agent2-revision | 3 | Concurrent update conflict, stale delete blocking, and legacy-client compatibility (DB required) |

- Latest full run: **17 test files: 16 passed / 1 skipped; 105 tests passed / 55 skipped** (DB groups auto-skip via `describe.skipIf(!dbAvailable)` when PostgreSQL is absent locally; CI with a postgres:16 service container runs them all).
- vitest uses the forks pool: in-process caches (ban/token-version/rate-limit Maps) do not cross-contaminate, and the global PrismaClient singleton does not reuse connections across files.

### 3.2 CI Pipeline (.github/workflows/ci.yml)

Triggered on push to main / PRs; a single job runs five gates serially (20-minute timeout):

```
postgres:16 service container → npm ci → prisma generate → migrate deploy (test DB chevoink_test)
→ npm run check (type check) → npm run lint → vitest run --coverage → npm run build
→ npm audit --omit=dev --audit-level=high
```

- Coverage only produces reports; no threshold gate yet (pending a real baseline anchor, see technical debt).
- The last four sprint commit batches (e5cae31 / 83a9bba / 598d575 / aff96dc) all concluded **success** in CI.

### 3.3 Local Quadruple Gate (per-batch discipline)

`npx tsc --noEmit` → `npm test` → `npm run build` → `npm run lint`. Current lint state: 0 errors, 1 pre-existing warning (StudioWorkspace react-hooks/exhaustive-deps, listed as debt).

---

## 4. Deployment Strategy

### 4.1 One-click deploy: `npm run deploy:prod` (scripts/deploy-production.ps1)

```
Local gates: tsc type check → vitest tests → npm audit (fail on high+) → vite build
Pack tar with whitelist (excluding node_modules/dist/.git) → SSH readiness probe (8 retries)
scp upload (fallback to sftp on failure, 3 retries each) → remote extract to /opt/chevoink/app/current
→ run deploy/deploy-production.sh (npm ci --omit=dev, prisma migrate deploy,
   server-side build, nginx config validation) → PM2 reload chevoink-api
→ health check http://127.0.0.1:3001/api/health (10 retries)
→ public site HEAD check → "Deployment finished successfully"
```

- PM2 config: `ecosystem.config.cjs`; remote script: `deploy/deploy-production.sh`.
- Database migrations go through `prisma migrate deploy` (26 migrations currently; the new local migration will be applied by the deployment script at release time).
- Release tags & APK: `scripts/push-to-github.ps1 -Tag vX.XX -ReleaseAsset <apk path>`.

### 4.2 Production Topology

| Item | Current state |
| --- | --- |
| Domain | https://chevoink.chevolink.com |
| Reverse proxy | nginx 1.24 (443 ssl http2, Let's Encrypt certificate) |
| App process | PM2 fork-mode single instance chevoink-api (listens on 3001, accepts only nginx-proxied traffic) |
| Database | PostgreSQL 16 (chevoink_prod) |
| Android | Capacitor shell loading the remote site, in-app update check on launch |

> Known ops item: the deploy script overwriting the server nginx config can wipe the certbot SSL section and break HTTPS; any nginx config change must keep the certificate section in sync (lesson from a historical incident).

### 4.3 Environment Variable System (.env.example)

All configuration is injected via `.env`, grouped by domain (the template is the authoritative list):

| Domain | Variables | Notes |
| --- | --- | --- |
| App | `APP_NAME` / `APP_ENV` / `APP_PORT` / `APP_WEB_URL` / `APP_SERVER_URL` | Service identity & cross-origin base URLs |
| Database & session | `DATABASE_URL` / `AUTH_SESSION_SECRET` / `AUTH_COOKIE_DOMAIN` / `AUTH_COOKIE_SECURE` | Prisma connection string & Cookie session signing |
| SMS | `SMS_TENCENT_*` + code policy (length 6 / TTL 300s / cooldown 60s / hourly cap 5) | Tencent Cloud SMS login codes |
| Text generation | `AI_TEXT_BASE_URL` / `AI_TEXT_API_KEY` / `AI_TEXT_MODEL` / `AI_TEXT_MAX_OUTPUT_TOKENS` | DeepSeek; per-turn output cap defaults to 8192 to avoid long-chapter truncation |
| Agent | `AI_AGENT_MODEL` / `AGENT_MAX_TURNS` (default 100) / `AGENT_RUN_TOKEN_BUDGET` (default 2M) / `AGENT_AUTO_APPROVE` | Turn & token budgets combined with context slimming to avoid context explosion |
| Image generation | `AI_IMAGE_BASE_URL` / `AI_IMAGE_API_KEY` / `AI_IMAGE_MODEL` | OpenAI-compatible cover generation |
| Vision | `AI_VISION_*` (timeout 60s / concurrency 4) | GLM-4.1V side-channel; when unconfigured, tools backfill observations without blocking the run |
| Narration | `TTS_PROVIDER` (edge / disabled) / `TTS_DEFAULT_VOICE` / cache cap 2 GB | Edge TTS, keyless |
| Web search | `WEB_SEARCH_PROVIDER` (auto = Bocha → Sogou → Bing fallback) / `WEB_READER_FALLBACK` (off/jina/firecrawl) | Readability as the deep-read mainline + hosted Reader fallback |

---

## 5. Performance Data

### 5.1 Production Build Sizes (measured 2026-08-16, vite build)

| Artifact | Raw | gzip |
| --- | --- | --- |
| Entry `index.js` | 271.2 kB | 75.2 kB |
| Studio `StudioPage.js` (route-split) | 261.3 kB | 64.7 kB |
| `react-vendor.js` | 173.8 kB | 57.5 kB |
| Reader `ReaderPage.js` | 110.6 kB | 32.0 kB |
| Community `CommunityPage.js` | 20.3 kB | 6.7 kB |
| Main stylesheet `index.css` | 91.5 kB | 16.3 kB |

64 artifacts in total, 1998 modules, lazily split by route; build time ~6–7 seconds.

### 5.2 Transfer & Loading Optimizations

- nginx http2 multiplexing + gzip level 6 (text/css, js, json, svg, ≥1 KB);
- Content-hashed static asset filenames (`Cache-Control` long-term caching), `index.html` no-cache for second-level releases;
- Site-wide loading performance and Agent-runtime jank fixes are in `plan/20` (adjacent-chapter paged prefetch, offline reading-progress cache, etc. already landed).

### 5.3 Test Execution Performance

The full set of 17 test files finishes in roughly 6–9 seconds (local forks pool); CI closes the loop within ~20 minutes including dependency installation and build.

---

## 6. Security Posture & Risk Trade-offs

### 6.1 Implemented Security Controls

| Layer | Control |
| --- | --- |
| Transport | HTTPS enforced (HSTS max-age=31536000); `X-Content-Type-Options: nosniff`; `X-Frame-Options: DENY`; full CSP Report-Only policy in place (`deploy/nginx.chevoink.conf`) |
| Session | HttpOnly Cookie + signed sessions; ban and tokenVersion revocation compared in real time (60s cache + DB-failure stale fallback ≤10 minutes); proactive eviction of the ban cache |
| Auth boundary | All write endpoints return 401 before 400 (reject unauthenticated first, leaking no validation details); unified zod validation copy |
| Rate limiting | SMS code IP dual window (hourly/daily); admin login IP+account dual-key failure lockout; TTS synthesis 20/min per IP; rate-limit Maps cleared past the cap to prevent unbounded growth |
| Secrets | All injected via `.env` (template `.env.example`); `.env`, certificates and keystores excluded by `.gitignore` (`plan/08`) |
| Agent | Tiered tool permissions (read/write/dangerous); per-run budget caps (ask_user 3, web search 5, web deep-read 8, platform search 5, platform deep-read 8); AiUsageLog records all token consumption; AdminAuditLog records high-risk console operations |
| Dependencies | Dual gates in CI and deployment `npm audit --omit=dev --audit-level=high`; currently **0 vulnerabilities** |

### 6.2 Explicit Risk Trade-offs (written record)

1. **AGENT_AUTO_APPROVE defaults to true** (`api/config/env.ts`)
   - Trade-off: zero-interruption autonomous writing is the product's core selling point (a user-confirmed product decision); defaulting to false would violate the feature baseline.
   - Mitigation: write/dangerous tools have tiered permissions and a J-phase high-risk tool audit; `AGENT_AUTO_APPROVE=false` restores the full approval flow in one flip; all Agent operations leave traces (AgentRunEvent + AiUsageLog).
2. **Auth degradation opens rather than fail-closed**
   - Trade-off: rejecting all sessions on DB failure would take down site-wide login state; the availability loss outweighs the revocation-window risk.
   - Mitigation: stale fallback only reuses historical success states within a ≤10-minute window, with ban/tokenVersion still compared as usual; beyond the window it opens with a `warnAuthDegrade` log.
3. **CSP stays Report-Only**
   - Trade-off: many third-party image/media direct links; enforce mode could break content display.
   - Mitigation: Report-Only keeps collecting violation reports; promotion to enforce is tracked in the debt list.
4. **Admin login keeps the manual three-mode branch validation**
   - Trade-off: username/phone/email three-mode is a state-machine validation; zod-izing it would require superRefine to duplicate branches and could change error ordering — risk outweighs benefit.

---

## 7. Technical Debt

| Debt | Current state | Direction |
| --- | --- | --- |
| Missing coverage gate | CI only produces coverage reports; repo-wide baseline is low (tests concentrated on api validation/session/Agent core and frontend pure functions) | Anchor core modules first (api/lib, shared/contracts) with per-module thresholds, then tighten gradually |
| CSP not enforced | Running Report-Only | Switch to enforce after cleaning violation sources |
| Pre-existing lint warning | 1 in StudioWorkspace.tsx react-hooks/exhaustive-deps | Involves component-body changes; handle after frontend test coverage is in place |
| Frontend components without test coverage | Large components (StudioWorkspace 4215 lines, AgentPanel 1020 lines) not split | Keep the "module-level pure declarations only" discipline; add key interaction tests before discussing component splits |
| Prisma config migration | `package.json#prisma` deprecated (removed in Prisma 7) | Upgrade to `prisma.config.ts` |
| Manual deploy-pack whitelist | tar whitelist once referenced a deleted file and broke packaging (historical incident) | When adding top-level directories, cross-check the `deploy-production.ps1` whitelist |

---

## 8. Evolution Plan

Completed 1.0 plans: three-device adaptation & phased launch (04), writing Agent & high-fidelity opencode replication (10/11), studio deep refactor (13), hallucination governance & knowledge-set Skills (14), release pipeline & site-wide loading optimization (15), mobile studio (16), TTS narration (17), admin console & community recommendation algorithm upgrade (18), Android APK packaging (19), immersive reader & safe-area refactor (20). `plan/21` is the active Agent/Studio 2.0 plan.

Agent 2.0 P0 engineering foundations landed on 2026-08-25: frozen runtime contracts; chapter revision migration and optimistic locking; version-guarded Agent chapter writes; revision propagation across publishing, insertion, deletion compaction, and rollback; test-enforced governance for 32 tools; and seven core eval scenarios with stable success/token/P95-latency/rollback aggregation. The formal P0 gate still requires at least five real-model runs per scenario against an available test database; P1 must not start before those measurements exist.

The 2026-08-30 Studio iteration streams final answers and long document-tool arguments over SSE, locks the target chapter/plan while the Agent writes, and lets tool activity navigate to that target. The former memory tab is now a whole-novel relationship graph: low-reasoning AI runs only when chapters exist and the graph is empty, while manual rebuilds have a ten-minute cooldown. The admin console treats `AiUsageLog` as the canonical model-token meter and exposes user ranking, novel/session/run drill-down, plus web-search and image-generation invocation counts.

Studio / Agent 2.0 desktop and memory UX landed on 2026-08-26: the Work/IDE command bar now keeps only novel selection while chapter hierarchy lives in the editor header; the editor uses a flat edge-to-edge surface; Studio has a scoped neutral light/dark palette; side panels have no fixed maximum width and snap closed below their collapse thresholds; Work renders the memory graph directly in the inspector and mobile includes a dedicated memory view. Existing prose is projected into the graph through idempotent local rules, while every completed Agent turn performs threshold-based context compaction and revision-aware memory refresh without an additional model call. The in-process projection-version cache is capped at 500 novels.

New accumulations from this engineering sprint (2026-08, 85→90 points):

- zod validation canonicalized to cover all write endpoints (copy verbatim-anchored in `tests/integration/p2-validation.test.ts`);
- Auth degradation hardening (stale fallback + cache capacity cap 5000);
- Module-level splits of the three largest backend files (run-service / loop / write-tools) with guardrail unit tests;
- Frontend AgentPanel module-level extraction (panel-helpers + ProcessingHint into separate files);
- Studio one-click zip export (four content scopes checkable, per-chapter selection, AI-generated publishing advice against the Fanqie Novel official vocabulary) and the Agent `novel_export` tool (chapter subsets & exclusion rules supported).

Candidate directions going forward (ordered by payoff):

1. Land coverage gates for core modules (CI thresholding);
2. Promote CSP to enforce and clean violation sources;
3. After key frontend interaction tests are in place, evaluate component-level splits of StudioWorkspace / AgentPanel;
4. Prisma config file migration;
5. Horizontal-scaling playbook from single PM2 → multi-instance/containerized (current single instance carries the load well; not urgent).

---

## 9. plan/ Document Index

The `plan/` directory holds true landed-phase snapshots and active implementation plans; numbering equals project initiation order. **Multiple documents under the same number = independent workstreams advanced in parallel within one phase**, not version overrides. `plan/00`–`plan/20` have landed; `plan/21` is progressing through P0–P7 gates.

### 9.1 Document List

| Document | Topic | Status |
| --- | --- | --- |
| `plan/00` | Reference products & market research | Initiation basis |
| `plan/01` | Product proposal & PRD | Landed |
| `plan/02` | Technical architecture (architecture design, tech stack, routing, API, data model, three-device strategy) | Landed (details per this document) |
| `plan/03` · `plan/05` | Brand & interface spec · UI/UX design spec | Landed |
| `plan/04` | Three-device adaptation & phased launch | Landed |
| `plan/06` | Local testing & parallel collaboration norms | Execution norm |
| `plan/07` · `plan/08` | AI configuration security & long-context proposal · env variable design & secret custody spec | Landed (env list in [4.3](#43-environment-variable-system-envexample)) |
| `plan/09` | Data model & interface contract draft | Landed (evolved to 29 tables, see [1.6](#16-data-model-overview-prismaschemaprisma)) |
| `plan/10` · `plan/11` | Writing Agent design · high-fidelity opencode Agent replication | Landed (implementation evolved, see 9.2) |
| `plan/12` · `plan/16` | Frontend UI/UX product-grade optimization · mobile studio deep optimization | Landed (layout approach evolved, see 9.2) |
| `plan/13` | Studio Agent deep refactor & frontend product-grade optimization | Landed (including later P3/P4 module-level splits) |
| `plan/14` | Agent hallucination governance & knowledge-set/Skill deep optimization | Landed |
| `plan/15` | Release pipeline & Agent experience fixes + site-wide loading optimization | Landed |
| `plan/17` | Reader TTS narration | Landed |
| `plan/18` (two docs) | Admin console · community recommendation algorithm & topic system upgrade | Landed |
| `plan/19` | Android APK client packaging (Capacitor shell project) | Landed |
| `plan/20` (three docs) | Site-wide loading performance & Agent-runtime jank fixes · mobile immersive reader refactor · reader fullscreen immersion (Android shell safe-area system refactor) | Landed |
| `plan/21` | Studio and Agent 2.0 enterprise iteration plan | In progress (P0 engineering foundation complete; live baseline pending) |
| `plan/list/` | Multi-window parallel execution norms & master review checklist | Execution norm |

### 9.2 Historical Path Mapping (proposal reference → current implementation)

16 file paths referenced when the proposals were written have since been migrated/merged in later refactors; the mapping is below (2026-08-16 automated verification result; the remaining 156 path references all match the current repository):

| Historical path in proposals | Current implementation |
| --- | --- |
| `api/lib/agent-service.ts` | `api/lib/agent/loop.ts` (execution kernel) + `run-service.ts` (run lifecycle), split in the plan/13 refactor |
| `api/lib/agent-workspace-tools.ts` | `api/lib/agent/tools/` nine-group files (chapter/novel/write/read/cover/search/interact/todo/attachment) |
| `api/index.ts` | `api/server.ts` (startup) + `api/app.ts` (Express assembly) |
| `src/features/studio/components/WritingAgentPanel.tsx` | `src/features/studio/agent/components/AgentPanel.tsx` |
| `src/features/studio/store/agentStore.ts` | `src/features/studio/agent/agentStore.ts` |
| `src/features/studio/layouts/StudioMobile/Tablet/Desktop.tsx` | Three-file layout approach not adopted; final state is a single responsive `StudioWorkspace.tsx` (mobile adapts via BottomSheet/drawers) |
| `src/features/reader/components/ReaderSettingsSheet.tsx` | `reader/components/ReaderSettingsContent.tsx` + `ReaderSettingsPopover.tsx` + `reader-settings.ts` |
| `src/features/reader/components/ParagraphComment.tsx` | Paragraph interaction evolved into the underline system: `useParagraphUnderlines.ts` + `ParagraphActionBar.tsx` |
| `src/features/reader/underlines.ts` | `src/features/reader/useParagraphUnderlines.ts` |
| `src/features/reader/tts/splitTtsBatches.ts` | Batching logic merged into `reader/tts/useTtsPlayer.ts` + `tts-api.ts` |
| `src/features/community/PostComposer.tsx` | `src/features/community/components/PostComposer.tsx` |
| `src/components/layout/MobileTabBar.tsx` | Bottom navigation merged into `components/layout/AppShell.tsx` + `device-context.ts` |
| `src/components/ui/UnderlineTabs.tsx` | `src/components/ui/SegmentedTabs.tsx` |
| `prisma/migrations/2026xxxx_admin_console/` | `prisma/migrations/20260812190000_admin_console/` (placeholder timestamp landed as the actual value) |

> Note: the reader's three-device layouts (`reader/layouts/ReaderMobile/Tablet/Desktop.tsx`) keep the three-way split, unlike the studio's choice — reader interactions differ greatly while the studio needs panel coordination; this is a deliberate architectural difference.

---

## 10. Recommendation System Rollout Record

Corresponds to the external proposal `docs/RECOMMENDATION-ALGORITHM.md`. Feasibility conclusion: **Phase 0 (score unification & versioning) and Phase 1 (behavior event collection + profiling + for-you personalization) can land directly on the current stack and are implemented; Phase 2 (LightGBM ranking/vector recall) and Phase 3 (two-tower/data warehouse) depend on data scale and offline infrastructure, deferred per the proposal's own rhythm**.

### 10.1 Phase 0: Score Unification & Versioning

- Single source of scoring pure functions `shared/recommend/scoring.ts` (hotScore/totalScore/weekly/daily charts/update freshness/length score, etc.), referenced uniformly by both sides (client `src/features/discover/ranking.ts`, `weekly-picks.ts`, `daily-picks.ts` and server `api/lib/data/home.ts`, `api/lib/data/novel.ts`), eliminating weight drift;
- Algorithm version constants `RECOMMEND_ALGORITHM_VERSIONS` (home `novel-home-v2` / related `related-v2` / forYou `for-you-v1` / weeklyPicks / dailyPicks), delivered with responses (`HomePagePayload.algorithmVersion`, `NovelDetailPayload.relatedAlgorithmVersion`) for attribution;
- Home candidate pool fix: `recently-updated 200 ∪ historically-hot 200` dual-channel union with dedup, replacing single-sort truncation.

### 10.2 Phase 1: Event Collection → Profiling → for-you Personalization

- **Event table**: `recommendation_events` (migration `20260817120000_recommendation_events`), `eventId` unique & idempotent, `userId` nullable, stores only behavior metadata (surface/eventType/dwellMs/progressPercent/sessionId/algorithmVersion), indexed on `(userId, createdAt)` and `(novelId, eventType)`;
- **Event reporting**: `POST /api/recommendations/events` batched ≤50, idempotent insert via `api/lib/recommendation/events.ts`; write failures degrade silently returning `accepted: 0`, never blocking the reading main flow; client is fire-and-forget (keepalive + swallowed catch), dwellMs capped at 30 minutes;
- **User profile**: `api/lib/recommendation/profile.ts`, interest = Σ weight × exp(-ageDays/30), signal weights — full read +6 / progress ≥80% +4 / bookmark +5 / follow author +4 / start reading +1 / click +0.3 / dismiss·abandon -5 (suppression); 90-day lookback window;
- **for-you chain**: `api/lib/recommendation/for-you.ts` recall → ranking (0.45 interest + 0.15 author + 0.20 quality + 0.10 fresh + 0.10 explore, components normalized by candidate-set maxima) → rerank (same author ≤2, same primary tag consecutive ≤2, relaxed to fill when insufficient) → recommendation reasons (must come from real features); cold start (no signals) degrades to 0.8 quality + 0.2 fresh with `personalized: false`;
- **Attribution**: every for-you response returns `sessionId` (randomUUID) and `algorithmVersion`; exposure/click/negative-feedback events carry the same session key;
- **Client integration**: `src/features/discover/useForYouRecommendations.ts` — the server is the sole ranking source, falling back to local `buildRecommendedNovels` on failure to guarantee availability; exposures are batch-reported deduped by `sessionId + novel set`; `DiscoverPage` cards show the recommendation reason, and "not interested" removes locally immediately and reports dismiss.

### 10.3 Read-count / Reader-count Calibration (viewCount UV-ization)

The external "readers" metric switched from raw PV (+1 per chapter open) to UV (one user per novel counts once), aligning with the mainstream calibration of WeRead/Wattpad:

- Dedup table `novel_reads` (migration `20260817140000_novel_reads_uv`), `@@unique([userId, novelId])`; when a logged-in user first loads a published chapter, `createMany skipDuplicates` inside a transaction, +1 on first time only;
- Anonymous reads do not count toward reader count (logged-in calibration; shelf/progress naturally drive login conversion); draft chapters excluded;
- Historical data backfill: `reading_progress` rows with non-empty `chapter_id` (actually opened a chapter, excluding shelf-only adds) deduped by user×novel and backfilled; `view_count` recalibrated against the `novel_reads` count;
- Heat/ranking signals keep reusing `viewCount` (UV is naturally fraud-resistant, weights unchanged);

### 10.4 Acceptance Self-check (against proposal §13)

| Acceptance item | Status |
| --- | --- |
| Both sides score consistently (single source + version constants) | ✅ |
| Events idempotent, failures never block the main flow | ✅ |
| Cold-start degradation & personalized flag | ✅ |
| Recommendation reasons from real features, no fabrication | ✅ |
| Exposure/click/negative-feedback reporting closed loop | ✅ |
| Offline/online evaluation metrics (CTR/diversity, etc.) | Pending Phase 2 data accumulation |
