# 启创墨域 Chevoink 工程文档

> 本文档统一汇总系统架构、关键技术决策、测试与 CI、部署方案、性能数据、安全策略与风险取舍、技术债务及演进计划。
> 全部内容基于当前仓库代码与 `plan/` 目录内的真实方案文档，随工程演进持续更新。
> `plan/00`–`plan/22` 为已落地阶段的真实规划快照，`plan/23` 是 Agent 3.0 的产品与评测基线；历史路径与当前实现的对应关系见 [第 9 节](#9-plan-方案文档索引)。
>
> 最近更新：2026-09-02。Agent 3.0 已进入近 200 人公测，工程能力已冻结，真实盲评、留存与商业化指标仍按第 11 节门禁持续采样。

## 目录

1. [系统架构](#1-系统架构)
2. [关键技术决策](#2-关键技术决策)
3. [测试与 CI 报告](#3-测试与-ci-报告)
4. [部署方案](#4-部署方案)
5. [性能数据](#5-性能数据)
6. [安全策略与风险取舍](#6-安全策略与风险取舍)
7. [技术债务](#7-技术债务)
8. [演进计划](#8-演进计划)
9. [plan/ 方案文档索引](#9-plan-方案文档索引)
10. [推荐系统落地记录](#10-推荐系统落地记录推荐算法优化方案)
11. [Agent 3.0 正式发布门禁](#11-agent-30-正式发布门禁)

---

## 1. 系统架构

### 1.1 总体架构图

```
┌────────────────────────── 客户端 ──────────────────────────┐
│  网页端（React SPA）          安卓 APP（Capacitor 壳）        │
│  src/features/*：             加载远程站点 + 应用内更新条幅     │
│  home/discover/reader/        APK 经 GitHub Releases 与        │
│  studio/community/messages/   官网 /download/ 双通道分发        │
│  profile/search/admin                                          │
└───────────────┬──────────────────────────────────────────────┘
                │ HTTPS（nginx 443 ssl http2）
┌───────────────▼──────────────────────────────────────────────┐
│  nginx（TLS 终止 · 安全响应头 · gzip · 静态资源）              │
│  配置：deploy/nginx.chevoink.conf                              │
└───────┬──────────────────────────────┬───────────────────────┘
        │ 静态 dist/                    │ /api 反向代理
┌───────▼───────┐          ┌───────────▼────────────────────────┐
│  Vite 构建产物 │          │  Express 4（PM2: chevoink-api）     │
│  按路由分包    │          │  api/routes/*：16 个路由模块        │
└───────────────┘          │  auth/novels/comments/posts/topics/ │
                           │  conversations/users/home/search/   │
                           │  meta/ai/agent/admin                │
                           ├──────────────────────────────────────┤
                           │  api/lib/                            │
                           │  ├── data/      数据访问层           │
                           │  ├── agent/     写作 Agent 引擎      │
                           │  │   loop 调度内核 + run-service +   │
                           │  │   98 个工具 + 权限守卫 + Skill OS  │
                           │  └── auth-session / 限流 / 审计      │
                           └───────────────┬─────────────────────┘
                                           │ Prisma 6
                           ┌───────────────▼─────────────────────┐
                           │ PostgreSQL 16（85 张表 · 48 次迁移） │
                           └─────────────────────────────────────┘
```

### 1.2 前端结构（src/）

| 目录 | 职责 |
| --- | --- |
| `src/app` | 应用壳与路由 |
| `src/features/reader` | 书城书架、沉浸式阅读器、TTS 听书 |
| `src/features/studio` | 创作区：章节编辑器、AI 封面、Agent 面板（`agent/` 子域：agentStore + SSE 事件流 + 组件） |
| `src/features/community` / `messages` | 社区帖子话题、私信与在线状态 |
| `src/features/discover` / `home` / `search` / `novel-detail` / `profile` | 发现流、详情页、个人中心 |
| `src/features/admin` | 管理后台（数据看板、用户/作品/内容治理） |

前后端通过 `shared/contracts/` 共享类型契约（含 Agent SSE 事件、`TaskSpec` / `ChangeSet`、Story Compiler、Skill、质量评估与 Agent 3.0 评测契约），编译期即可发现接口失配。

### 1.3 后端结构（api/）

- **路由层** `api/routes/`：16 个路由模块，统一经 `parseBody` + zod schema 校验入参，统一 `{ success, data }` / `{ code, message }` 错误响应结构。
- **数据层** `api/lib/data/`：Prisma 访问封装，数据层兜底校验（如隐私级别 enum 兜底）。
- **Agent 引擎** `api/lib/agent/`（对应 `plan/10`、`plan/13` 方案）：
  - `loop.ts` 执行内核（executeAgentRun）+ `active-runs.ts` 运行登记表；
  - `run-service.ts` run 生命周期与会话 CRUD、`session-messages.ts` 消息/回滚、`plan-artifacts.ts` 计划工件；
  - `tools/`：98 个注册工具（见 [1.5](#15-agent-30-工具与运行管线98-个)），覆盖读写、调研、Skill、Story Compiler、质量治理、子 Agent、版本与定时任务；`governance.ts` 冻结每个工具的风险分类与后置条件；
  - `permissions.ts` 权限守卫与预算（ask_user 3 次 / 联网搜索 5 次 / 网页深读 8 次 / 站内搜索 5 次 / 站内深读 8 次每 run）；
  - `knowledge/` + `skills/`：写作知识与操作知识集（对应 `plan/14` 幻觉治理方案）。

### 1.4 Agent SSE 事件协议（shared/contracts/agent-events.ts）

run 执行期前后端通过 SSE 单向事件流通信，**live 与 replay 同源**：全部事件按 `seq` 持久化到 `AgentRunEvent` 表，断线重连用 `Last-Event-ID` 续传，刷新页面可完整回放。事件以 `{ seq, runId, ts }` 为公共头，共 13 种事件体：

| 事件 | 语义 |
| --- | --- |
| `run.started` | run 启动（Agent 摘要、执行模式、任务标题） |
| `message.start` | 助手消息开始 |
| `text.delta` / `reasoning.delta` | 正文 / 思考流式增量 |
| `tool.call` | 工具调用开始（含 `autoApproved` 标记是否自动批准） |
| `tool.delta` | 工具参数流式生成进度（如章节正文逐字产出） |
| `tool.result` | 工具调用结果（成功摘要 / 展示载荷 / 耗时） |
| `permission.ask` / `permission.resolved` | 审批请求与结果（高危操作禁止「总是允许」，带过期时间） |
| `step.finish` | 单轮结束（轮次号 + token 用量） |
| `run.paused` | 暂停（用户停止 / 审批超时） |
| `run.finished` | 结束（succeeded/failed/cancelled + 总用量 + 工件清单 + 输出摘要） |
| `error` | 可恢复性错误 |

前端消息分部模型 `AgentMessagePart`（text / reasoning / tool-call / attachment）由上述事件构建，写操作工具额外携带回滚快照（仅服务端持久化，消息列表接口返回前剥离），支撑「对话内一键回退」。

### 1.5 Agent 3.0 工具与运行管线（98 个）

工具注册表统一出口 `api/lib/agent/tools/registry.ts`。98 个工具按能力域组织，而不是把模型暴露给无边界的“万能写入”：

- **作品读写与版本**：作品/章节/计划、局部改写、导出、分支、回滚与 revision 冲突保护；
- **调研与附件**：站内检索、联网搜索与深读、图片理解、文档读取、Research Dossier；
- **Story Compiler**：创作宪章、读者承诺、场景任务、章节桥接、人物与关系记忆；
- **Skill OS 与文笔治理**：私有/共享技能的草稿、正负测试、发布、安装、确定性召回、Style DNA 与合法文笔库；
- **质量与评测**：质量报告、问题项、反馈、前三章试制、冻结场景评测与盲评候选；
- **自主协作**：待办、向用户提问、子 Agent、定时任务、权限沙箱与预算控制。

`name`、`description` 与参数 schema 是模型可见契约；任何改动都视为行为变更，并由治理完整性测试保证每个工具都有风险级别与后置条件。

一次 Agent 3.0 运行遵循固定管线：任务结构化 → 权限/预算过滤 → 作品上下文与技能确定性召回 → 研究/规划/写作工具执行 → revision 与回滚保护 → 质量门 → SSE 持久化与 Credits 记账。模型不能绕过服务端工具白名单直接修改正文。

### 1.5.1 作品技能与共享安装

- **跨端入口**：Work 检查器、Work 折叠轨、IDE 导航以及手机端“更多”共用同一个作品技能面板；加载骨架同步保留技能位，避免载入完成时导航跳动。
- **创建路径**：作者可在面板点击“新建”，或在对话里明确说“为我创建一个……技能”。Agent 仅把可长期复用的偏好保存为 `skill_create_draft` 私有关闭草稿；创建/修改后运行一条应命中和一条不应命中的确定性测试，`skill_publish` 必须经过作者本轮明确确认。
- **安装路径**：Agent 可先通过 `skill_shared_invites` 查看当前账号的待处理共享邀请，再在作者明确指定后经 `skill_install_shared` 安装到当前作品。安装会影响后续自动路由，因此工具始终逐次确认。
- **第三方边界**：任意 GitHub 或外部源码不能由 Agent 自动导入；UI 导入强制白名单许可证、归属说明与 `owner/repo@commit` 固定来源，随后仍需静态审计、正负测试和发布门。
- **运行态**：服务端以任务阶段、意图和触发/负触发短语确定性召回已启用技能；模型不需要在每轮自行扫描目录。前端工具历史采用单层 disclosure 行，运行时只显示细进度线、状态文字光泽和旋转状态标记，不使用整卡闪烁。

### 1.6 数据模型概览（prisma/schema.prisma）

85 张表，按域划分（以下列核心表，完整定义以 schema 为准）：

- **账号与额度**：User、SmsVerificationCode、AdminAuditLog、CreditAccount、CreditLedgerEntry、ReferralCode、ReferralRedemption、CreditSystemSetting、AiModelConfig
- **创作与阅读**：Novel、Chapter、CoverAsset、ReadingProgress、NovelRead、ParagraphUnderline、NovelFavorite
- **推荐**：RecommendationEvent
- **社区互动**：Post、Topic、PostTopic、PostLike、PostBookmark、Comment、CommentLike、UserFollow
- **私信**：Conversation、ConversationMember、Message
- **Agent 运行与协作**：AgentSession、AgentRun、AgentMessage、AgentRunEvent、AgentArtifact、ProjectMemoryEntry、AiUsageLog、StoryBranch、AgentSubtask、AgentSchedule、AgentEvalComparison
- **Agent 3.0 创作与技能**：StoryCharter、ReaderPromise、SceneTask、ChapterBridge、AgentSkillDefinition、AgentSkillVersion、AgentSkillInstallation、AgentSkillRun、ResearchDossier、StyleProfile、TechniqueCard、ChapterQualityReport、QualityFinding、CorpusSource、AgentEvalSuite、AgentEvalSample、AgentEvalCandidate

### 1.7 Credits、邀请与模型路由

- **精度与计费**：数据库统一存 milli-credit（1000 milli = 1 Credit），避免浮点累计误差。文本采用绑定池公式 `ceil(max(inputTokens, outputTokens × 10) × multiplierBps / 100000)` milli；因此 1 Credit 同时包含 10,000 输入 Token 与 1,000 输出 Token，按两者使用比例较大值计费，不做双重相加。生图和联网搜索分别按 6 / 2 Credits 固定扣费。
- **每日窗口**：公测日额度为 450 Credits，窗口在 UTC+8 15:00 滚动重置；邀请奖励存于 bonus balance，永不被日重置清空。跨日退款把旧窗口的日额度退款转入 bonus，防止 `dailyUsed` 变成负数。
- **并发与幂等**：扣费在 Serializable 事务中执行，每条调用使用唯一 `idempotencyKey`；冲突最多自动重试三次。固定价工具必须先有足额额度；文本调用在拿到 provider usage 后记账，余额不足时扣至零并停止后续 Agent 轮次。
- **邀请约束**：用户拥有唯一邀请码；注册与奖励写入同一事务。`ReferralRedemption.inviteeUserId` 唯一，确保只有新用户在首次注册时兑现一次，邀请人 +300、被邀请人 +120。
- **模型路由**：用户端只暴露档位名、倍率、视觉能力与支持的推理强度，不返回内置模型 ID；默认推理为 high，服务端逐模型校验。极速 / 标准 / 性能 / 极致分别为 1.0x / 1.1x / 1.8x / 4.8x，后三档必须同时具备模型 ID、Base URL 和加密 API Key 才可选。支持图片的主模型直接接收受管图片 `image_url`，纯文本模型自动走安全视觉旁路。关系网、导出等内部 AI 功能不继承用户高倍率选择，默认走极速。BYOK 自定义模型不消耗平台 Credits，但仍受全局暂停和账户封禁控制。
- **密钥安全**：内置与用户自定义 API Key 使用 AES-256-GCM 加密后落库；接口只返回 `apiKeyConfigured`，更新时空值代表保持原密钥，任何读取路径都不回显明文。生产环境使用独立 `MODEL_CONFIG_ENCRYPTION_KEY`。
- **入口与管理**：`/api/credits/*` 提供余额、账本、邀请和自定义模型；`/account/usage` 是当前唯一公开的账户子页。后台 Credits 操作采用验证码人机校验 + 确认词双门，支持单用户或批量重置、暂停和恢复，另保留全局暂停；Token 管理以 UTC+8 自然日/周/月聚合模型 Token 和固定价工具次数。

### 1.8 Agent 生产力与治理层

- **任务管理**：`AgentSession.pinnedAt/status` 支持置顶与归档；服务端按标题和作品名全文检索，可不传 `novelId` 获取跨作品最近任务。
- **版本分支**：`StoryBranch` 保存章节基线 revision、基线正文与分支正文。合并在事务内用 `updateMany(id + revision)` 乐观锁；冲突返回 409，不会覆盖源章节的新版本，同时按字数差原子更新作品统计。
- **专业子 Agent**：调研、一致性、质量、设定分别使用独立会话、独立 run 与工具白名单；用户设置的 Token 预算与全局预算取较小值，取消复用运行中止链路，轨迹复用持久化 SSE 回放。
- **长期任务**：`AgentSchedule` 持久化提示词、周期和下次运行时间；执行前以数据库条件锁抢占，同一到期任务不会被重复领取，执行冲突会延后重试。
- **权限沙箱**：会话保存网络、正文写入、批量改写、发布、破坏性操作五类策略及 read-only/workspace/full-access 档位；工具列表在服务端生成后再次过滤，`ask` 改写为运行时审批，`deny` 直接不向模型暴露。
- **回放评测**：`AgentEvalComparison` 固化 2–4 个真实 run 的模型档位、推理强度、Token、状态、耗时与摘要；详细轨迹仍读取同一 `AgentRunEvent` 流。

---

## 2. 关键技术决策

| 决策 | 结论 | 理由与依据 |
| --- | --- | --- |
| 前后端类型契约 | `shared/contracts/` 单一来源，双端同编译 | 消除接口字段漂移；Agent SSE 事件结构即在此定义（`plan/09`） |
| 入参校验 | 全端 zod schema + `parseBody` 统一解析；admin 登录保留手工三模式分支 | 手工分支为状态机校验，schema 化会复制分支并可能改变报错顺序，风险大于收益 |
| 会话方案 | HttpOnly Cookie 主通道 + Bearer 备选通道 | 安卓壳杀后台不掉登录（`plan/04` 三端适配） |
| 认证降级 | DB 故障时优先复用 ≤10 分钟历史会话状态（stale fallback），超窗才降级放行 | 可用性优先是既有设计基线；完全 fail-closed 会因 DB 抖动打挂全站登录态 |
| Agent 执行模式 | 默认最大权限自主执行（`AGENT_AUTO_APPROVE=true`） | 产品决策：零打扰创作流（README 卖点）；`false` 一键回退审批流，见 [第 6 节](#6-安全策略与风险取舍) |
| Agent 引擎 | 统一 loop 调度内核 + 工具注册表 + 事件流 | 对标 opencode 高保真复刻（`plan/11`），前端只消费标准事件流 |
| 章节并发控制 | `Chapter.revision` + `expectedRevision` 乐观锁；Agent 使用带版本条件的原子 updateMany | 防止网页、旧 APP、Agent 并发写入时静默覆盖；旧客户端缺省字段保持兼容但仍推进版本 |
| 事件流架构 | SSE 事件全量按 seq 持久化，live 与 replay 同源，Last-Event-ID 续传 | 断线/刷新不丢消息；历史回放与直播共用一条代码路径，消除双实现漂移 |
| API 响应结构 | 成功统一 `{ success, data }`，失败统一 `{ code, message }` 且必返 JSON | 前端错误处理单路径；校验文案逐字锚定于集成测试（p0/p1/p2-validation） |
| 幻觉治理 | 知识集（世界观/人物卡）+ Skill 注入 + 联网调研预算 | `plan/14`：先读事实再动笔，预算防跑飞 |
| 联网搜索 | 博查为主引擎的多级降级策略 | 单一引擎故障时自动切换，保证调研链路可用 |
| 图像理解 | 智谱 GLM-4.1V 视觉旁路 + 进程内并发信号量（默认 4） | 免费档并发 5，留 1 缓冲（`api/config/env.ts`） |
| Credits 账本 | milli-credit 整数账本 + Serializable 事务 + 幂等键 | 精确表达小额 Token 成本，并阻止并发重复扣费、重复邀请奖励与跨日退款负数 |
| 模型密钥 | AES-256-GCM 加密落库，只替换不回显 | 数据库泄露时不直接暴露供应商 API Key；独立主密钥便于运维轮换 |
| 大文件治理 | 模块级拆分只搬无状态/纯逻辑，tsc 全量为权威验证 | 本轮冲刺完成：run-service 1447→1043 行、write-tools 826→285 行、loop 903→837 行、AgentPanel 1096→1020 行 |
| 前端组件拆分纪律 | 无测试覆盖的组件本体一律不拆，仅抽模块级纯声明 | 任何 JSX 切割在无覆盖下都是回归风险；拆出的纯函数补护栏单测 |
| 一键导出 | 服务端零依赖 ZIP writer（store 不压缩）+ 番茄词表共享契约 | 不引入 jszip（产物纯文本为主，store 模式够用）；词表固化于 `shared/contracts/fanqie-tags.ts` 双端共用，AI 发布建议输出强制钳制到官方词表不自创标签；AI 不可用时降级文案不阻断导出 |

---

## 3. 测试与 CI 报告

### 3.1 测试矩阵（Vitest + Supertest）

当前共有 **63 个测试文件、339 个用例**。CI 提供 PostgreSQL 16，执行全部数据库集成组；无数据库的本地环境会自动跳过 DB 组。

| 层级 | 重点覆盖 |
| --- | --- |
| 契约与单元 | zod 输入契约、Agent SSE、98 工具治理、Skill/Story Compiler/质量门、Credits 整数账本与幂等 |
| API 集成 | 认证优先级、章节 revision 冲突、Agent 运行/回放、后台管理、额度与模型路由 |
| 前端 DOM 交互 | 正文输入不跳底且保留光标/滚动、聊天轨道最多 40 条并点击定位、预览文本截断、模型菜单层级、推理强度选择 |
| 安全配置 | nginx CSP 必须处于 enforce，禁止回退到 Report-Only；关键 script/connect/frame/base/form 边界静态校验 |
| Agent 3.0 冻结评测 | 24 个场景、6 个题材、9 类任务、12 个质量信号；数据集 Hash、代码 SHA 与版本号随 CI 工件保存 |

Vitest 使用 forks 池隔离进程内缓存；jsdom 仅用于关键 UI 回归，避免把全部测试拖入浏览器环境。测试环境守卫统一从仓库根目录解析 `tests/.env.test`。

### 3.2 CI 流水线（.github/workflows/ci.yml）

push main / PR 触发，单 job 串行执行：

```
postgres:16 服务容器 → npm ci → prisma generate → migrate deploy（测试库 chevoink_test）
→ npm run check（类型检查） → npm run lint → vitest run --coverage（覆盖率门禁）
→ npm run agent3:eval（上传可追溯 JSON 工件）→ npm run build
→ npm audit --omit=dev --audit-level=high
```

- CI 覆盖率基线门禁为 statements 18%、branches 59%、functions 35%、lines 18%；无数据库本地门禁为 10% / 59% / 15% / 10%。门禁先防倒退，再按关键模块增测逐步提高。
- 每次 CI 上传 `agent3-eval-<commit SHA>`，保留 30 天，避免评测只存在开发机或口头结论中。
- 生产依赖审计门禁为 high；截至 2026-09-02，`npm audit --omit=dev` 为 **0 漏洞**。

### 3.3 本地四重闸（每批改动纪律）

`npm run check` → `npm run lint` → `npx vitest run --coverage` → `npm run agent3:eval` → `npm run build` → `npm audit --omit=dev`。发布前还必须执行第 11 节的真实产品门禁；自动化全绿不等于留存与付费成立。

---

## 4. 部署方案

### 4.1 一键部署：`npm run deploy:prod`（scripts/deploy-production.ps1）

```
本地闸门：tsc 类型检查 → vitest 测试 → npm audit（high 以上即失败）→ vite 构建
打包 tar 白名单（排除 node_modules/dist/.git）→ SSH 就绪探测（重试 8 次）
scp 上传（失败降级 sftp，各重试 3 次）→ 远端解压至 /opt/chevoink/app/current
→ 执行 deploy/deploy-production.sh（npm ci --omit=dev、prisma migrate deploy、
   服务端构建、nginx 配置校验）→ PM2 reload chevoink-api
→ 健康检查 http://127.0.0.1:3001/api/health（重试 10 次）
→ 公网站点 HEAD 检查 → "Deployment finished successfully"
```

- PM2 配置：`ecosystem.config.cjs`；远端脚本：`deploy/deploy-production.sh`。
- 数据库迁移走 `prisma migrate deploy`（当前 48 次迁移）。
- 发布 Tag 与 APK：`scripts/push-to-github.ps1 -Tag vX.XX -ReleaseAsset <apk路径>`。

### 4.2 生产环境形态

| 项 | 现状 |
| --- | --- |
| 域名 | https://chevoink.chevolink.com |
| 反向代理 | nginx 1.24（443 ssl http2，Let's Encrypt 证书） |
| 应用进程 | PM2 fork 模式单实例 chevoink-api（监听 3001，仅接受 nginx 反代流量） |
| 数据库 | PostgreSQL 16（chevoink_prod） |
| 安卓端 | Capacitor 壳加载远程站点，启动时应用内检测更新 |

> 运维已知项：部署脚本覆盖服务器 nginx 配置会清掉 certbot SSL 配置导致 HTTPS 中断，改 nginx 配置必须同步维护证书段（历史事故沉淀）。

### 4.3 环境变量体系（.env.example）

全部配置经 `.env` 注入，按域分组（模板即权威清单）：

| 域 | 变量 | 说明 |
| --- | --- | --- |
| 应用 | `APP_NAME` / `APP_ENV` / `APP_PORT` / `APP_WEB_URL` / `APP_SERVER_URL` | 服务标识与跨域基址 |
| 数据库与会话 | `DATABASE_URL` / `AUTH_SESSION_SECRET` / `MODEL_CONFIG_ENCRYPTION_KEY` / `AUTH_COOKIE_DOMAIN` / `AUTH_COOKIE_SECURE` | Prisma 连接串、Cookie 会话签名与模型密钥加密主密钥 |
| 短信 | `SMS_TENCENT_*` + 发码策略（长度 6 / 有效期 300s / 冷却 60s / 小时限 5） | 腾讯云 SMS 登录验证码 |
| 文本生成 | `AI_TEXT_BASE_URL` / `AI_TEXT_API_KEY` / `AI_TEXT_MODEL` / `AI_TEXT_MAX_OUTPUT_TOKENS` | DeepSeek；单轮输出上限默认 8192 防长章截断 |
| Agent | `AI_AGENT_MODEL` / `AGENT_MAX_TURNS`（默认 100）/ `AGENT_RUN_TOKEN_BUDGET`（默认 200 万）/ `AGENT_AUTO_APPROVE` | 轮次与 token 预算配合上下文瘦身防爆窗 |
| 图像生成 | `AI_IMAGE_BASE_URL` / `AI_IMAGE_API_KEY` / `AI_IMAGE_MODEL` | OpenAI 兼容封面生成 |
| 视觉 | `AI_VISION_*`（超时 60s / 并发 4） | GLM-4.1V 旁路，未配置时工具回填观察不阻塞 run |
| 听书 | `TTS_PROVIDER`（edge / disabled）/ `TTS_DEFAULT_VOICE` / 缓存上限 2 GB | Edge TTS 免密钥 |
| 联网搜索 | `WEB_SEARCH_PROVIDER`（auto = 博查 → 搜狗 → Bing 降级）/ `WEB_READER_FALLBACK`（off/jina/firecrawl） | 深读 readability 主线 + 托管 Reader 兜底 |

---

## 5. 性能数据

### 5.1 生产构建体积（2026-08-16 实测，vite build）

| 产物 | 原始 | gzip |
| --- | --- | --- |
| 入口 `index.js` | 271.2 kB | 75.2 kB |
| 创作区 `StudioPage.js`（路由分包） | 261.3 kB | 64.7 kB |
| `react-vendor.js` | 173.8 kB | 57.5 kB |
| 阅读器 `ReaderPage.js` | 110.6 kB | 32.0 kB |
| 社区 `CommunityPage.js` | 20.3 kB | 6.7 kB |
| 主样式 `index.css` | 91.5 kB | 16.3 kB |

共 64 个产物、1998 个模块，按路由懒加载分包；构建耗时约 6~7 秒。

### 5.2 传输与加载优化

- nginx http2 多路复用 + gzip level 6（text/css、js、json、svg，≥1 KB 起压）；
- 静态资源文件名内容哈希（`Cache-Control` 长缓存），`index.html` no-cache 保证秒级发布；
- 全站加载性能与 Agent 执行期卡顿修复见 `plan/20`（相邻章分页预热、阅读进度离线缓存等机制已落地）。

### 5.3 测试执行性能

全量 63 个测试文件使用本地 forks 池并行执行；CI 额外包含 PostgreSQL 集成组、覆盖率、Agent 3.0 评测快照、构建与依赖审计，工作流超时上限为 20 分钟。

---

## 6. 安全策略与风险取舍

### 6.1 已实施的安全控制

| 层 | 控制 |
| --- | --- |
| 传输 | HTTPS 强制（HSTS max-age=31536000）；`X-Content-Type-Options: nosniff`；`X-Frame-Options: DENY`；CSP 已强制执行（`deploy/nginx.chevoink.conf`） |
| 会话 | HttpOnly Cookie + 签名会话；封禁与 tokenVersion 吊销实时比对（60s 缓存 + DB 故障 stale fallback ≤10 分钟）；封禁缓存主动驱逐 |
| 鉴权边界 | 所有写端点 401 优先于 400（未登录先拒，不泄露校验细节）；zod 校验统一文案 |
| 限流 | 短信发码 IP 双窗口（小时/天）；admin 登录 IP+账号双键失败锁定；TTS 合成同 IP 每分钟 20 次；限流 Map 超上限清空防无界增长 |
| 密钥 | 全部经 `.env` 注入（模板 `.env.example`）；`.env`、证书、密钥库均被 `.gitignore` 排除（`plan/08`） |
| Agent | 工具权限分级（读/写/危险）+ 会话级服务端沙箱；每 run/子 Agent 预算封顶（ask_user 3、联网搜索 5、网页深读 8、站内搜索 5、站内深读 8）；AiUsageLog 全量记录 token 消耗；AdminAuditLog 记录后台高危操作 |
| 额度与邀请 | 日重置由 `periodEndsAt <= now` 条件更新保证幂等；受邀用户唯一约束 + 注册奖励同事务 + 账本幂等键阻止刷新、重试或并发重复领取 |
| 模型密钥 | API Key 使用 AES-256-GCM 加密；普通接口只返回是否配置；`.env.example` 仅含占位符，不含真实密钥 |
| 依赖 | CI 与部署双闸门 `npm audit --omit=dev --audit-level=high`；当前 **0 漏洞** |

### 6.2 明确的风险取舍（书面记录）

1. **AGENT_AUTO_APPROVE 默认 true**（`api/config/env.ts`）
   - 取舍：零打扰自主创作是产品核心卖点（用户已确认的产品决策），改默认 false 违反功能基线。
   - 缓解：写类/危险类工具已做权限分级与 J 阶段高危工具审计；`AGENT_AUTO_APPROVE=false` 一键回退完整审批流；Agent 操作全量留痕（AgentRunEvent + AiUsageLog）。
2. **认证降级放行而非 fail-closed**
   - 取舍：DB 故障时拒绝所有会话会把全站登录态打挂，可用性损失大于吊销窗口风险。
   - 缓解：stale fallback 只在 ≤10 分钟窗口内复用历史成功状态，封禁/tokenVersion 照常比对；超窗才放行且打 `warnAuthDegrade` 日志。
3. **CSP 已由 Report-Only 转为 enforce**
   - 现状：脚本与 API 连接限制为同源；图片、媒体保留 HTTPS/data/blob 兼容范围；frame ancestors、base URI 与 form action 均锁定。
   - 后续：当前样式仍需 `unsafe-inline`；待样式体系支持 nonce/hash 后进一步收紧。
4. **admin 登录保留手工三模式分支校验**
   - 取舍：用户名/手机号/邮箱三模式是状态机校验，zod 化需 superRefine 复制分支且可能改变报错顺序，风险大于收益。

---

## 7. 技术债务

| 债务 | 现状 | 处置方向 |
| --- | --- | --- |
| 全仓覆盖率偏低 | CI 已锁住 18/59/35/18 基线，但语句/行覆盖仍不足以代表产品质量 | 优先覆盖 StudioWorkspace、AgentPanel、Credits 管理和支付前置链路，每次只上调不下调门禁 |
| CSP 仍可收紧 | 已 enforce，但样式兼容仍含 `unsafe-inline` | 将动态样式迁移到 nonce/hash 或静态 class 后移除 |
| 关键前端交互覆盖仍不完整 | P0 正文光标、轨道导航、菜单层级与推理选择已有 DOM 回归；大组件仍有大量状态组合未覆盖 | 补 Work/IDE 切换、面板拖拽折叠、归档/分支/定时任务与 Credits 后台 E2E |
| 真实产品指标未闭环 | 冻结评测可复现，但专家盲评、7/30 日留存、失败率与单位成本仍在近 200 人公测中采样 | 按第 11 节统一 cohort、版本与统计口径，达标前不宣称正式商业化完成 |
| 付费 Credits 商业链路待验收 | 整数账本、扣费、暂停/恢复与审计已存在；套餐、支付、订单、退款、发票与客服处置尚未形成完整验收证据 | 先做支付沙箱与对账演练，再灰度小额套餐，最后开放自动续费 |
| Prisma 配置迁移 | `package.json#prisma` 已废弃（Prisma 7 移除） | 升级到 `prisma.config.ts` |
| 部署打包白名单手工维护 | tar 白名单引用已删除文件曾导致打包失败（历史事故） | 新增顶层目录时同步核对 `deploy-production.ps1` 白名单 |

---

## 8. 演进计划

已完成的 1.0–2.0 方案包括三端适配、写作 Agent、创作区重构、Skill/知识集、发布链路、手机端、TTS、管理后台、推荐系统、安卓壳、沉浸阅读以及 Work/IDE 桌面重构（04–22）。`plan/23` 定义 Agent 3.0 中文网文人类化创作、Skill 生态及正式完成标准。

Agent 2.0 P0 工程基础（2026-08-25）已落地：

- 冻结 `TaskSpec`、`ChangeSet`、`Volume`、`MemoryEvidence` 的 zod 运行时契约与 TypeScript 类型；
- 新增章节 `revision` 迁移，Web 编辑器回传 `expectedRevision`，过期写入返回 409 且不覆盖新版本；旧 APP 保留兼容保存路径；
- Agent 章节读取基线由时间戳改为 revision，正文覆盖/追加/区间改写/重命名统一使用带版本条件的原子写入；
- 章节发布、插入移位、删除压缩与对话回滚同步推进 revision，并修复回滚中间插入章后的顺序空洞；
- 当时的 32 个 Agent 工具建立了风险分类与后置条件清单；Agent 3.0 已扩展到 98 个工具，并继续由同一治理测试覆盖。

Studio / Agent 2.0 桌面与记忆体验（2026-08-26）已落地：

- Work / IDE 命令栏只保留作品切换，章节层级回归编辑器标题区；正文改为边到边单层工作表面；
- Studio 使用独立的中性深浅色板，左右任务、作品、查看器与 Agent 区移除固定最大宽度，并支持拖至阈值自动折叠；
- 面板宽度采用“相邻区域联合预算”动态上限，IDE Agent 区与 Work 多栏不会再把内容撑出视口，窗口缩放时会自动收敛旧宽度；
- Work 右栏与移动端共用 React Flow 关系网；图谱空置且已有正文时才自动调用 low-reasoning AI，统一提取人物、地点、组织、物品、事件与概念；手动刷新设 10 分钟频控；
- 人物投影以人物卡为规范名锚点并使用非贪婪动作边界，自动清理旧规则产生的伪人物；新章默认跟随最后一个已有章节所在卷，避免落入后方预建空卷；
- 每轮 Agent 对话结束后按阈值自动压缩上下文；关系网已存在时直接复用，避免每个任务重复消耗 Token。

Agent 流式写入与用量治理（2026-08-30）已落地：最终答复与长文工具参数均通过 SSE 增量展示，工具写入期对应章节/计划为只读并可点击工具记录定位；管理后台以 `AiUsageLog` 为模型 Token 唯一计量源，支持用户排行、作品/会话/任务下钻及联网、生图次数统计。
- 2026-08-31 的 Agent 入口改为零作品也直接进入完整工作台：系统建立不会公开展示的占位作品，首轮提示驱动 Agent 使用 `novel_create` 原子动作完善作品；该动作同时校验用户与占位状态，普通作品无法重复调用。空任务统一使用带作品语境的随机建议，建议点击只写入草稿。首次创建收尾按实际缺项询问书名、简介、标签和封面，Work、IDE、手机共用同一空状态组件。
- Work 四区展开采用对话 / 查看器 / 作品检查区的响应式比例，查看器统一承载章节、目录与计划；默认比例收敛后仍允许用户继续拖拽自定义；
- 上下文页改为会话真实 token 窗口，展示占用率、自动压缩阈值、有效要求、检查点摘要与硬约束保留率，并提供空闲期手动压缩；
- 会话历史按“最新 500 条→时间正序”恢复，消息写入采用幂等 upsert 与三次短重试；前端记录已恢复会话，视图切换不再用旧历史响应覆盖直播末尾总结；
- Agent 输入框统一接收选择、剪贴板粘贴与拖放三类图片/文件入口，复用既有附件格式、数量与大小校验。

Agent 3.0（2026-09-02）已完成工程冻结并进入近 200 人公测：Story Compiler 将创作宪章、读者承诺、场景任务与章节桥接纳入可追踪工件；Skill OS 支持私有技能、共享邀请、确定性路由与正负测试；Research Dossier、Style DNA、合法文笔库和质量报告共同约束研究、风格与正文质量；子 Agent、版本分支和定时任务沿用统一权限、预算、SSE 与审计链路。自动化冻结评测已接入 CI，但专家盲评、相对 2.0 的真实质量提升、留存、成本和失败率仍按第 11 节验收。

P0 正式门禁仍需在真实模型与可用测试数据库环境执行每场景至少 5 次的 1.0 基准；结果缺失前不进入 P1，也不在文档中填入推测数据。

本轮工程冲刺（2026-08，85→90 分）新增沉淀：

- zod 校验收编全量覆盖写端点（文案逐字锚定于 `tests/integration/p2-validation.test.ts`）；
- 认证降级加固（stale fallback + 缓存容量上限 5000）；
- 后端三大文件模块级拆分（run-service / loop / write-tools）并补护栏单测；
- 前端 AgentPanel 模块级抽取（panel-helpers + ProcessingHint 独立成文件）；
- 创作区一键导出 zip（规划/目录/章节/作品信息以及发布建议四类内容可勾选、章节可逐章自选，发布建议由 AI 按番茄小说官方词表生成）与 Agent `novel_export` 工具（支持章节子集与排除规则）。

后续候选方向（按收益排序）：

1. 用真实盲评、留存、失败率和单位成本完成 Agent 3.0 产品门禁；
2. 扩大 Work/IDE、Credits 管理与付费链路的组件/E2E 覆盖并逐步抬高 CI 阈值；
3. CSP 去除 `unsafe-inline`，同时推进 Prisma 配置文件迁移；
4. 完成套餐、支付、订单、退款、对账与客服处置的沙箱演练；
5. 为公测增长准备 PM2 多实例/容器化、队列背压和模型供应商熔断预案。

---

## 9. plan/ 方案文档索引

`plan/` 目录为各阶段的**真实规划快照与当前实施方案**，编号即立项顺序；**同编号多篇 = 同一阶段并行推进的独立工作流**，非版本覆盖关系。`plan/00`–`plan/22` 已落地，`plan/23` 的工程项已冻结，真实产品指标仍在公测验收。

### 9.1 方案清单

| 文档 | 主题 | 状态 |
| --- | --- | --- |
| `plan/00` | 参考产品与市场调研 | 立项依据 |
| `plan/01` | 产品方案与 PRD | 已落地 |
| `plan/02` | 技术架构方案（架构设计、技术栈、路由、API、数据模型、三端策略） | 已落地（细节以本文档为准） |
| `plan/03` · `plan/05` | 品牌与界面规范 · UI/UX 设计规范 | 已落地 |
| `plan/04` | 三端适配与分阶段上线方案 | 已落地 |
| `plan/06` | 本地测试与并行协作规范 | 执行规范 |
| `plan/07` · `plan/08` | AI 配置安全与长上下文方案 · env 变量设计与密钥托管规范 | 已落地（env 清单见 [4.3](#43-环境变量体系envexample)） |
| `plan/09` | 数据模型与接口契约初稿 | 已落地（演进至 85 表，见 [1.6](#16-数据模型概览prismaschemaprisma)） |
| `plan/10` · `plan/11` | 写作 Agent 设计方案 · opencode Agent 高保真复刻专项 | 已落地（实现有演进，见 9.2） |
| `plan/12` · `plan/16` | 前端 UI/UX 产品级优化 · 手机端创作区深度优化 | 已落地（布局方案有演进，见 9.2） |
| `plan/13` | 创作区 Agent 深度重构与前端产品级优化 | 已落地（含后续 P3/P4 模块级拆分） |
| `plan/14` | Agent 幻觉治理与知识集/Skill 深度优化 | 已落地 |
| `plan/15` | 发布链路与 Agent 体验修复及全站加载优化 | 已落地 |
| `plan/17` | 阅读区听书功能（TTS 朗读） | 已落地 |
| `plan/18`（两篇） | 后台管理系统 · 社区推荐算法与话题系统升级 | 已落地 |
| `plan/19` | 安卓 APK 客户端打包（Capacitor 壳工程） | 已落地 |
| `plan/20`（三篇） | 全站加载性能与 Agent 执行期卡顿修复 · 手机端沉浸式阅读区重构 · 阅读区全屏沉浸（安卓壳安全区体系重构） | 已落地 |
| `plan/21` | 创作区与 Agent 2.0 企业级迭代方案 | 已落地，成为 3.0 的 revision/治理基础 |
| `plan/22` | 创作区桌面端 Work 与 IDE 深度重构方案 | 已落地 |
| `plan/23` | Agent 3.0 中文网文人类化创作与技能生态升级方案 | 工程冻结；真实盲评、留存、成本与失败率公测验收中 |
| `plan/list/` | 多窗口并行执行规范与总控审查清单 | 执行规范 |

### 9.2 历史路径对照（方案引用 → 当前实现）

方案撰写时引用的 16 处文件路径在后续重构中已迁移/合并，对照如下（2026-08-16 自动化校验结果，其余 156 处路径引用均与当前仓库一致）：

| 方案中的历史路径 | 当前实现 |
| --- | --- |
| `api/lib/agent-service.ts` | `api/lib/agent/loop.ts`（执行内核）+ `run-service.ts`（run 生命周期），plan/13 重构拆分 |
| `api/lib/agent-workspace-tools.ts` | `api/lib/agent/tools/` 九组文件（chapter/novel/write/read/cover/search/interact/todo/attachment） |
| `api/index.ts` | `api/server.ts`（启动）+ `api/app.ts`（Express 装配） |
| `src/features/studio/components/WritingAgentPanel.tsx` | `src/features/studio/agent/components/AgentPanel.tsx` |
| `src/features/studio/store/agentStore.ts` | `src/features/studio/agent/agentStore.ts` |
| `src/features/studio/layouts/StudioMobile/Tablet/Desktop.tsx` | 三文件布局方案未采用，终态为单一响应式 `StudioWorkspace.tsx`（移动端用 BottomSheet/抽屉自适应） |
| `src/features/reader/components/ReaderSettingsSheet.tsx` | `reader/components/ReaderSettingsContent.tsx` + `ReaderSettingsPopover.tsx` + `reader-settings.ts` |
| `src/features/reader/components/ParagraphComment.tsx` | 段落互动演进为划线体系：`useParagraphUnderlines.ts` + `ParagraphActionBar.tsx` |
| `src/features/reader/underlines.ts` | `src/features/reader/useParagraphUnderlines.ts` |
| `src/features/reader/tts/splitTtsBatches.ts` | 分批逻辑并入 `reader/tts/useTtsPlayer.ts` + `tts-api.ts` |
| `src/features/community/PostComposer.tsx` | `src/features/community/components/PostComposer.tsx` |
| `src/components/layout/MobileTabBar.tsx` | 底部导航并入 `components/layout/AppShell.tsx` + `device-context.ts` |
| `src/components/ui/UnderlineTabs.tsx` | `src/components/ui/SegmentedTabs.tsx` |
| `prisma/migrations/2026xxxx_admin_console/` | `prisma/migrations/20260812190000_admin_console/`（占位时间戳已落地为实际值） |

> 注：阅读区三端布局（`reader/layouts/ReaderMobile/Tablet/Desktop.tsx`）保留了三端拆分形态，与创作区的选择不同——阅读器交互差异大、创作区需要面板联动，属有意为之的架构差异。

---

## 10. 推荐系统落地记录（推荐算法优化方案）

对应外部方案 `docs/RECOMMENDATION-ALGORITHM.md`。可行性评估结论：**Phase 0（评分统一与版本化）与 Phase 1（行为事件采集 + 画像 + for-you 个性化）当前栈可直接落地，已实现；Phase 2（LightGBM 精排/向量召回）与 Phase 3（双塔/数仓）依赖数据规模与离线基建，按方案自身节奏延后**。

### 10.1 Phase 0：评分统一与版本化

- 评分纯函数唯一来源 `shared/recommend/scoring.ts`（hotScore/totalScore/周榜/日榜/更新度/篇幅分等），双端（客户端 `src/features/discover/ranking.ts`、`weekly-picks.ts`、`daily-picks.ts` 与服务端 `api/lib/data/home.ts`、`api/lib/data/novel.ts`）统一引用，消除权重漂移；
- 算法版本常量 `RECOMMEND_ALGORITHM_VERSIONS`（home `novel-home-v2` / related `related-v2` / forYou `for-you-v1` / weeklyPicks / dailyPicks），随响应下发（`HomePagePayload.algorithmVersion`、`NovelDetailPayload.relatedAlgorithmVersion`）供归因；
- 首页候选池修正：`最近更新 200 ∪ 历史热门 200` 双通道取并集去重，替代单一排序截断。

### 10.2 Phase 1：事件采集 → 画像 → for-you 个性化

- **事件表**：`recommendation_events`（迁移 `20260817120000_recommendation_events`），`eventId` 唯一幂等、`userId` 可空、只存行为元数据（surface/eventType/dwellMs/progressPercent/sessionId/algorithmVersion），索引 `(userId, createdAt)` 与 `(novelId, eventType)`；
- **事件上报**：`POST /api/recommendations/events` 批量 ≤50，`api/lib/recommendation/events.ts` 幂等入库；写入失败静默降级返回 `accepted: 0`，绝不阻塞阅读主流程；客户端 fire-and-forget（keepalive + catch 吞），dwellMs 上限 30 分钟；
- **用户画像**：`api/lib/recommendation/profile.ts`，interest = Σ weight × exp(-ageDays/30)，信号权重——完读 +6 / 进度≥80% +4 / 收藏 +5 / 关注作者 +4 / 开始阅读 +1 / 点击 +0.3 / dismiss·abandon -5（抑制）；回看窗口 90 天；
- **for-you 链路**：`api/lib/recommendation/for-you.ts` 召回 → 精排（0.45 interest + 0.15 author + 0.20 quality + 0.10 fresh + 0.10 explore，分量按候选集最大值归一）→ 重排（同作者 ≤2、同主标签连续 ≤2，不足时放宽补齐）→ 推荐理由（必须来自真实特征）；冷启动（无信号）降级为 0.8 quality + 0.2 fresh 且 `personalized: false`；
- **归因**：每次 for-you 响应返回 `sessionId`（randomUUID）与 `algorithmVersion`，曝光/点击/负反馈事件携带同会话键；
- **客户端接入**：`src/features/discover/useForYouRecommendations.ts`——服务端为唯一排序来源，失败回退本地 `buildRecommendedNovels` 保证可用；曝光按 `sessionId+作品集合` 去重批量上报；`DiscoverPage` 卡片展示推荐理由、「不感兴趣」本地立即移除并上报 dismiss。

### 10.3 阅读数读者数口径（viewCount UV 化）

对外「读者」指标由原始 PV（每次打开章节 +1）切换为 UV（一人一作品仅计一次），对齐微信读书/Wattpad 主流口径：

- 去重表 `novel_reads`（迁移 `20260817140000_novel_reads_uv`），`@@unique([userId, novelId])`；登录用户首次加载已发布章节时事务内 `createMany skipDuplicates`，仅首次 +1；
- 匿名阅读不计入读者数（登录态口径，书架/进度天然驱动登录转化）；草稿章不计；
- 历史数据回填：`reading_progress` 中 `chapter_id` 非空（实际打开过章节，排除仅加书架）按 用户×作品 去重回填，`view_count` 以 `novel_reads` 计数重新校准；
- 热度/榜单信号继续复用 `viewCount`（UV 天然防刷，权重不变）。

### 10.4 验收自检（对照方案 §13）

| 验收项 | 状态 |
| --- | --- |
| 双端评分一致（单一来源 + 版本常量） | ✅ |
| 事件幂等、失败不阻塞主流程 | ✅ |
| 冷启动降级与 personalized 标识 | ✅ |
| 推荐理由来自真实特征、无编造 | ✅ |
| 曝光/点击/负反馈上报闭环 | ✅ |
| 离线/线上评估指标（CTR/多样性等） | 待 Phase 2 数据积累后建立 |

---

## 11. Agent 3.0 正式发布门禁

“功能完成”“CI 全绿”“近 200 人参加公测”都不是独立的正式上线证明。正式版本与付费 Credits 套餐必须把工程、质量、用户价值、成本和商业链路分开验收。

| 门禁 | 2026-09-02 状态 | 正式放量要求 |
| --- | --- | --- |
| 工程可回归 | ✅ 已建立 | 63 个测试文件、339 个用例；覆盖率防倒退；CSP enforce；生产依赖审计；关键 UI 回归 |
| 冻结场景评测 | 🟡 框架与 CI 快照已建立 | 每个正式场景至少 5 次；冻结模型、温度、Skill/检索版本、代码 SHA 与 token；失败样本可追溯 |
| 专家盲评 | 🟡 后台能力具备，真实样本待完成 | 每篇至少 3 位目标题材读者/编辑；匿名比较 2.0、3.0 与人类样本；3.0 对 2.0 总体偏好胜率目标 ≥65% |
| 质量改善 | 🟡 公测采样中 | “明显 AI/机械”标记率相对下降目标 ≥40%；作者改到可发布的平均轮数目标下降 ≥35% |
| 留存与发布 | 🟡 近 200 人 cohort 可开始统计 | 首次创作后三章完成率目标提升 ≥25%；7 日继续创作率目标提升 ≥20%；同时跟踪章节发布率、更新发布率和周有效创作者 |
| 成本与可靠性 | 🟡 已有 Token/Credits 日志，预算线待冻结 | 按任务类型记录成功率、P95 延迟、输入/输出/缓存 token、单次与每千字成本、降级率；阈值达标后才开放全量高成本能力 |
| 版权与数据治理 | 🟡 权利记录、技法卡、撤权清理链路已实现 | 生产文档 100% 有来源/权利记录；版权泄漏阻断率 100%；确认侵权输出 0；用户可关闭、撤回并验证清理 |
| 付费 Credits | 🔴 不应直接全量售卖 | 套餐与价格审批、支付沙箱、订单幂等、回调验签、退款/拒付、对账、发票/客服、余额异常补偿和暂停恢复演练全部通过 |

公测统计必须固定 cohort 与版本：不要把新老用户、2.0/3.0、不同模型或不同赠送额度混在一个平均数里。建议先完成至少一个完整 7 日窗口，再决定是否扩大灰度；30 日留存只能在完整 30 日窗口后下结论。付费套餐采用“小额、限量、可人工退款”的灰度顺序，且账本总额必须能与支付渠道逐单对账。

Definition of Done 仍以 `plan/23` 为准：Skill 全链路可观测与可回滚、Story Charter/前三章试制、Chapter Bridge、证据化质量门、合法文笔库、冻结同题集与盲评胜出、真实留存改善、成本/延迟/失败率达标，以及全功能可灰度、可独立关闭、兼容旧作品与旧客户端。任何一项未完成，都应标记为“Agent 3.0 公测”，而不是“已验证的正式商业版本”。
