# 启创墨域 Chevoink 工程文档

> 本文档统一汇总系统架构、关键技术决策、测试与 CI、部署方案、性能数据、安全策略与风险取舍、技术债务及演进计划。
> 全部内容基于当前仓库代码与 `plan/` 目录内的真实方案文档，随工程演进持续更新。
> `plan/00`–`plan/20` 为已落地阶段的真实规划快照，`plan/21` 为当前 2.0 实施方案；历史路径与当前实现的对应关系见 [第 9 节](#9-plan-方案文档索引)。
>
> 最近更新：2026-08-26

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
│  按路由分包    │          │  api/routes/*：13 个路由模块        │
└───────────────┘          │  auth/novels/comments/posts/topics/ │
                           │  conversations/users/home/search/   │
                           │  meta/ai/agent/admin                │
                           ├──────────────────────────────────────┤
                           │  api/lib/                            │
                           │  ├── data/      数据访问层           │
                           │  ├── agent/     写作 Agent 引擎      │
                           │  │   loop 调度内核 + run-service +   │
                           │  │   32 个工具 + 权限守卫 + 知识集    │
                           │  └── auth-session / 限流 / 审计      │
                           └───────────────┬─────────────────────┘
                                           │ Prisma 6
                           ┌───────────────▼─────────────────────┐
                           │ PostgreSQL 16（29 张表 · 26 次迁移） │
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

前后端通过 `shared/contracts/` 共享类型契约（含 Agent SSE 事件结构以及 Agent 2.0 的 `TaskSpec`、`ChangeSet`、`Volume`、`MemoryEvidence` 冻结契约），编译期即可发现接口失配。

### 1.3 后端结构（api/）

- **路由层** `api/routes/`：13 个路由模块，统一经 `parseBody` + zod schema 校验入参，统一 `{ success, data }` / `{ code, message }` 错误响应结构。
- **数据层** `api/lib/data/`：Prisma 访问封装，数据层兜底校验（如隐私级别 enum 兜底）。
- **Agent 引擎** `api/lib/agent/`（对应 `plan/10`、`plan/13` 方案）：
  - `loop.ts` 执行内核（executeAgentRun）+ `active-runs.ts` 运行登记表；
  - `run-service.ts` run 生命周期与会话 CRUD、`session-messages.ts` 消息/回滚、`plan-artifacts.ts` 计划工件；
  - `tools/`：32 个注册工具（清单见 [1.5](#15-agent-工具清单32-个)），按依赖拆分为 chapter/novel/write/read/cover/search/platform/interact/todo/attachment/export 十一组文件；`governance.ts` 冻结每个工具的风险分类与后置条件；
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

### 1.5 Agent 工具清单（32 个）

| 分组 | 工具 | 说明 |
| --- | --- | --- |
| 读（5） | novelGetContext · chapterRead · chapterListSummaries · memorySearch · planRead | 作品上下文、章节内容、跨会话记忆、计划工件 |
| 调研（2） | webSearch · webRead | 博查为主的多级降级搜索；网页深读带 SSRF 防护 |
| 站内参考（2） | platformNovelSearch · platformNovelRead | 按书名/标签/题材关键词定位站内已上架作品与本人未公开作品；读介绍/分类/章节正文，可见性硬闸在 DB where 层；类似作品走特征词检索+简介对比，站内无果降级联网搜索 |
| 附件（2） | viewImage · readFile | GLM-4.1V 视觉旁路看图；pdf/docx/txt/md 读取 |
| 导出（1） | novelExport | 一键导出作品 zip（规划/目录/章节/作品信息以及发布建议），只读免审批；支持章节子集与四类内容裁剪；产物存内存仓库（TTL 15 分钟）供前端下载卡片拉取 |
| 章节写（5） | chapterCreate · chapterWrite · chapterAppend · chapterEditRange · chapterRename | revision 原子冲突检测 + 409 语义 + 回滚快照 |
| 作品管理（2） | novelRename · novelUpdateMeta | 书名与元信息更新 |
| 计划工件（3） | planSave · planRename · planDelete | 大纲计划的保存/重命名/删除 |
| 封面（3） | coverPromptSet · coverGenerate · coverApply | 提示词、生成、应用落盘 |
| 高危（3） | novelPublish · novelArchive · novelDelete | 发布/下架/删除，权限守卫最严级别 |
| 记忆与交互（3） | memorySave · todoWrite · askUser | 跨会话偏好记忆、待办自驱、向用户提问（每 run 3 次预算） |
| 收尾（1） | planExit | 退出计划编辑态 |

工具注册表统一出口 `api/lib/agent/tools/registry.ts`，name/description/参数 schema 逐字稳定（schema 即模型可见契约，改动等同行为变化）。

### 1.6 数据模型概览（prisma/schema.prisma）

29 张表，按域划分：

- **账号**：User、SmsVerificationCode、AdminAuditLog
- **创作与阅读**：Novel、Chapter、CoverAsset、ReadingProgress、NovelRead、ParagraphUnderline、NovelFavorite
- **推荐**：RecommendationEvent
- **社区互动**：Post、Topic、PostTopic、PostLike、PostBookmark、Comment、CommentLike、UserFollow
- **私信**：Conversation、ConversationMember、Message
- **Agent**：AgentSession、AgentRun、AgentMessage、AgentRunEvent、AgentArtifact、ProjectMemoryEntry、AiUsageLog

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
| 大文件治理 | 模块级拆分只搬无状态/纯逻辑，tsc 全量为权威验证 | 本轮冲刺完成：run-service 1447→1043 行、write-tools 826→285 行、loop 903→837 行、AgentPanel 1096→1020 行 |
| 前端组件拆分纪律 | 无测试覆盖的组件本体一律不拆，仅抽模块级纯声明 | 任何 JSX 切割在无覆盖下都是回归风险；拆出的纯函数补护栏单测 |
| 一键导出 | 服务端零依赖 ZIP writer（store 不压缩）+ 番茄词表共享契约 | 不引入 jszip（产物纯文本为主，store 模式够用）；词表固化于 `shared/contracts/fanqie-tags.ts` 双端共用，AI 发布建议输出强制钳制到官方词表不自创标签；AI 不可用时降级文案不阻断导出 |

---

## 3. 测试与 CI 报告

### 3.1 测试矩阵（Vitest + Supertest）

| 类别 | 文件 | 用例数 | 覆盖要点 |
| --- | --- | --- | --- |
| 单元 | studio-lib | 24 | 创作区表单/审查纯逻辑 |
| 单元 | auth-session | 14 | 会话状态缓存、封禁驱逐、stale fallback 三态、缓存容量上限 |
| 单元 | schemas | 9 | zod schema 正/反例 |
| 单元 | panel-helpers | 7 | AgentPanel 抽取的纯声明（阶段文案逐字锚定） |
| 单元 | phone / password | 6 / 6 | 手机号与密码规则 |
| 单元 | active-runs | 5 | Agent 运行登记表（注册/计数/停止） |
| 单元 | parse-body | 5 | 请求体解析与 400/401 边界 |
| 单元 | agent2-contracts / agent-baseline | 5 / 2 | TaskSpec/ChangeSet/Volume/MemoryEvidence 契约与 revision 基线隔离 |
| 单元 | agent-tool-governance / agent-eval-metrics | 3 / 2 | 32 工具治理完整性与统一评测汇总口径 |
| 集成 | p0/p1/p2-validation | 27 / 21 / 15 | 三代校验文案逐字对照（DB 组）+ 401 优先顺序（无 DB 组） |
| 集成 | app-smoke | 5 | 健康检查与基础路由冒烟 |
| 集成 | agent2-revision | 3 | 同版本并发仅一次成功、旧客户端兼容写入、过期删除阻断（需 DB） |

- 最近一次全量结果：**17 个测试文件，16 passed / 1 skipped；105 tests passed / 55 skipped**（skipped 为本地无 PostgreSQL 时 DB 组按 `describe.skipIf(!dbAvailable)` 自动跳过——clone 后 `npm test` 开箱即用；CI 带 postgres:16 服务容器则执行全部 DB 用例）。
- vitest 采用 forks 池：进程内缓存（封禁/令牌版本/限流 Map）互不串扰，也避免全局 PrismaClient 单例跨文件复用连接。

### 3.2 CI 流水线（.github/workflows/ci.yml）

push main / PR 触发，单 job 串行五关（超时 20 分钟）：

```
postgres:16 服务容器 → npm ci → prisma generate → migrate deploy（测试库 chevoink_test）
→ npm run check（类型检查） → npm run lint → vitest run --coverage → npm run build
→ npm audit --omit=dev --audit-level=high
```

- 覆盖率仅产出报告、暂不设阈值门禁（待真实基线锚定，见技术债务）。
- 最近四批冲刺提交（e5cae31 / 83a9bba / 598d575 / aff96dc）CI 结论均为 **success**。

### 3.3 本地四重闸（每批改动纪律）

`npx tsc --noEmit` → `npm test` → `npm run build` → `npm run lint`，lint 现态：0 错误、1 条存量 warning（StudioWorkspace react-hooks/exhaustive-deps，列入债务）。

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
- 数据库迁移走 `prisma migrate deploy`（当前 26 次迁移；本地新增迁移将在正式发布时随部署脚本应用）。
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
| 数据库与会话 | `DATABASE_URL` / `AUTH_SESSION_SECRET` / `AUTH_COOKIE_DOMAIN` / `AUTH_COOKIE_SECURE` | Prisma 连接串与 Cookie 会话签名 |
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

全量 17 个测试文件约 6–9 秒完成（本地 forks 池）；CI 含依赖安装与构建约 20 分钟内闭环。

---

## 6. 安全策略与风险取舍

### 6.1 已实施的安全控制

| 层 | 控制 |
| --- | --- |
| 传输 | HTTPS 强制（HSTS max-age=31536000）；`X-Content-Type-Options: nosniff`；`X-Frame-Options: DENY`；CSP Report-Only 全策略已就位（`deploy/nginx.chevoink.conf`） |
| 会话 | HttpOnly Cookie + 签名会话；封禁与 tokenVersion 吊销实时比对（60s 缓存 + DB 故障 stale fallback ≤10 分钟）；封禁缓存主动驱逐 |
| 鉴权边界 | 所有写端点 401 优先于 400（未登录先拒，不泄露校验细节）；zod 校验统一文案 |
| 限流 | 短信发码 IP 双窗口（小时/天）；admin 登录 IP+账号双键失败锁定；TTS 合成同 IP 每分钟 20 次；限流 Map 超上限清空防无界增长 |
| 密钥 | 全部经 `.env` 注入（模板 `.env.example`）；`.env`、证书、密钥库均被 `.gitignore` 排除（`plan/08`） |
| Agent | 工具权限分级（读/写/危险）；每 run 预算封顶（ask_user 3、联网搜索 5、网页深读 8、站内搜索 5、站内深读 8）；AiUsageLog 全量记录 token 消耗；AdminAuditLog 记录后台高危操作 |
| 依赖 | CI 与部署双闸门 `npm audit --omit=dev --audit-level=high`；当前 **0 漏洞** |

### 6.2 明确的风险取舍（书面记录）

1. **AGENT_AUTO_APPROVE 默认 true**（`api/config/env.ts`）
   - 取舍：零打扰自主创作是产品核心卖点（用户已确认的产品决策），改默认 false 违反功能基线。
   - 缓解：写类/危险类工具已做权限分级与 J 阶段高危工具审计；`AGENT_AUTO_APPROVE=false` 一键回退完整审批流；Agent 操作全量留痕（AgentRunEvent + AiUsageLog）。
2. **认证降级放行而非 fail-closed**
   - 取舍：DB 故障时拒绝所有会话会把全站登录态打挂，可用性损失大于吊销窗口风险。
   - 缓解：stale fallback 只在 ≤10 分钟窗口内复用历史成功状态，封禁/tokenVersion 照常比对；超窗才放行且打 `warnAuthDegrade` 日志。
3. **CSP 保持 Report-Only**
   - 取舍：第三方图片/媒体直链较多，enforce 模式可能误伤内容展示。
   - 缓解：Report-Only 持续收集违规报告，债务清单中推进转正。
4. **admin 登录保留手工三模式分支校验**
   - 取舍：用户名/手机号/邮箱三模式是状态机校验，zod 化需 superRefine 复制分支且可能改变报错顺序，风险大于收益。

---

## 7. 技术债务

| 债务 | 现状 | 处置方向 |
| --- | --- | --- |
| 覆盖率门禁缺失 | CI 只产出覆盖率报告；全仓口径基线偏低（测试集中于 api 校验/会话/Agent 核心与前端纯函数） | 先锚定核心模块（api/lib、shared/contracts）分模块阈值，再逐步收紧 |
| CSP 未转正 | Report-Only 运行中 | 清理违规源后切 enforce |
| 存量 lint warning | StudioWorkspace.tsx react-hooks/exhaustive-deps 1 条 | 涉及组件体改动，待前端测试覆盖补齐后处理 |
| 前端组件无测试覆盖 | 大组件（StudioWorkspace 4215 行、AgentPanel 1020 行）本体未拆 | 维持「只抽模块级纯声明」纪律；先补关键交互测试再议组件拆分 |
| Prisma 配置迁移 | `package.json#prisma` 已废弃（Prisma 7 移除） | 升级到 `prisma.config.ts` |
| 部署打包白名单手工维护 | tar 白名单引用已删除文件曾导致打包失败（历史事故） | 新增顶层目录时同步核对 `deploy-production.ps1` 白名单 |

---

## 8. 演进计划

已完成的 1.0 方案：三端适配与分阶段上线（04）、写作 Agent 与 opencode 高保真复刻（10/11）、创作区深度重构（13）、幻觉治理与知识集 Skill（14）、发布链路与全站加载优化（15）、手机端创作区（16）、TTS 听书（17）、后台管理系统与社区推荐算法升级（18）、安卓 APK 打包（19）、沉浸式阅读区与安全区重构（20）。`plan/21` 为当前 Agent/创作区 2.0 实施方案，不属于已落地历史方案。

Agent 2.0 P0 工程基础（2026-08-25）已落地：

- 冻结 `TaskSpec`、`ChangeSet`、`Volume`、`MemoryEvidence` 的 zod 运行时契约与 TypeScript 类型；
- 新增章节 `revision` 迁移，Web 编辑器回传 `expectedRevision`，过期写入返回 409 且不覆盖新版本；旧 APP 保留兼容保存路径；
- Agent 章节读取基线由时间戳改为 revision，正文覆盖/追加/区间改写/重命名统一使用带版本条件的原子写入；
- 章节发布、插入移位、删除压缩与对话回滚同步推进 revision，并修复回滚中间插入章后的顺序空洞；
- 32 个 Agent 工具建立可测试的风险分类与后置条件清单；建立七类核心 eval 与成功率、token、P95 延迟、回滚率统一汇总口径。

Studio / Agent 2.0 桌面与记忆体验（2026-08-26）已落地：

- Work / IDE 命令栏只保留作品切换，章节层级回归编辑器标题区；正文改为边到边单层工作表面；
- Studio 使用独立的中性深浅色板，左右任务、作品、查看器与 Agent 区移除固定最大宽度，并支持拖至阈值自动折叠；
- 面板宽度采用“相邻区域联合预算”动态上限，IDE Agent 区与 Work 多栏不会再把内容撑出视口，窗口缩放时会自动收敛旧宽度；
- Work 右栏直接承载基于 React Flow 的可拖拽、缩放、适配视口记忆图谱，移动端新增作品记忆视图；存量正文首次打开图谱时执行幂等的本地规则投影；
- 人物投影以人物卡为规范名锚点并使用非贪婪动作边界，自动清理旧规则产生的伪人物；新章默认跟随最后一个已有章节所在卷，避免落入后方预建空卷；
- 每轮 Agent 对话结束后按阈值自动压缩上下文，并按章节 revision 增量刷新记忆；正文投影不调用模型，版本缓存上限 500 部作品。
- Work 四区展开采用对话 / 查看器 / 作品检查区的响应式比例，查看器统一承载章节、目录与计划；默认比例收敛后仍允许用户继续拖拽自定义；
- 上下文页改为会话真实 token 窗口，展示占用率、自动压缩阈值、有效要求、检查点摘要与硬约束保留率，并提供空闲期手动压缩；
- 会话历史按“最新 500 条→时间正序”恢复，消息写入采用幂等 upsert 与三次短重试；前端记录已恢复会话，视图切换不再用旧历史响应覆盖直播末尾总结；
- Agent 输入框统一接收选择、剪贴板粘贴与拖放三类图片/文件入口，复用既有附件格式、数量与大小校验。

P0 正式门禁仍需在真实模型与可用测试数据库环境执行每场景至少 5 次的 1.0 基准；结果缺失前不进入 P1，也不在文档中填入推测数据。

本轮工程冲刺（2026-08，85→90 分）新增沉淀：

- zod 校验收编全量覆盖写端点（文案逐字锚定于 `tests/integration/p2-validation.test.ts`）；
- 认证降级加固（stale fallback + 缓存容量上限 5000）；
- 后端三大文件模块级拆分（run-service / loop / write-tools）并补护栏单测；
- 前端 AgentPanel 模块级抽取（panel-helpers + ProcessingHint 独立成文件）；
- 创作区一键导出 zip（规划/目录/章节/作品信息以及发布建议四类内容可勾选、章节可逐章自选，发布建议由 AI 按番茄小说官方词表生成）与 Agent `novel_export` 工具（支持章节子集与排除规则）。

后续候选方向（按收益排序）：

1. 核心模块覆盖率门禁落地（CI 阈值化）；
2. CSP 转正与违规源清理；
3. 前端关键交互测试补齐后，评估 StudioWorkspace / AgentPanel 组件级拆分；
4. Prisma 配置文件迁移；
5. 单机 PM2 → 多实例/容器化的水平扩展预案（当前单实例承载良好，暂不紧急）。

---

## 9. plan/ 方案文档索引

`plan/` 目录为各阶段的**真实规划快照与当前实施方案**，编号即立项顺序；**同编号多篇 = 同一阶段并行推进的独立工作流**（如 18 号后台管理与社区升级并行、20 号三篇性能/阅读区并行），非版本覆盖关系。`plan/00`–`plan/20` 已落地，`plan/21` 正在按 P0→P7 门禁实施。

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
| `plan/09` | 数据模型与接口契约初稿 | 已落地（演进至 29 表，见 [1.6](#16-数据模型概览prismaschemaprisma)） |
| `plan/10` · `plan/11` | 写作 Agent 设计方案 · opencode Agent 高保真复刻专项 | 已落地（实现有演进，见 9.2） |
| `plan/12` · `plan/16` | 前端 UI/UX 产品级优化 · 手机端创作区深度优化 | 已落地（布局方案有演进，见 9.2） |
| `plan/13` | 创作区 Agent 深度重构与前端产品级优化 | 已落地（含后续 P3/P4 模块级拆分） |
| `plan/14` | Agent 幻觉治理与知识集/Skill 深度优化 | 已落地 |
| `plan/15` | 发布链路与 Agent 体验修复及全站加载优化 | 已落地 |
| `plan/17` | 阅读区听书功能（TTS 朗读） | 已落地 |
| `plan/18`（两篇） | 后台管理系统 · 社区推荐算法与话题系统升级 | 已落地 |
| `plan/19` | 安卓 APK 客户端打包（Capacitor 壳工程） | 已落地 |
| `plan/20`（三篇） | 全站加载性能与 Agent 执行期卡顿修复 · 手机端沉浸式阅读区重构 · 阅读区全屏沉浸（安卓壳安全区体系重构） | 已落地 |
| `plan/21` | 创作区与 Agent 2.0 企业级迭代方案 | 实施中（P0 工程基础完成，实测基线待跑） |
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
