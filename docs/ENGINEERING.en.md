# Chevoink Engineering Documentation

> This document consolidates the system architecture, key technical decisions, testing & CI, deployment strategy, performance data, security posture & risk trade-offs, technical debt and evolution plans.
> All content is grounded in the current repository code and the real planning documents under `plan/`, and is updated continuously as the project evolves.
> `plan/00`–`plan/22` are true planning snapshots of landed phases; `plan/23` defines the Agent 3.0 product and evaluation baseline. For the mapping between historical file paths and the current implementation, see [Section 9](#9-plan-document-index).
>
> Last updated: 2026-09-02. Agent 3.0 is in public beta with nearly 200 participants. Engineering scope is frozen; real blind-review, retention, and commercialization metrics remain gated by Section 11.
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
11. [Agent 3.0 General-Availability Gates](#11-agent-30-general-availability-gates)

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
│  artifacts,   │          │  api/routes/*: 16 route modules    │
│  code-split   │          │  auth/novels/comments/posts/topics/│
│  by route     │          │  conversations/users/home/search/  │
└───────────────┘          │  meta/ai/agent/admin               │
                           ├──────────────────────────────────────┤
                           │  api/lib/                            │
                           │  ├── data/      data access layer   │
                           │  ├── agent/     writing Agent engine│
                           │  │   loop kernel + run-service +    │
                           │  │   98 tools + permission guards + │
                           │  │   Skill OS                       │
                           │  └── auth-session / rate-limit /    │
                           │      audit                          │
                           └───────────────┬─────────────────────┘
                                           │ Prisma 6
                           ┌───────────────▼─────────────────────┐
                           │ PostgreSQL 16 (85 tables ·          │
                           │ 48 migrations)                      │
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

Frontend and backend share type contracts through `shared/contracts/`, including Agent SSE, `TaskSpec` / `ChangeSet`, Story Compiler, Skill, quality, and Agent 3.0 evaluation contracts, so interface mismatches are caught at compile time.

### 1.3 Backend Structure (api/)

- **Route layer** `api/routes/`: 16 route modules; all inputs are validated via `parseBody` + zod schemas; unified `{ success, data }` / `{ code, message }` response structures.
- **Data layer** `api/lib/data/`: Prisma access wrappers with data-layer fallback validation (e.g. privacy-level enum fallback).
- **Agent engine** `api/lib/agent/` (corresponds to `plan/10`, `plan/13`):
  - `loop.ts` execution kernel (executeAgentRun) + `active-runs.ts` run registry;
  - `run-service.ts` run lifecycle & session CRUD, `session-messages.ts` messages/rollback, `plan-artifacts.ts` plan artifacts;
  - `tools/`: 98 registered tools (see [1.5](#15-agent-30-tools-and-runtime-pipeline-98-tools)) spanning read/write, research, Skills, Story Compiler, quality governance, subagents, branches, and schedules; `governance.ts` freezes risk classifications and postconditions for every tool;
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

### 1.5 Agent 3.0 Tools and Runtime Pipeline (98 tools)

The single registry entry point is `api/lib/agent/tools/registry.ts`. The 98 tools are grouped by capability instead of exposing an unbounded “universal write” primitive to the model:

- **Work read/write and versions**: novels, chapters, plans, range edits, exports, branches, rollback, and revision-conflict protection;
- **Research and attachments**: platform search, web search/deep-read, image understanding, document reading, and Research Dossiers;
- **Story Compiler**: Story Charter, Reader Promise, Scene Tasks, Chapter Bridges, characters, and relationship memory;
- **Skill OS and prose governance**: private/shared Skill drafts, positive/negative tests, publishing, installation, deterministic retrieval, Style DNA, and the rights-cleared prose library;
- **Quality and evaluation**: quality reports/findings, feedback, first-three-chapter prototypes, frozen scenarios, and blind-review candidates;
- **Autonomous collaboration**: todos, user questions, subagents, schedules, permission sandboxing, and budgets.

Tool `name`, `description`, and parameter schemas are model-visible contracts. Any change is treated as a behavioral change, and governance-completeness tests require a risk class and postcondition for every registered tool.

Every Agent 3.0 run follows a fixed pipeline: task specification → permission/budget filtering → work context and deterministic Skill retrieval → research/planning/writing tools → revision and rollback protection → quality gate → persisted SSE and Credits accounting. The model cannot bypass the server-side allowlist to edit prose directly.

### 1.5.1 Work Skills and shared installation

- **Cross-device entry points**: the Work inspector, collapsed Work rail, IDE navigation, and mobile “More” all use the same work-skills panel. The Studio skeleton reserves the Skills position so navigation does not jump after load.
- **Creation path**: an author can press “New” in the panel or explicitly ask in chat, “create a … skill for me.” The Agent saves only reusable long-term preferences through `skill_create_draft` as a private, disabled draft; one positive and one negative deterministic test run after creation or editing, and `skill_publish` always requires explicit confirmation in the current turn.
- **Installation path**: the Agent can inspect pending account-bound shared invitations with `skill_shared_invites`, then install a specifically named invitation into the current work through `skill_install_shared`. Since installation changes future automatic routing, it is always confirmed per operation.
- **Third-party boundary**: the Agent never auto-imports arbitrary GitHub or external source. UI import requires an allow-listed licence, attribution, and an immutable `owner/repo@commit` source, followed by static audit, positive/negative tests, and the publication gate.
- **Runtime**: the server deterministically routes enabled skills from task phase, intent, and positive/negative triggers; the model does not rescan the catalogue every turn. Tool history uses single-layer disclosure rows; active tools show only a thin progress line, a text sheen, and a rotating status mark instead of a full-card flash.

### 1.6 Data Model Overview (prisma/schema.prisma)

85 tables, organized by domain (core tables listed below; the schema is authoritative):

- **Accounts & Credits**: User, SmsVerificationCode, AdminAuditLog, CreditAccount, CreditLedgerEntry, ReferralCode, ReferralRedemption, CreditSystemSetting, AiModelConfig
- **Writing & reading**: Novel, Chapter, CoverAsset, ReadingProgress, NovelRead, ParagraphUnderline, NovelFavorite
- **Recommendation**: RecommendationEvent
- **Community interaction**: Post, Topic, PostTopic, PostLike, PostBookmark, Comment, CommentLike, UserFollow
- **Direct messages**: Conversation, ConversationMember, Message
- **Agent runtime and collaboration**: AgentSession, AgentRun, AgentMessage, AgentRunEvent, AgentArtifact, ProjectMemoryEntry, AiUsageLog, StoryBranch, AgentSubtask, AgentSchedule, AgentEvalComparison
- **Agent 3.0 writing and Skills**: StoryCharter, ReaderPromise, SceneTask, ChapterBridge, AgentSkillDefinition, AgentSkillVersion, AgentSkillInstallation, AgentSkillRun, ResearchDossier, StyleProfile, TechniqueCard, ChapterQualityReport, QualityFinding, CorpusSource, AgentEvalSuite, AgentEvalSample, AgentEvalCandidate

### 1.7 Credits, referrals, and model routing

- **Precision and charging**: the database stores milli-credits (1,000 milli = 1 Credit), avoiding floating-point drift. Text uses the bundled-pool formula `ceil(max(inputTokens, outputTokens × 10) × multiplierBps / 100000)` milli. One Credit therefore includes both 10,000 input tokens and 1,000 output tokens, charging the larger utilization ratio instead of adding both. Image generation and web search are fixed at 6 and 2 Credits per invocation.
- **Daily window**: public beta grants 450 Credits per day, resetting at 15:00 UTC+8. Referral rewards live in a bonus balance that daily resets never clear. A refund crossing the reset boundary moves the old-window daily portion into bonus, so `dailyUsed` cannot become negative.
- **Concurrency and idempotency**: charging runs in Serializable transactions and every invocation carries a unique `idempotencyKey`; serialization conflicts retry up to three times. Fixed-price tools require the full balance up front. Text is charged after provider usage is known; an over-budget result charges the remainder down to zero and stops later Agent turns.
- **Referral constraints**: every user owns a unique code, and registration plus rewards share one transaction. The unique `ReferralRedemption.inviteeUserId` means only a brand-new account can redeem once: +300 to the inviter and +120 to the invitee.
- **Model routing**: user APIs expose only tier labels, multipliers, vision capability, and supported reasoning efforts—never built-in model IDs. High is the default effort and the server validates it per model. Speed / Standard / Performance / Ultimate are 1.0x / 1.1x / 1.8x / 4.8x; the latter three require a model ID, Base URL, and encrypted API key before they become selectable. Vision-capable main models receive managed `image_url` inputs directly; text-only models automatically use the safe vision sidecar. Internal AI features such as relationship-graph generation and export default to Speed. BYOK custom models do not consume platform Credits, but global pause and account suspension still apply.
- **Secret custody**: built-in and user API keys are encrypted at rest with AES-256-GCM. APIs return only `apiKeyConfigured`; an empty update keeps the old key and no read path reveals plaintext. Production uses a dedicated `MODEL_CONFIG_ENCRYPTION_KEY`.
- **Surfaces and administration**: `/api/credits/*` serves balances, ledger, referrals, and custom models; `/account/usage` is the only public account subpage. Admin Credit actions use CAPTCHA plus a typed confirmation and support single-user or bulk reset, pause, and resume, alongside global pause. Token management aggregates model tokens and fixed-price tool counts by UTC+8 calendar day/week/month.

### 1.8 Agent productivity and governance layer

- **Task management**: `AgentSession.pinnedAt/status` powers pinning and archiving. Server-side search covers task and novel titles; omitting `novelId` returns cross-novel recent tasks.
- **Story branches**: `StoryBranch` stores the source revision, baseline text, and branch head. Merge uses an `id + revision` conditional update inside a transaction; conflicts return 409 instead of overwriting newer chapter text, while novel word totals are adjusted atomically.
- **Specialist subagents**: research, continuity, quality, and lore each run in an isolated session/run with a role-specific tool allowlist. User budgets are capped by the global budget; cancellation reuses the run stop path and traces reuse persisted SSE replay.
- **Durable schedules**: `AgentSchedule` persists prompts, cadence, and next fire time. A conditional database lease is acquired before polling execution, preventing duplicate claims; busy-session conflicts are deferred.
- **Tool sandbox**: sessions store policies for network, content writes, bulk writes, publishing, and destructive actions plus read-only/workspace/full-access tiers. The server filters tools after registry resolution; `ask` becomes runtime approval and `deny` removes the tool from the model schema.
- **Replay and evaluation**: `AgentEvalComparison` freezes real metrics for 2–4 runs—model tier, reasoning effort, tokens, status, duration, and summary—while detailed replay still reads the canonical `AgentRunEvent` stream.

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
| Credits ledger | Integer milli-credit ledger + Serializable transactions + idempotency keys | Represents small token costs exactly and prevents duplicate concurrent charges, duplicate referral rewards, and negative cross-reset refunds |
| Model secrets | AES-256-GCM encrypted at rest, replace-only and never revealed | A database leak does not directly expose provider API keys; a dedicated master key supports deliberate operations rotation |
| Large-file governance | Module-level splits move only stateless/pure logic; full tsc is the authoritative verification | Completed in this sprint: run-service 1447→1043 lines, write-tools 826→285, loop 903→837, AgentPanel 1096→1020 |
| Frontend component split discipline | Never split untested component bodies; only extract module-level pure declarations | Any JSX slicing without coverage is a regression risk; extracted pure functions get guardrail unit tests |
| One-click export | Server-side dependency-free ZIP writer (store, no compression) + shared Fanqie vocabulary contract | Avoids adding jszip (artifacts are mostly plain text; store mode suffices); the vocabulary lives in `shared/contracts/fanqie-tags.ts` shared by both sides; AI publishing-advice output is clamped to the official vocabulary (no invented tags); AI unavailability degrades to fallback copy without blocking the export |

---

## 3. Testing & CI Report

### 3.1 Test Matrix (Vitest + Supertest)

The repository currently has **63 test files and 339 cases**. CI provides PostgreSQL 16 and executes all database integration groups; DB groups auto-skip in local environments without PostgreSQL.

| Layer | Primary coverage |
| --- | --- |
| Contracts and units | zod inputs, Agent SSE, 98-tool governance, Skill/Story Compiler/quality gates, integer Credits ledger, idempotency |
| API integration | auth precedence, chapter revision conflicts, Agent run/replay, admin controls, Credits, and model routing |
| Frontend DOM interaction | editor caret/scroll stability, 40-marker conversation rail and navigation, preview truncation, model-menu stacking, reasoning selection |
| Security configuration | nginx CSP must be enforced, never Report-Only; static checks for script/connect/frame/base/form boundaries |
| Frozen Agent 3.0 evaluation | 24 scenarios, 6 genres, 9 task classes, and 12 quality signals; dataset hash, code SHA, and version travel with the CI artifact |

Vitest uses the forks pool to isolate process-local caches. jsdom is limited to critical UI regressions so the entire suite does not pay a browser-environment cost. All environments resolve `tests/.env.test` from the repository root.

### 3.2 CI Pipeline (.github/workflows/ci.yml)

Triggered on pushes to main and pull requests; one job runs:

```
postgres:16 service container → npm ci → prisma generate → migrate deploy (test DB chevoink_test)
→ npm run check (type check) → npm run lint → vitest run --coverage (coverage gate)
→ npm run agent3:eval (upload traceable JSON artifact) → npm run build
→ npm audit --omit=dev --audit-level=high
```

- CI coverage floors are statements 18%, branches 59%, functions 32%, and lines 18%. The PostgreSQL-backed run measured 18.96% / 61.72% / 32.73% / 18.96% on 2026-09-02; the no-DB local floors are 10% / 59% / 15% / 10%. The first purpose is to prevent regression; floors rise as critical modules gain coverage.
- Every CI run uploads `agent3-eval-<commit SHA>` for 30 days, preventing evaluation results from living only on a developer machine or in prose claims.
- The production dependency gate is high severity. As of 2026-09-02, `npm audit --omit=dev` reports **0 vulnerabilities**.

### 3.3 Local Quadruple Gate (per-batch discipline)

`npm run check` → `npm run lint` → `npx vitest run --coverage` → `npm run agent3:eval` → `npm run build` → `npm audit --omit=dev`. A release must also pass the real-product gates in Section 11; green automation is not proof of retention or willingness to pay.

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
- Database migrations go through `prisma migrate deploy` (48 migrations currently).
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
| Database & session | `DATABASE_URL` / `AUTH_SESSION_SECRET` / `MODEL_CONFIG_ENCRYPTION_KEY` / `AUTH_COOKIE_DOMAIN` / `AUTH_COOKIE_SECURE` | Prisma connection string, Cookie signing, and the model-key encryption master secret |
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

All 63 test files use the local forks pool. CI additionally runs PostgreSQL integration groups, coverage, the Agent 3.0 evaluation snapshot, build, and dependency audit, with a 20-minute workflow timeout.

---

## 6. Security Posture & Risk Trade-offs

### 6.1 Implemented Security Controls

| Layer | Control |
| --- | --- |
| Transport | HTTPS enforced (HSTS max-age=31536000); `X-Content-Type-Options: nosniff`; `X-Frame-Options: DENY`; CSP enforced (`deploy/nginx.chevoink.conf`) |
| Session | HttpOnly Cookie + signed sessions; ban and tokenVersion revocation compared in real time (60s cache + DB-failure stale fallback ≤10 minutes); proactive eviction of the ban cache |
| Auth boundary | All write endpoints return 401 before 400 (reject unauthenticated first, leaking no validation details); unified zod validation copy |
| Rate limiting | SMS code IP dual window (hourly/daily); admin login IP+account dual-key failure lockout; TTS synthesis 20/min per IP; rate-limit Maps cleared past the cap to prevent unbounded growth |
| Secrets | All injected via `.env` (template `.env.example`); `.env`, certificates and keystores excluded by `.gitignore` (`plan/08`) |
| Agent | Tiered tool permissions plus a server-enforced per-session sandbox; per-run/subagent budgets (ask_user 3, web search 5, web deep-read 8, platform search 5, platform deep-read 8); AiUsageLog records token consumption; AdminAuditLog records high-risk console operations |
| Credits & referrals | Daily reset is an idempotent `periodEndsAt <= now` conditional update; invitee uniqueness, same-transaction registration/reward writes, and ledger idempotency keys prevent refresh/retry/concurrency double claims |
| Model secrets | API keys are encrypted with AES-256-GCM; ordinary APIs return only configured/not-configured; `.env.example` contains placeholders and no live key |
| Dependencies | Dual gates in CI and deployment `npm audit --omit=dev --audit-level=high`; currently **0 vulnerabilities** |

### 6.2 Explicit Risk Trade-offs (written record)

1. **AGENT_AUTO_APPROVE defaults to true** (`api/config/env.ts`)
   - Trade-off: zero-interruption autonomous writing is the product's core selling point (a user-confirmed product decision); defaulting to false would violate the feature baseline.
   - Mitigation: write/dangerous tools have tiered permissions and a J-phase high-risk tool audit; `AGENT_AUTO_APPROVE=false` restores the full approval flow in one flip; all Agent operations leave traces (AgentRunEvent + AiUsageLog).
2. **Auth degradation opens rather than fail-closed**
   - Trade-off: rejecting all sessions on DB failure would take down site-wide login state; the availability loss outweighs the revocation-window risk.
   - Mitigation: stale fallback only reuses historical success states within a ≤10-minute window, with ban/tokenVersion still compared as usual; beyond the window it opens with a `warnAuthDegrade` log.
3. **CSP has moved from Report-Only to enforce**
   - Current scope: scripts and API connections are same-origin; images and media retain HTTPS/data/blob compatibility; frame ancestors, base URI, and form action are locked down.
   - Follow-up: styles still require `unsafe-inline`; remove it after the style system supports nonces/hashes.
4. **Admin login keeps the manual three-mode branch validation**
   - Trade-off: username/phone/email three-mode is a state-machine validation; zod-izing it would require superRefine to duplicate branches and could change error ordering — risk outweighs benefit.

---

## 7. Technical Debt

| Debt | Current state | Direction |
| --- | --- | --- |
| Repo-wide coverage remains low | CI now locks the 18/59/32/18 baseline, but statement/line coverage alone cannot establish product quality | Prioritize StudioWorkspace, AgentPanel, Credits admin, and payment prerequisites; only raise, never lower, the gate |
| CSP can be tightened further | Enforced, but style compatibility still includes `unsafe-inline` | Move dynamic styles to nonces/hashes or static classes, then remove it |
| Critical frontend interaction coverage is incomplete | P0 caret, rail navigation, menu stacking, and reasoning selection have DOM regressions; many large-component state combinations remain uncovered | Add Work/IDE switching, panel resize/collapse, archive/branch/schedule, and Credits-admin E2E coverage |
| Real product metrics are not closed | Frozen evaluation is reproducible, but expert blind review, 7/30-day retention, failure rate, and unit cost are still being measured in the nearly-200-person beta | Fix cohort/version definitions per Section 11 and do not claim GA commercialization until thresholds pass |
| Paid Credits flow still needs acceptance | Integer ledger, charging, pause/resume, and audit exist; complete evidence for packages, payments, orders, refunds, invoices, and support handling does not | Pass payment sandbox and reconciliation drills, then gray-release small packages before recurring plans |
| Prisma config migration | `package.json#prisma` deprecated (removed in Prisma 7) | Upgrade to `prisma.config.ts` |
| Manual deploy-pack whitelist | tar whitelist once referenced a deleted file and broke packaging (historical incident) | When adding top-level directories, cross-check the `deploy-production.ps1` whitelist |

---

## 8. Evolution Plan

Completed 1.0–2.0 work includes three-device adaptation, the writing Agent, Studio refactors, Skill/knowledge sets, release pipeline, mobile, TTS, admin, recommendations, Android shell, immersive reading, and the desktop Work/IDE redesign (04–22). `plan/23` defines Agent 3.0's Chinese web-fiction, Skill ecosystem, and formal completion criteria.

Agent 2.0 P0 engineering foundations landed on 2026-08-25: frozen runtime contracts; chapter revision migration and optimistic locking; version-guarded Agent chapter writes; revision propagation across publishing, insertion, deletion compaction, and rollback; and test-enforced governance for the then-current 32 tools. Agent 3.0 has expanded the same governed registry to 98 tools.

The 2026-08-30 Studio iteration streams final answers and long document-tool arguments over SSE, locks the target chapter/plan while the Agent writes, and lets tool activity navigate to that target. The former memory tab is now a whole-novel relationship graph: low-reasoning AI runs only when chapters exist and the graph is empty, while manual rebuilds have a ten-minute cooldown. The admin console treats `AiUsageLog` as the canonical model-token meter and exposes user ranking, novel/session/run drill-down, plus web-search and image-generation invocation counts.

The 2026-08-31 Agent entry opens the complete workspace even when an author has no work. The system creates a non-public bootstrap novel and the first prompt drives the Agent to initialize it through the atomic `novel_create` action, which verifies both ownership and bootstrap state and cannot be replayed against a normal novel. Empty tasks share one context-aware randomized suggestion component across Work, IDE, and mobile; choosing a suggestion only fills the draft. First-work completion asks only about still-missing title, synopsis, tags, or cover.

Studio / Agent 2.0 desktop and memory UX landed on 2026-08-26: the Work/IDE command bar now keeps only novel selection while chapter hierarchy lives in the editor header; the editor uses a flat edge-to-edge surface; Studio has a scoped neutral light/dark palette; side panels have no fixed maximum width and snap closed below their collapse thresholds; Work renders the memory graph directly in the inspector and mobile includes a dedicated memory view. Existing prose is projected into the graph through idempotent local rules, while every completed Agent turn performs threshold-based context compaction and revision-aware memory refresh without an additional model call. The in-process projection-version cache is capped at 500 novels.

Agent 3.0 reached engineering freeze and entered a nearly-200-person public beta on 2026-09-02. Story Compiler makes Story Charters, Reader Promises, Scene Tasks, and Chapter Bridges traceable artifacts. Skill OS adds private Skills, shared invitations, deterministic routing, and positive/negative tests. Research Dossiers, Style DNA, the rights-cleared prose library, and quality reports govern research, style, and prose quality. Subagents, branches, and schedules share the same permission, budget, SSE, and audit chain. Deterministic frozen evaluation now runs in CI; expert blind review, demonstrated improvement over 2.0, retention, cost, and failure-rate acceptance remain governed by Section 11.

New accumulations from this engineering sprint (2026-08, 85→90 points):

- zod validation canonicalized to cover all write endpoints (copy verbatim-anchored in `tests/integration/p2-validation.test.ts`);
- Auth degradation hardening (stale fallback + cache capacity cap 5000);
- Module-level splits of the three largest backend files (run-service / loop / write-tools) with guardrail unit tests;
- Frontend AgentPanel module-level extraction (panel-helpers + ProcessingHint into separate files);
- Studio one-click zip export (four content scopes checkable, per-chapter selection, AI-generated publishing advice against the Fanqie Novel official vocabulary) and the Agent `novel_export` tool (chapter subsets & exclusion rules supported).

Candidate directions going forward (ordered by payoff):

1. Close Agent 3.0 product gates with real blind-review, retention, failure-rate, and unit-cost data;
2. Expand Work/IDE, Credits admin, and paid-flow component/E2E coverage while progressively raising CI floors;
3. Remove CSP `unsafe-inline` and migrate Prisma configuration;
4. Complete package/payment/order/refund/reconciliation/support sandbox drills;
5. Prepare PM2 multi-instance/containerization, queue backpressure, and provider circuit-breaker playbooks for beta growth.

---

## 9. plan/ Document Index

The `plan/` directory holds true landed-phase snapshots and active implementation plans; numbering equals project initiation order. **Multiple documents under the same number = independent workstreams advanced in parallel within one phase**, not version overrides. `plan/00`–`plan/22` have landed; `plan/23` engineering is frozen while real product metrics remain in beta acceptance.

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
| `plan/09` | Data model & interface contract draft | Landed (evolved to 85 tables, see [1.6](#16-data-model-overview-prismaschemaprisma)) |
| `plan/10` · `plan/11` | Writing Agent design · high-fidelity opencode Agent replication | Landed (implementation evolved, see 9.2) |
| `plan/12` · `plan/16` | Frontend UI/UX product-grade optimization · mobile studio deep optimization | Landed (layout approach evolved, see 9.2) |
| `plan/13` | Studio Agent deep refactor & frontend product-grade optimization | Landed (including later P3/P4 module-level splits) |
| `plan/14` | Agent hallucination governance & knowledge-set/Skill deep optimization | Landed |
| `plan/15` | Release pipeline & Agent experience fixes + site-wide loading optimization | Landed |
| `plan/17` | Reader TTS narration | Landed |
| `plan/18` (two docs) | Admin console · community recommendation algorithm & topic system upgrade | Landed |
| `plan/19` | Android APK client packaging (Capacitor shell project) | Landed |
| `plan/20` (three docs) | Site-wide loading performance & Agent-runtime jank fixes · mobile immersive reader refactor · reader fullscreen immersion (Android shell safe-area system refactor) | Landed |
| `plan/21` | Studio and Agent 2.0 enterprise iteration plan | Landed; revision/governance foundation for 3.0 |
| `plan/22` | Desktop Studio Work and IDE deep redesign | Landed |
| `plan/23` | Agent 3.0 Chinese web-fiction humanization and Skill ecosystem | Engineering frozen; real blind-review, retention, cost, and failure-rate acceptance in progress |
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

---

## 11. Agent 3.0 General-Availability Gates

“Feature complete,” “green CI,” and “nearly 200 beta participants” are not independently sufficient evidence for general availability. Agent 3.0 and paid Credits packages must pass separate engineering, quality, user-value, cost, and commercial-flow gates.

| Gate | Status on 2026-09-02 | Requirement before broad release |
| --- | --- | --- |
| Engineering regression safety | ✅ Established | 63 test files / 339 cases, coverage non-regression, enforced CSP, production dependency audit, and critical UI regressions |
| Frozen-scenario evaluation | 🟡 Framework and CI snapshot established | At least five runs per formal scenario; freeze model, temperature, Skill/retrieval versions, code SHA, and tokens; every failure traceable |
| Expert blind review | 🟡 Admin capability exists; real sample pending | At least three target-genre readers/editors per sample; anonymous comparison of 2.0, 3.0, and human samples; target ≥65% overall preference for 3.0 over 2.0 |
| Quality improvement | 🟡 Beta sampling | Target ≥40% relative reduction in “obviously AI/mechanical” marks and ≥35% reduction in average author revision rounds to publishable text |
| Retention and publishing | 🟡 Nearly-200-person cohort can now be measured | Target ≥25% lift in first-work three-chapter completion and ≥20% lift in 7-day continued creation; also track publish rate, update-publish rate, and weekly effective creators |
| Cost and reliability | 🟡 Token/Credits logs exist; budgets not yet frozen | Track success rate, P95 latency, input/output/cache tokens, per-task and per-1,000-character cost, and degradation rate by task class; open expensive capabilities only after thresholds pass |
| Copyright and data governance | 🟡 Rights records, technique cards, and revocation cleanup exist | 100% of production documents have source/rights records; 100% leak blocking; zero confirmed infringing outputs; user controls and deletion are verifiable |
| Paid Credits | 🔴 Not ready for unrestricted sale | Approve packages/pricing; pass payment sandbox, order idempotency, callback signatures, refunds/chargebacks, reconciliation, invoicing/support, balance compensation, and pause/resume drills |

Beta analysis must freeze cohort and version. Do not blend new and returning users, 2.0 and 3.0, different models, or different promotional grants into one average. Complete at least one full seven-day observation window before broadening the rollout; 30-day retention cannot be claimed before a complete 30-day window. Gray-release paid packages as small, capped, manually refundable purchases, and reconcile every ledger total to the payment provider.

The Definition of Done remains `plan/23`: observable and reversible Skill lifecycle, Story Charter and first-three-chapter prototype, Chapter Bridges, evidence-based quality gates, a rights-cleared prose library, frozen-set and blind-review superiority, demonstrated retention improvement, accepted cost/latency/failure rates, and per-user rollout/disable/rollback compatibility for old works and clients. Until all gates pass, the accurate label is “Agent 3.0 public beta,” not “validated general-availability commercial product.”
