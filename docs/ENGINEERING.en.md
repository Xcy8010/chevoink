# Chevoink Engineering Documentation

### 2026-09-10 tool failures and plan editing

- In-run compaction converts completed old tool rounds into non-executable receipts instead of `_contextCompacted` argument examples. Recent and incomplete calls remain intact. Shared input normalization rejects old excerpts rather than unwrapping abbreviated content into writes. Main and inline sub-agents share this behavior.
- Volume/chapter reordering allocates temporary indexes below the existing minimum, avoiding negative slots occupied by newly created objects while retaining transactions and both unique constraints. Database regression covers successive chapter creation in the second volume; no wrong-volume fallback is introduced.
- Continuity success does not certify quality review. Quality repairs that change the revision explicitly require read-only continuity verification before commit. Completion gates, billing and retry limits remain unchanged. Provider `length` truncation still rejects the write and guides complete-paragraph calls without reducing the original target.
- Plan buffers are scoped by documentId; unmount flushes only the old callback. Rich text replacement compares parsed documents to avoid cursor resets from equivalent Markdown echoes. Disposed editor events cannot update the current view. DOM tests are not real-device acceptance.
- Audit distinguished an old 2.12M-token stop from a recent run that checkpointed from 2M to 4M before exhausting actual Credits. Checkpoints neither grant unlimited budget nor waive charges. Budget refusal now reports the limiting condition without an extra paid wrap-up request.


2026-09-09 thinking compatibility fix: a production turn at 22:25 HKT was rejected with `Thinking mode does not support this tool_choice`; the rejected request was charged zero. Protocol correction had forced a parameter unsupported by DeepSeek thinking. Central request construction now checks provider, model and official hostname, omitting `tool_choice` for DeepSeek thinking while preserving native tools, reasoning effort, model, correction budgets and completion evidence. No extra HTTP retries are added. Tests cover built-in and identifiable custom/proxy routes across reasoning levels; opaque proxy aliases still require an identifiable model/provider. Follow the [DeepSeek thinking integration guidance](https://api-docs.deepseek.com/quick_start/agent_integrations/oh_my_pi/), not just generic field documentation.

2026-09-09 recurrence fix: renaming history receipts did not prevent imitation. Receipts now live in separate read-only data messages, not assistant prose; legacy assistant echoes are removed from model context. Correction requests require native tool calls. Explicit next-chapter completion checks same-task persisted content and a committed bridge for its current revision. Existing messages, user wording, manuscripts and bills are not rewritten; typed continuation inherits the original contract even after an old false-completed status. Native choice semantics follow the [provider API](https://api-docs.deepseek.com/api/create-chat-completion/), never execution of prose.

2026-09-09 output/protocol P0: generic waiting feedback follows actual text/reasoning deltas for the current run and returns after 1.5 seconds of silence without a running tool card. Historical tool summaries are factual status records, not pseudo-call examples. Invalid responses are not fed back as assistant examples; real calls reset the consecutive protocol-failure streak. Recovery remains capped at two consecutive corrections and six per run under existing run budgets. Text is never treated as executed work; model tiers, credit formulas and chapter content are unchanged.

English | [简体中文](./ENGINEERING.md) · [Development standards](./DEVELOPMENT-STANDARDS.en.md)

Verified on 2026-09-08 against code and production revision `71f7adc`; [CI passed](https://github.com/Xcy8010/chevoink/actions/runs/34240086273). Implementation, automated evidence and unverified product outcomes are deliberately distinguished.

### 2026-09-09 targeted tool-failure fixes

- Generic waiting feedback no longer depends on reasoning finalization: keep the existing processing animation until a rendered execution card takes over; hide it while awaiting the user, paused or terminated. No additional model requests.
- Omitted quality-check targets resolve to the task's unique active compilation instead of a stale editor tab. Legacy continuations share a validated contract ID plus user/novel/session scope; unrelated tasks remain isolated. Continuity checks and bridge commits use the same scope.
- Shared normalization omits blank `*Id` values only when the schema allows omission. Required identifiers, body text, empty replacements and search whitespace stay unchanged. Explicitly truncated provider arguments remain rejected rather than being completed into a fabricated write.
- Verified no-match/no-change previews return an explicit no-op without creating a changeset. Authorization/persistence failures remain failures. All tools share a per-tool stop after two consecutive model-response failures; diagnostic logs retain codes and durations, not manuscripts or credentials.

## 1. Architecture and entry points

React SPA + Express + PostgreSQL monolith for writing, reading, community and administration; Android uses a Capacitor shell. Production runs one PM2 instance. Independent workers and multi-instance disaster recovery are **not fully delivered**.

The candidate Windows shell in `desktop/windows/` loads the same-origin website using Tauri/WebView2, without duplicating business logic or running a local backend. Signing and real-device release acceptance are incomplete; see [Windows acceptance status](WINDOWS_DESKTOP.md). Its Node/Rust toolchain must not become a production API installation or deployment dependency.

### Windows change boundaries

- Platform identifiers select compatibility paths, not authorization. Windows changes must preserve Android UA detection, APK updates and voice-plugin paths.
- Keep native capabilities in the host and the two narrow remote commands. Any added command requires origin, ACL, payload and negative-test review; no generic shell or filesystem-path bridge.
- Normal close/update must await the existing save pipeline. Unknown or failed saves and active recording/downloads keep the window open by default. Never auto-resolve reviews, resend tasks or settle charges.
- Record web gates and Windows fmt/clippy/test/packaging separately against a specific commit. DOM tests cannot replace real WebView2, installation, updates, permissions or DPI acceptance.
- Apply Authenticode before updater signing and hashes. Platform releases must not claim the repository-wide Latest flag. Do not advertise unverified stable downloads or present internal packages as stable releases.
- The enhanced offline package only embeds the WebView2 installer; retain the ordinary package's version, appId and business code. It does not enable offline writing. Upgrades must preserve cookies, drafts, layouts and pending reviews.

| Layer | Entry points and responsibility |
| --- | --- |
| Frontend | `src/app`; `src/features/studio`, reader, community, admin and other business domains |
| API | `api/app.ts`, `api/routes`, `api/lib/data`: assembly, authorization, validation and data access |
| Contracts | `shared/contracts`: requests, responses, SSE, revisions, tasks and billing |
| Agent | `api/lib/agent/loop.ts`, `run-service.ts`, `tools/registry.ts` |
| Durable execution | `runtime-identity.ts`, `runtime-lease.ts`, `runtime-state.ts`, `runtime-operations.ts`: identity, owner/epoch, checkpoints and receipts |
| Research | `research-sources.ts`, `research-ranges.ts`, search/read tools: source versions, cursors, attempts and task budgets |
| Billing | `ai-service.ts`, `credits.ts`, `billing/`: usage, wallets, frozen prices, reservations, calculations and replay |
| Data | Prisma 6.12.0; 106 schema models and 72 migration directories |
| Release | `scripts/deploy-production.ps1`, `deploy/deploy-production.sh`, nginx and PM2 |

Node **22.23.2** and npm **10.9.8** are pinned in the runtime/manifest/lock contract. Production checks the actual API process binary, not only the build shell.

## 2. Changes and behavior boundaries

| Reported issue | Implemented response | Not established by this change |
| --- | --- | --- |
| Resume summarizes or revives an old chapter | Persist original request/scope; validate restored usage/budget; propagate cancellation; fence late writes | Unconditional recovery of all damaged historical records |
| Repeated continuity repairs | Reuse only current revision/source checks; at most one automatic factual repair, then verification only; warnings do not trigger stylistic rewriting | Committing factual errors or reusing stale results |
| Intermittent humanity review failures | One local evidence-quote correction; retain valid findings; distinguish malformed output from provider/credit errors | Passing unverifiable evidence or eliminating all network failures |
| Pending-review dialog blocks a new novel | Remove only the new-novel guard; retain chapter/plan reviews by novel; fix outgoing state being persisted into the incoming scope | Automatically accepting, rejecting or clearing reviews |
| Draft/panel state crosses tasks | Scoped drafts/panels; hydration ownership guard; StrictMode, A/B/A and remount regression tests | Full browser/device acceptance |
| Large frontend components | Extract persistence, layout, cover/catalog/plan actions, projection, scrolling and run controls | Smaller bundles or faster interaction merely from extraction |
| Search/read 404, unreadable text and repeated fetches | Separate provider/target failures; persist attempts and Retry-After; version text and link lists; reuse cached pages | Bypassing site restrictions or obtaining every chapter |
| Usage, refunds and replay reliability | Integer pricing, frozen snapshots, idempotent receipts/charges, durable refund intent, pending unknown usage | Fully automated provider reconciliation or activated V2 pricing |

Existing queued requests, steering, branch/new-task delivery, todo/change pills, mobile combined summaries, narrow-viewer icon buttons and argument-preparation activity remain in place. This refactor does not redesign them.

Frontend extraction locations:

- `components/use-chapter-persistence.ts`: autosave and asynchronous revision-safe writes.
- `components/use-workspace-layout.ts`, `use-work-panel-state.ts`: layout and scoped restoration.
- `components/use-pending-review-storage.ts`: pending reviews per novel.
- `components/use-cover-actions.ts`, `catalog-actions.ts`, `plan-document-actions.ts`, `plan-review-actions.ts`, `use-plan-sync.ts`.
- `agent/lib/message-projection.ts`, `agent/components/use-message-scroll.ts`, `use-run-controls.ts`.

StudioWorkspace and AgentPanel remain substantial orchestration components. Decomposition is not complete; line counts alone do not prove quality.

## 3. Current and candidate Credits formulas

### 3.1 Production V1

The pre-discount baseline on 2026-09-08 used `credits-v1-exact`; historical operations retain this price. The approved V2 release below is enabled through audited active rate cards.

P = confirmed prompt tokens; O = confirmed completion tokens; m = the operation's frozen tier multiplier.

```text
C_v1 = ceil(1000 × m × max(P / 10000, O / 1000)) / 1000 Credits
wallet milli = ceil(max(P, 10 × O) × multiplierBps / 100000)
m = multiplierBps / 10000
```

This is a paired allowance: take the larger utilization, **do not add both pools**. BigInt arithmetic rounds once per logical charge to 0.001 Credit; negative, fractional, unknown and overflowing usage must not enter settlement as valid zero.

Production selectable multiplier snapshot: Speed **1.1**, Standard **1.0**, Performance **3.0**, Ultimate **3.5**. These are deployment settings, not immutable source defaults; published rates and the frozen operation price govern later changes. P=10,000, O=1,000, m=1.1 costs 1.100, not 2.200 Credits.

- Public beta: 450 daily Credits, reset at 15:00 UTC+8; referral balance is separate.
- Search: 2 Credits per call; image generation: 6 per call. Refunds reference actual original debits.
- BYOK text does not incur platform text Credits; other platform tools and permissions are separate.
- Reasoning already included in confirmed completion usage is not added again. V1 has no separate cache-hit discount.
- Provider cash costs and user Credits are different measures.

Sources: `api/lib/billing/pricing.ts`, `credits.ts`, `billing/token-price.ts`, `ai-service.ts`.

### 3.2 Cache-discount V2 and an explicitly approved release exception

```text
U = P − H                       # confirmed cache-hit tokens H
N = U × inputNano + H × cacheNano + O × outputNano
wallet milli = ceil(N / 1,000,000)
```

Rates are nano-Credits per token and **already include tier/calibration**. Do not multiply again. Rate-card lifecycle: draft → shadow → approved → active, with immutable hashes and events.

Owner-approved exception on 2026-09-09: default-path V2 calls with trustworthy reported input/output totals but unknown cache counts settle at `P × cacheNano + O × outputNano`, still capped by the frozen V1 price. Preserve null cache evidence and record `unknown-cache-discount-2026-09-09` in the ledger. The platform absorbs the difference; do not infer cache hits or retroactively bill the discount. Pending observations with trustworthy totals enter the existing settlement retry process. Entirely missing totals remain pending, never fabricated as zero usage. Prior daily-window unknown usage no longer locks fresh allowance; current-window reconciliation and actual exhaustion use distinct errors.

BYOK Agent quality/continuity checks, repairs, research synthesis and session naming inherit the run's custom model. Standalone export advice and relationship graphs prefer the owner's most recently updated enabled custom model; invalid configuration must not silently fall back to a paid platform model. Custom text calls consume no platform Credits. Paid platform image/search tools retain quota checks, but their exhaustion does not terminate remaining BYOK text work. Account suspension and other security controls still apply.

Same-day P0 follow-up: default text calls reserve a limited deposit instead of globally blocking accounts on pending receipts. The hold is the minimum of the frozen quote, 25 Credits, 25% of balance and current availability; it is not a final charge cap. Serializable transactions prevent overlapping holds; other paid tools cannot spend reserved funds. Settlement charges the completed call and releases its hold. Holds expire within 30 minutes and before the daily-window boundary. Legacy unknown receipts are not retroactively guessed. Three unknown calls for the same user/model within 30 minutes temporarily restrict that model, not other models or BYOK.

For received output without final usage, `observed-output-estimate-2026-09-09` uses existing reported counts first, estimating only missing counts from sent input/received output (roughly four ASCII characters or one non-ASCII character per token, rounded up). Unreceived internal reasoning is never invented. Ledger entries identify estimates; original provider fields remain unknown. Streaming auxiliary checks persist counts, not manuscript copies, and incomplete reports never pass quality gates. Entirely unobserved calls retain only time-limited holds and audit records; explicit provider rejection releases the hold. There is no universal provider invoice lookup, so complete automatic reconciliation must not be claimed. The usage page discloses the reservation and exception rules.

The same release moves internal critics to streaming reception with JSON gateway compatibility, without introducing an output truncation limit. HTTP gateway failures are distinct from malformed reports. Two consecutive provider failures for one validation tool in a run stop further paid retries; changing compilation IDs or arguments does not reset the count. Preserve manuscript and incomplete status; structural validation is not a substitute for quality approval. A successful check clears its failure count; explicit user continuation permits a fresh attempt.

Offline replay: `npx tsx scripts/audit-credit-pricing.ts <replay.json>`. It consumes de-identified confirmed usage and a frozen candidate; it does not access wallets, charge, fit or approve rates.

On 2026-09-08 the owner approved quarter-price cached input, unchanged ordinary input/output rates, and a frozen `v1CeilingBps`: charge the smaller of itemized and original V1 amounts. The owner waived the seven-day wait after verification. This exception requires the exact discount, verified configured multipliers, cap, replay hash, quality validation, approval reference, superadmin and public notice. This is not seven-day shadow evidence or lower provider cash costs; other price changes retain the original gate.

Usage/ledger views expose frozen rates and cap. Unknown cache remains pending, never zero. Historical snapshots remain unchanged. After activation, do not roll back to an application that cannot parse the cap; use a forward fix or an explicitly compatible pricing/protocol rollback.

Offline replay cutoff: 2026-09-08 15:40 UTC. Of 6,570 observations, only 51 Speed requests had complete confirmed receipts: V1 446.341 versus capped V2 284.069 Credits, maximum per-request increase 0. The other 6,519 lacked historical confirmation/cache fields and were excluded. No historical charges were modified; do not extrapolate to other tiers or provider cash costs. Report hash: `0670d947df573eb9228f7c446e7a3b4f7d8995145c4a5d6c756c5e374c1e221b`.

## 4. Token and latency work

| Mechanism | Waste addressed | Boundary |
| --- | --- | --- |
| Revision/source-bound report reuse | Repeated model checks of unchanged content | New revisions invalidate; failed reports never pass |
| One minimal factual repair, then read-only verification | Unbounded check/rewrite loops | Real errors remain blocking |
| Local quote correction | Re-running a whole review for one invalid quotation | At most one extra exceptional call; not guaranteed cheaper per invocation |
| Durable text/link lists with cursors | Re-fetching the same source/catalog | Read coverage is not completed chapter analysis |
| Failed attempts, negative cache, Retry-After | Blind retries against unavailable/restricted sources | Restrictions remain; metadata is not full text |
| Deterministic receipts/context reduction | Repeated old tool payloads in context | Preserve goals, constraints, recent tool pairs and retrieval references |
| Original task-root budgets and deduplicated read progress | Budget resets on retries; premature completion without todo | New standard tasks: search 2 / fetch 2; explicitly deep research: 5 / 8. Two consecutive read failures stop new network work; cached paging spends no fetch quota. Full-book policy remains unfinished |
| Operation receipts, idempotency and refund intent | Duplicate charges and lost cancellation refunds | Some unknown-usage reconciliation remains unfinished |

Fault tests establish control-flow invariants. There is **no published matched before/after experiment** for identical tasks, models and budgets, so no verified percentage Token saving, P95 improvement or cash-cost reduction is claimed. Model quality, chapter length and quality gates were not lowered to manufacture savings.

## 5. Verification and performance snapshot

Revision `71f7adc`, isolated remote PostgreSQL 16 with least-privileged role and Node 22.23.2; no rewriting production author content for tests.

The cache-discount/reader batch passed all four pre-release gates: 161 files, 1,894 tests; global lines/statements 33.65%, branches 76.08%, functions 55.80%. The table below retains the preceding release baseline. Deployment still requires successful CI for the exact commit; pre-release verification is not a deployment claim.

| Measure | Result |
| --- | --- |
| Automated suite | 161 files / 1,885 tests passed |
| Original coverage denominator | statements/lines 33.62%, branches 76.00%, functions 55.78% |
| CI floors | statements/lines 30%, branches 73%, functions 52% |
| No-DB quick-test floors | 10% / 59% / 15% / 10%; not release acceptance |
| Gates | check / lint / test / build passed |
| Additional checks | Agent deterministic eval; production and full dependency audits, 0 vulnerabilities at scan time |
| StudioPage | 629.10 kB / gzip 167.57 kB; >500 kB chunk warning remains |
| PlanRichMarkdownEditor | 462.43 kB / gzip 151.17 kB |
| Main CSS | 147.66 kB / gzip 25.21 kB |
| Production | Healthy API, public HTTP 200, pinned Node process |

Previous StudioPage was 629.16 kB / gzip 167.57 kB: no material bundle reduction. Interaction latency, frame timing, devices and model/network P95 still require controlled measurements. These numbers do not establish literary quality or a 95–100 independent score.

## 6. Release, recovery and security

Pipeline: pinned runtime → npm ci → Prisma generation → isolated DB/role validation → migrations → check → lint → coverage tests → Agent eval → build → both dependency audits.

Release archives use **git archive HEAD of the exact successful CI SHA**, not uncommitted drafts, secrets or private investigations. Current deployment still installs/builds in place and reloads PM2; old hashed assets remain and index.html is published last. Fully immutable application directories, atomic application switching and automated rollback are **not yet delivered**.

`-SkipLocalChecks` is allowed only with authorization and equivalent controlled remote evidence for that SHA. It is not permission to skip validation. Interrupting active Agents requires deployment authorization.

Authentication distinguishes verified / missing / unavailable. Unverifiable sessions return `AUTH_SESSION_UNAVAILABLE`; database failures must neither clear cookies as if logged out nor confer verified access. See `auth-session.ts` and `api/app.ts`.

Controls include revision-conditional writes, user/novel ownership, private attachment authorization, guarded egress/redirects, size/time limits, enforced CSP, HttpOnly cookies, AES-256-GCM model secrets and admin audit. Application tool permissions are not an OS sandbox. A zero-vulnerability audit does not replace independent security testing.

Use forward-compatible migrations; code rollback must not down-migrate away committed user data. Restore consistency, RPO/RTO and cross-version recovery/rollback exercises remain unverified.

## 7. Remaining closure work

2026-09-10 cross-novel sidebar flicker: local task lists now carry their owning novel instead of being relabeled with the incoming route. Explicit session links precede remembered active tasks; unresolved targets do not temporarily activate unrelated tasks. Project expansion runs before paint and the scroll-restoration ref remains stable. Real-sidebar DOM regressions cover route-first/state-later A→B→A transitions, node identity, duplicate rows, selection and scroll retention; these are not production-browser pixel acceptance.

2026-09-10 Work plan restoration: task-scoped selection is no longer overwritten by legacy novel snapshots. Loading an empty plan list is not deletion evidence. Persisted plans use a stable view identity while editing still targets the original local artifact. Reading positions are scoped by user/novel/task/document and restored once after asynchronous rich-editor creation, never on the first click or input. Regressions cover StrictMode, unowned transitions, A→B→A, history aliases and editing. A local fixture combining real WorkPerspective, StudioChapterViewer and Milkdown with simulated delayed loading restored the original 821px offset and retained it after clicking and typing. This fixture is not production-account end-to-end or device acceptance.

2026-09-09 continuity/message fixes: `chapter_read` accepts an exact whole-book `chapterOrder`; conflicting identifiers or foreign targets never fall back to the editor chapter. Error cards identify target failures. Markdown removes leftover line boxes/empty paragraphs from hidden tool-status lines without flattening prose or code. The continuity critic may return minimal factual patches in the same response, applied only with unique, non-overlapping verbatim anchors; otherwise the separate repair fallback remains. Full revised-text verification, the model and low reasoning effort remain unchanged. Prior findings are clues, not a pass certificate; changing guidance moves to the prompt tail to preserve reusable prefixes. Eligible cases save one model request; no unmeasured latency or literary-quality percentage is claimed.

- Global lines/statements ≥40%, each critical module lines/branches ≥80%, API/data and all fault-matrix acceptance.
- Further frontend/backend boundaries, dependency/cycle checks, full Work/IDE/mobile/reader/community/admin end-to-end acceptance.
- Authorized whole-book manifest, per-chapter analysis receipts, missing-chapter recovery and report completion; read ranges are insufficient.
- Phase authorization for research-then-write, full research budgets and complete cost attribution.
- Automated unknown-provider-usage reconciliation, complete billing recovery/reconciliation evidence and further grouped V2 observations. The explicitly approved 25% cache discount with the V1 ceiling is active; the seven-day wait was waived, not completed. Other price changes retain their original approval gates.
- Independent security review, database restore, cross-version rollback, immutable application releases, real performance and literary non-inferiority.
- Product blind reviews, retention and complete paid/payment flows; describe the product as beta, not a verified commercial release.

Historical plans remain unchanged. Documentation edits and green CI do not automatically complete these items.

2026-09-10 Windows 1.0.3 release preparation: the owner authorized an unsigned preview with signing and automatic updates deferred. Manual web downloads use a separate manifest from the native stable updater, display the unsigned warning, and never supply placeholder signatures. No background check starts without a public key. Added installed-WebView2 CI regressions and a scoped CycloneDX BOM for the Rust Windows target. User-confirmed 1.0.2 Win11 core acceptance is recorded in [Windows status](./WINDOWS_DESKTOP.md); Win10, multi-monitor and complete security/endurance validation remain unverified. This is not a stable-release certification.
