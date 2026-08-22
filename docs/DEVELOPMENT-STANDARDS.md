# 启创墨域 Chevoink 开发规范（Development Standards）

> **定位**：本规范从本项目全程实战（含 85→90 分工程与安全冲刺）提炼而来，是**强制约束**而非建议。
> 为当前项目开发新功能、或启动新产品时，均须遵循；与 [ENGINEERING.md](./ENGINEERING.md)（工程现状描述）互补——本文档回答「必须怎么做」，ENGINEERING 回答「现在是什么」。
> 每条规范尽量锚定仓库真实文件与数字；规范冲突时以第 1 章铁律为最高优先级。
>
> 版本：v1.0（2026-08-16）· 维护方式：每轮工程冲刺后回写新沉淀，保持与代码同步
>
> 语言：简体中文 | [English](./DEVELOPMENT-STANDARDS.en.md)

## 目录

1. [总纲：十条铁律](#1-总纲十条铁律)
2. [工作流规范](#2-工作流规范)
3. [架构规范](#3-架构规范)
4. [后端 API 规范](#4-后端-api-规范)
5. [前端规范](#5-前端规范)
6. [Agent / AI 工程规范](#6-agent--ai-工程规范)
7. [数据库规范](#7-数据库规范)
8. [测试规范](#8-测试规范)
9. [CI/CD 与部署规范](#9-cicd-与部署规范)
10. [安全规范](#10-安全规范)
11. [性能规范（预算制）](#11-性能规范预算制)
12. [文档规范](#12-文档规范)
13. [陷阱清单（真实事故沉淀）](#13-陷阱清单真实事故沉淀)
14. [检查清单（可直接执行）](#14-检查清单可直接执行)

---

## 1. 总纲：十条铁律

适用范围：一切代码改动，无例外。

| # | 铁律 | 要点 |
| --- | --- | --- |
| 1 | **功能与界面零变化是重构的最高约束** | 400 文案逐字一致、状态码顺序不变（401 优先于 400）、UI 不触碰；任何「顺手优化」都须单独立批 |
| 2 | **tsc 全量为权威验证** | `npx tsc --noEmit` 0 错才算通过；IDE/LSP 增量提示在重构中间态会误报（「模块没有导出的成员」等），只作参考 |
| 3 | **每批改动过四重闸** | `tsc --noEmit` → `npm test` → `npm run build` → `npm run lint`，全绿才可提交 |
| 4 | **一批一 commit，可单批回退** | 一行简洁中文（`type: 主题`）；push 触发 CI，批次间相互独立，失败单批 `git revert` |
| 5 | **生产部署只走一条路** | `npm run deploy:prod`；以脚本输出 `Deployment finished successfully` 为准，任何中途报错即失败 |
| 6 | **密钥永不入库** | `.env` / `cert/` / `*.pem` / `*.keystore` / `*.apk` 由 `.gitignore` 排除；新目录入库前先做密钥扫描（见 [10.3](#10-安全规范)） |
| 7 | **测试库守卫不可绕过** | `DATABASE_URL` 库名必须含 `test`（`tests/setup.ts` 启动即校验，违者抛错拒跑） |
| 8 | **拆分只搬无状态/纯逻辑** | 组件本体在无测试覆盖前一律不拆；可搬的模块级声明搬后必须同批补护栏单测 |
| 9 | **历史文档不追溯修改** | `plan/` 等规划快照保留原貌；实现演进用对照表导航（见 ENGINEERING.md §9.2） |
| 10 | **部署后的验收归用户** | 助手不自行抓取/浏览线上页面验证内容；只保证闸门全绿与脚本成功退出，如实汇报 |

---

## 2. 工作流规范

适用范围：从立项到上线的全过程组织方式。

### 2.1 先 plan 后编码

- 中大型改动必须先产出方案文档再动手，沉淀于 `plan/`：编号 = 立项顺序，**同编号多篇 = 同阶段并行工作流**（非版本覆盖）。
- 计划必须包含：硬约束清单、批次划分、依赖关系、**明确的「不做清单」**、风险与对策、Rejected Alternatives。
- 「不做清单」要书面化理由。实例：admin `/auth/login` 不做 zod 化——三模式互斥分支是状态机校验，schema 化需 superRefine 复制分支且可能改变报错顺序，风险大于收益。

### 2.2 批次纪律

| 规则 | 要求 |
| --- | --- |
| 粒度 | 每批独立可回退；批间相互独立可乱序执行 |
| 闸门 | 每批四重闸全绿（铁律 3） |
| 提交 | 每批一个 commit，一行简洁中文：`feat: 残余写接口 zod 收编收尾`、`refactor: 后端三大文件模块级拆分并补护栏单测` |
| 验证 | push 后查 GitHub Actions runs 状态，全绿才进下一批 |
| 部署 | 多批零行为改动**合并到末批统一部署**，减少生产扰动 |

### 2.3 改动前侦察

- 动手前先读目标端点/组件的**现有分支与文案**，禁止凭记忆改写；文案逐字复制。
- 大文件先枚举顶层声明再决定搬什么（脚本枚举优于肉眼）。
- 消费者全量盘点：改动导出结构前 grep 全部 import 方，避免运行期断链。

---

## 3. 架构规范

适用范围：所有新增代码的落位与模块边界决策。

### 3.1 分层与目录职责

| 层 | 目录 | 职责边界 |
| --- | --- | --- |
| 路由层 | `api/routes/*.ts` | 薄路由：会话校验 → 参数校验 → 调数据/业务层 → 组装响应；禁止直写复杂 SQL 逻辑 |
| 数据层 | `api/lib/data/*.ts` | Prisma 访问封装 + 数据层兜底校验 |
| 业务域 | `api/lib/agent/` 等 | 有状态引擎按域聚合成目录（loop 内核/工具/权限/知识集） |
| 契约层 | `shared/contracts/` | 前后端共享类型的**单一来源**；SSE 事件、请求/响应结构都在此定义 |
| 前端壳 | `src/app` | 路由与应用壳 |
| 前端域 | `src/features/<域>/` | 业务域闭环：components / lib（纯逻辑）/ api / store |
| 通用件 | `src/components/` | 跨域复用 UI（ui/ 基础件、layout/ 布局） |

### 3.2 文件规模红线与拆分纪律

| 规则 | 数值/做法 |
| --- | --- |
| 红线 | 单文件 > 800 行即评估拆分 |
| 只搬 | 模块级无状态声明/纯函数；行为等价逐字保留（含注释与文案） |
| 对账 | 拆分后 grep 全仓确认旧 import 清零 |
| 验证 | tsc 全量为权威（铁律 2）；消费者编译通过即出口验证 |
| 护栏 | 拆出的纯逻辑同批补单测（铁律 8） |
| 战果参照 | run-service 1447→1043、loop 903→837、write-tools 826→285、AgentPanel 1096→1020 |

### 3.3 模块出口规范

- 工具/插件式集合用**注册表统一出口**（模板：`api/lib/agent/tools/registry.ts`），消费者只依赖注册表不依赖具体实现文件。
- 类型声明与实现分文件（契约归 `shared/contracts`，工具类型归 `tools/types.ts`）。
- 前端组件与工具函数分文件：混放会触发 react-refresh 警告并破坏热更新（实例：`panel-helpers.tsx` 纯函数与 `ProcessingHint.tsx` 组件分离）。

### 3.4 新功能落位决策树

```
新需求到来
├─ 涉及前后端数据交换？ → 先在 shared/contracts 增类型（契约先行）
├─ 纯后端能力？ → api/routes 加端点 + api/lib(/data) 加实现
├─ 纯前端能力？ → 归属到 src/features/<域>/；跨域才进 src/components
├─ Agent 新工具？ → api/lib/agent/tools/<分组>.ts 实现 + registry 注册（见第 6 章）
└─ 新配置项？ → api/config/env.ts 加解析 + .env.example 加模板与注释
```

---

## 4. 后端 API 规范

适用范围：`api/routes/*` 与 `api/lib/*` 的一切新增端点。

### 4.1 响应结构（强制）

| 场景 | 结构 | 依据 |
| --- | --- | --- |
| 成功 | `{ success: true, data: {...} }` | `api/app.ts` `/api/health` 模板 |
| 失败 | `{ success: false, error: { code, message } }`，必返 JSON | `api/app.ts` 500/404 兜底 |
| 未捕获异常 | 500 + `INTERNAL_SERVER_ERROR` + 固定文案「服务暂时不可用，请稍后重试。」；内部细节只落 `console.error('[unhandled]', ...)` 日志，**不回传客户端** | `api/app.ts` 错误中间件 |

### 4.2 参数校验（强制）

- 一律走 `parseBody(schema, body, fallbackMessage)`（`api/lib/parse-body.ts`）：失败抛 `DataAccessError(400, 'VALIDATION_ERROR', 文案)`。
- **位置规则**：parseBody 必须放在 try 内、`requireSessionUserId` 等会话校验**之后**——保证 401 优先于 400，未登录不泄露校验细节。
- 非空字符串统一用 `nonEmptyText` 模式：`z.string().refine(v => v.trim().length > 0)`，与原手工 `.trim()` 判定语义对齐。
- 可选字段用 `.optional()` 宽松匹配，空 body 场景按现状语义放行（实例：privacy 空 body 返回当前值）。

### 4.3 文案与状态码

| 规则 | 要求 |
| --- | --- |
| 400 文案 | 逐字稳定，新增/修改必须同步锚定集成测试（`tests/integration/p*-validation.test.ts` 的 it.each 逐字对照模式） |
| 状态码顺序 | 未登录 401 → 无权限 403 → 校验 400 → 资源不存在 404，先决条件先报 |
| 多条校验合并 | 原逻辑合并判定（如 `!content?.trim() || !type`）收编后仍共用一条文案，不拆 |

### 4.4 限流与进程内 Map

凡进程内 Map（限流、缓存、登记表）**必须**：

1. 按真实维度分桶：`trust proxy 1` 后取 `req.ip`（nginx 单跳反代，X-Forwarded-For 首值）；
2. 配容量上限防无界增长（超限淘汰最旧或整表重置，实例：限流 Map 超 2000 key 清空、会话状态缓存上限 5000 条淘汰最旧 `checkedAt`）；
3. 双窗口策略用于发码类（小时 + 天，实例：`api/routes/auth.ts` 发码限流）。

### 4.5 中间件顺序（api/app.ts 基线）

cors（origin 白名单 + credentials）→ trust proxy → body 解析（limit 40mb，发帖 9 图 base64 实测需求）→ uploads 静态（30d immutable）→ 会话统一闸口（异常放行：闸口自身故障不打挂全站）→ 业务路由 → health → 500/404 兜底。新增中间件不得破坏该顺序语义。

---

## 5. 前端规范

适用范围：`src/**` 一切改动。

### 5.1 类型基线（不可回退）

`tsconfig.json` 已全开：`strict` + `noUnusedLocals` + `noUnusedParameters` + `noFallthroughCasesInSwitch`。禁止为绕过报错而放宽配置；未用变量用 `_` 前缀（eslint `no-unused-vars` error 级，`^_` 豁免）。

### 5.2 组件纪律

| 规则 | 说明 |
| --- | --- |
| 组件本体不拆 | 无测试覆盖的大组件（StudioWorkspace 4167 行等）维持整体，任何 JSX 切割都是回归赌博 |
| 模块级抽取 | 仅抽顶层纯函数/常量/独立小组件，逐字保留；引用方改 import，diff 可逐行对照 |
| 抽取必补测试 | 抽出的纯函数同批补护栏单测（模板：`tests/unit/panel-helpers.test.ts`，文案映射用 toEqual 逐字锚定） |
| 文件职责单一 | 组件文件只导出组件；工具函数另立文件（react-refresh/only-export-components） |

### 5.3 状态与数据

- **zustand** 存运行态/交互态（如 `agentStore` 的 runId/phase/messages）；**React Query** 存服务端态（queryKey 复用共享缓存，实例：`['community','me']` 三处共享）。
- 别名一致性：tsconfig `paths` 与 `vitest.config.ts` 的 `resolve.alias` 必须同步维护 `@/*`（否则单测解析断裂）。

### 5.4 复用既有资产（先查再造）

| 需求 | 既有资产 |
| --- | --- |
| 类名合并 | `cn`（`src/lib/utils`） |
| 移动端弹层 | `BottomSheet`；确认框 `ConfirmDialog`；骨架屏 `Skeleton` |
| 软键盘避让 | 三路信号架构 + 700ms 无信号兜底（按屏高 55% 估计），勿自行监听 resize |
| 剪贴板 | `copyToClipboard`（navigator.clipboard 主路径 + execCommand 降级） |
| 设备适配 | `device-context` / DeviceProvider，阅读器三端布局在 `reader/layouts/` |

---

## 6. Agent / AI 工程规范

适用范围：`api/lib/agent/**` 与一切 LLM/工具链改动。

### 6.1 工具契约稳定性（最高优先级）

工具的 `name` / `description` / 参数 schema 是**模型可见契约**：逐字改动等同行为变化，须按功能变更走批次与文案锚定，不得在重构中顺手修改。

### 6.2 权限与预算

| 项 | 现行值 | 依据 |
| --- | --- | --- |
| 权限分级 | 读 / 写 / 危险三级（`WRITE_PERMISSION` / `DANGEROUS_PERMISSION`） | `api/lib/agent/permissions.ts`、chapter-tools/novel-tools |
| 高危操作 | 发布/删除/下架：permission.ask 中 `allowAlways: false`，禁止「总是允许」 | `shared/contracts/agent-events.ts` |
| ask_user 预算 | 每 run 3 次 | permissions.ts `ASK_USER_BUDGET_PER_RUN` |
| 联网搜索预算 | 每 run 5 次 | `WEB_SEARCH_BUDGET_PER_RUN` |
| 网页深读预算 | 每 run 8 次 | `WEB_READ_BUDGET_PER_RUN` |
| 轮次/token | `AGENT_MAX_TURNS` 默认 100；`AGENT_RUN_TOKEN_BUDGET` 默认 200 万，配合上下文瘦身防爆窗 | `api/config/env.ts` |
| 自动批准 | `AGENT_AUTO_APPROVE` 默认 true（产品决策）；`false` 一键回退审批流——改默认值属功能变更，须立项 | `api/config/env.ts` |

### 6.3 事件流架构（不可变契约）

- 全部 SSE 事件按 `seq` 持久化到 `AgentRunEvent`，live 与 replay 同源；断线用 `Last-Event-ID` 续传。
- 新增事件类型必须走 additive union（旧消息/旧客户端安全跳过），并同步 `shared/contracts/agent-events.ts`。
- 写操作的回滚快照仅服务端持久化，消息列表接口返回前剥离，不得下发前端。

### 6.4 外部依赖降级模板

| 场景 | 规范做法 | 实例 |
| --- | --- | --- |
| AI 服务未配置/失败 | 工具回填「服务未配置」观察结果，**不阻塞 run** | view_image 视觉旁路 |
| 搜索引擎故障 | 多级降级链（博查 → 搜狗 → Bing），可 disabled | `WEB_SEARCH_PROVIDER=auto` |
| DB 故障 | stale fallback：复用 ≤10 分钟历史成功状态（封禁/tokenVersion 照常比对），超窗才降级放行；禁止 fail-closed | `api/lib/auth-session.ts` |
| 闸口自身异常 | 放行 + 下游退回本地验签，管理功能故障不打挂全站 | `api/app.ts` 会话闸口 |

---

## 7. 数据库规范

适用范围：`prisma/schema.prisma`、迁移与数据访问代码。

| 规则 | 要求 | 依据 |
| --- | --- | --- |
| 迁移纪律 | 一律 `prisma migrate deploy`（幂等）；上线前确认 `No pending migrations`；禁止手改已发布迁移 | 部署脚本远端步骤 |
| 迁移命名 | `YYYYMMDDHHMMSS_主题`（小写下划线），如 `20260812190000_admin_console` | `prisma/migrations/` |
| 索引意识 | 列表/排序查询的 where + orderBy 字段建复合索引；大表先行 | `20260815120000_add_list_indexes` |
| 双保险校验 | 枚举类字段：路由 zod 校验 + 数据层兜底（防绕过路由直调） | `api/lib/data/user.ts` privacy 兜底 |
| 吊销机制 | 需要即时失效的会话类数据用版本号字段（`tokenVersion`），缓存比对版本号 | `20260815130000_add_user_token_version` |
| 测试库 | 库名含 `test`（铁律 7）；迁移与集成测试共用同一测试库 | `tests/setup.ts` |

---

## 8. 测试规范

适用范围：`tests/**`；一切新增逻辑的验证义务。

### 8.1 组织与命名

| 目录 | 职责 | 现状基线 |
| --- | --- | --- |
| `tests/unit/*.test.ts` | 纯逻辑单测（可 mock prisma） | 8 文件 76 例（studio-lib 24 / auth-session 14 / schemas 9 / panel-helpers 7 / phone 6 / password 6 / active-runs 5 / parse-body 5） |
| `tests/integration/*.test.ts` | supertest 打真实 Express app；DB 组走测试库 | 4 文件 68 例（p0 27 / p1 21 / p2 15 / app-smoke 5） |

### 8.2 强制模式

| 模式 | 做法 |
| --- | --- |
| 开箱即用 | 无 DB 环境纯单测全绿；DB 组 `describe.skipIf(!dbAvailable)` 自动降级；`tests/.env.test` 缺失时就地注入最小环境 |
| 文案锚定 | 校验类端点必须有逐字文案对照测试：`it.each` cases 数组 + 断言 `status 400 + code VALIDATION_ERROR + message 逐字`，并配「不误拒例」（合法请求 200/404） |
| 401 顺序 | 未登录用例独立成组（无需 DB），断言 401 先于一切校验 |
| mock prisma | `vi.mock('../../api/lib/prisma.js', ...)` 返回桩对象；时间敏感用 `vi.useFakeTimers()` + `vi.setSystemTime()`，afterEach `vi.useRealTimers()` |
| 进程隔离 | vitest `pool: 'forks'`：进程内缓存互不串扰；禁止改回 threads |
| 护栏义务 | 任何模块级拆分/抽取必须**同批**补护栏单测（铁律 8）；文案映射用 `toEqual` 全量锚定 |
| 测试数据 | 注册类用例用可复现的伪随机（如 `+861398${Date.now().toString().slice(-7)}`），不依赖既有数据 |

---

## 9. CI/CD 与部署规范

适用范围：`.github/workflows/ci.yml`、`scripts/deploy-production.ps1`、`deploy/*`。

### 9.1 CI 五关（顺序不可乱）

```
postgres:16 服务容器（chevoink_test）→ npm ci → prisma generate → migrate deploy
→ npm run check → npm run lint → vitest run --coverage → npm run build
→ npm audit --omit=dev --audit-level=high
```

- 覆盖率只产报告不设阈值（待基线锚定）；`concurrency` 取消旧 run 防堆积。
- 触发：push main / PR；任何一关红即阻断合并。

### 9.2 部署链路（deploy:prod）

本地闸门（check → test → audit → build）→ tar 白名单打包（排除 node_modules/dist/.git）→ SSH 就绪探测重试 8 次 → scp 上传失败降级 sftp（各重试 3 次）→ 远端解压 `/opt/chevoink/app/current` → `deploy/deploy-production.sh`（npm ci --omit=dev、migrate deploy、服务端构建、nginx 配置校验）→ PM2 reload → 健康检查 `/api/health` 重试 10 次 → 公网 HEAD 检查 → `Deployment finished successfully`。

### 9.3 运维红线

| 红线 | 后果与规避 |
| --- | --- |
| 改 nginx 配置必须保留 certbot SSL 段 | 部署脚本覆盖配置曾清掉证书导致 HTTPS 中断；改动前先备份原文件比对 |
| tar 白名单手工维护 | 新增顶层目录必须同步 `deploy-production.ps1` 白名单；引用已删文件会打包失败 |
| 部署判定以脚本退出为准 | 脚本末尾个别 curl 偶发失败为已知现象，以 `Deployment finished successfully` 为唯一成功标志 |
| 零行为变化多批合并部署 | 减少生产扰动；功能变化类改动单独部署单独验收 |

---

## 10. 安全规范

适用范围：一切涉及鉴权、密钥、外部输入的代码。

### 10.1 会话与鉴权

- HttpOnly Cookie 主通道 + Bearer 备选（安卓壳杀后台不掉登录）；Cookie 参数经 `AUTH_COOKIE_*` 环境化。
- 会话状态三级保障：60s TTL 缓存 → DB 实时查询 → DB 故障 stale fallback（≤10 分钟，封禁与 tokenVersion 照常比对）；超窗降级放行并打 `warnAuthDegrade` 日志。
- 封禁即时性：封禁缓存主动驱逐（`evictUserBanCache`），不允许等 TTL 自然过期。
- 端点先决顺序：401 → 403 → 400 → 404（见 4.3）。

### 10.2 响应头基线（deploy/nginx.chevoink.conf）

HSTS `max-age=31536000` · `X-Content-Type-Options: nosniff` · `X-Frame-Options: DENY` · CSP Report-Only 全策略。注意 nginx `add_header` 不跨级继承：任何带 add_header 的 location 必须重复整套头。

### 10.3 密钥管理

- `.env.example` 即配置权威清单；真实密钥只存本机 `.env` 与服务器，永不入库。
- 目录/文档入库前跑密钥扫描，正则基线：`sk-[A-Za-z0-9]{16,}` / `AKID[A-Za-z0-9]{10,}` / `-----BEGIN` / `(password|secret|token)\s*[:=]\s*…` / `postgresql://user:pass@`。
- 本地开发默认值（如 `postgres:postgres@localhost`）属公开默认，可入库；真实生产串不可。

### 10.4 依赖与外部输入

| 项 | 规则 |
| --- | --- |
| 依赖审计 | `npm audit --omit=dev --audit-level=high` 0 高危；CI 与部署双闸门 |
| SSRF | 服务端抓取类工具（web_read）必须带目标地址防护与预算封顶 |
| 上传 | 文件名含随机 ID、内容不可变；静态服务 `immutable` + 30d |
| body 体积 | `express.json({ limit: '40mb' })` 为上限基线（9 图 base64 实测），新场景超限须立项 |
| 管理后台 | 登录失败按 IP+账号双键锁定限流；高危操作写 `AdminAuditLog` |

---

## 11. 性能规范（预算制）

适用范围：影响加载体积、请求链路、内存增长的改动。

### 11.1 构建体积预算（2026-08-16 基线，gzip）

| 产物 | 当前 | 预算上限 |
| --- | --- | --- |
| 入口 index | 75.2 kB | ≤ 80 kB |
| StudioPage（路由分包） | 64.7 kB | ≤ 70 kB |
| react-vendor | 57.5 kB | ≤ 60 kB |
| ReaderPage | 32.0 kB | ≤ 40 kB |
| 主样式 | 16.3 kB | ≤ 20 kB |

新增依赖必须在批次说明中写明体积影响；超预算须给出理由或做分包/懒加载。

### 11.2 传输与缓存

- 路由级懒加载分包；产物内容哈希文件名 + 长缓存；`index.html` no-cache 保证秒级发布。
- nginx http2 + gzip level 6（css/js/json/svg，≥1 kB 起压）。
- 图片走 WebP 迁移与压缩管线（`scripts/migrate-images-webp.mjs` 模式）。

### 11.3 服务端资源纪律

| 场景 | 规范 | 实例 |
| --- | --- | --- |
| TTL Map 缓存 | 必配容量上限 + 淘汰策略 | 会话状态缓存 5000 条淘汰最旧 |
| 高频写库 | 内存节流合并写 | lastActiveAt 60s 节流、异步落库不阻塞请求 |
| 外部并发 | 进程内信号量封顶 | 视觉服务并发 4（免费档 5 留 1 缓冲） |
| 全站统一口径 | 热度/排序等公式集中一处维护：`(views×1 + likes×3 + comments×4 + favorites×5 + 内容规模) / (days+2)^1.4` | 相关推荐与榜单共用 |

---

## 12. 文档规范

适用范围：仓库内一切文档。

| 文档 | 受众 | 职责 | 维护规则 |
| --- | --- | --- | --- |
| `README.md` | 用户/体验者 | 产品介绍、快速开始、下载安装 | 功能变化同步更新 |
| `docs/ENGINEERING.md` | 工程师 | 架构/决策/测试/部署/性能/安全/债务的**权威现状** | 每轮冲刺后更新「最近更新」行与对应章节 |
| `docs/DEVELOPMENT-STANDARDS.md`（本文档） | 开发者 | 强制规范与检查清单 | 新沉淀回写，保持与代码同步 |
| `plan/*.md` | 历史档案 | 各阶段规划快照，**不追溯修改** | 演进用对照表导航（ENGINEERING §9.2） |
| `plan/README.md` | 档案导航 | 编号语义、阅读顺序、对照表指引 | 档案结构变化时更新 |

提交信息、tag、Release notes 统一一行式简洁中文（铁律 4），不写多段长正文。

---

## 13. 陷阱清单（真实事故沉淀）

适用范围：所有人；遇到疑似工具/环境问题先查此表。

| # | 现象 | 根因 | 规避动作 |
| --- | --- | --- | --- |
| 1 | LSP 报「模块没有导出的成员」「导入与局部声明冲突」 | IDE 增量分析滞后于多文件重构的中间态 | 以 `npx tsc --noEmit` 全量结果为准，忽略中间态误报 |
| 2 | Prisma 类型报错（select 字段不存在等） | Prisma 生成类型滞后 | 改动前同样写法能过 tsc 即判定误报，跑全量 tsc 证实 |
| 3 | PowerShell 内联 node -e 含引号/中文报 ParserError | PowerShell 5.1 引号转义与编码限制 | 将脚本写入 .cjs 临时文件再 `node xxx.cjs`（.dbg/ 已 gitignore） |
| 4 | Grep 结果不全 | 单次最多返回 15 条匹配 | 大文件结构枚举改用 node 脚本按行遍历 |
| 5 | SearchReplace 后出现错误缩进（如 4 空格混入 2 空格代码） | 编辑工具偶发缩进错位 | 每次编辑后复查 diff，发现错位立即补修 |
| 6 | 部署打包失败 | tar 白名单引用已删除文件 | 删文件/目录后核对 deploy-production.ps1 白名单 |
| 7 | 部署后 HTTPS 中断 | 部署脚本覆盖服务器 nginx 配置清掉 certbot SSL 段 | 改 nginx 配置必须同步维护证书段 |
| 8 | 限流/缓存内存无界增长 | 进程内 Map 无淘汰 | 一切进程内 Map 必配容量上限（4.4） |
| 9 | 测试误读开发/生产配置 | dotenv override 覆盖注入 | tests/setup.ts 三重闸：DOTENV_PATH 指向 .env.test + 库名 test 守卫 + forks 隔离 |
| 10 | 本地集成测试全红 | 本地无 PostgreSQL | 预期行为：DB 组 skipIf 自动跳过；CI 有服务容器全量执行 |

---

## 14. 检查清单（可直接执行）

### A. 新功能开发（12 项）

- [ ] 1. 需求已写入 plan/（或批次说明），含「不做清单」
- [ ] 2. 契约先行：`shared/contracts` 定义请求/响应/事件类型
- [ ] 3. 路由端点：会话校验 → parseBody zod 校验（401 优先）
- [ ] 4. 响应结构 `{success,data}` / `{success:false,error:{code,message}}`
- [ ] 5. 数据层封装 + 枚举兜底；索引评估
- [ ] 6. 前端落位 features/<域>/，复用既有资产（5.4）
- [ ] 7. 进程内 Map 配容量上限；限流分桶维度正确
- [ ] 8. 集成测试：文案逐字对照 + 不误拒例 + 401 顺序组
- [ ] 9. 四重闸全绿（tsc → test → build → lint）
- [ ] 10. 一行中文 commit + push，CI 全绿
- [ ] 11. ENGINEERING.md 相关章节同步（架构/决策/环境变量）
- [ ] 12. 涉及部署则按第 9 章链路，用户验收

### B. 重构 / 拆分（8 项）

- [ ] 1. 功能零变化声明：文案逐字、状态码顺序、UI 不触碰
- [ ] 2. 枚举目标文件顶层声明，确定搬运清单（只搬无状态/纯逻辑）
- [ ] 3. 逐字搬迁（含注释与文案），新文件导出对账
- [ ] 4. 原文件删除搬出声明 + 改 import；grep 确认旧 import 清零
- [ ] 5. 消费者全量编译通过（注册表统一出口优先）
- [ ] 6. 拆出的纯逻辑同批补护栏单测
- [ ] 7. tsc 全量 0 错为权威（忽略 LSP 中间态误报）
- [ ] 8. 四重闸 + 独立 commit，可单批 revert

### C. 上线（9 项）

- [ ] 1. 全部批次四重闸绿且已 push
- [ ] 2. CI runs 全部 success
- [ ] 3. `npm audit --omit=dev --audit-level=high` 0 高危
- [ ] 4. 迁移无 pending（prisma migrate deploy 预检）
- [ ] 5. 执行 `npm run deploy:prod`（内置本地闸门）
- [ ] 6. 确认输出 `Deployment finished successfully`
- [ ] 7. 健康检查与公网 HEAD 均 200（脚本内已含）
- [ ] 8. 交用户验收（不自行检查线上内容）
- [ ] 9. ENGINEERING.md「最近更新」与相关数据回写

### D. 新产品启动（复用本仓库骨架）

- [ ] 1. 工程基线：tsconfig strict 全开 + eslint（unused-vars error、react-refresh）+ `@/` 别名（tsconfig 与 vitest 同步）
- [ ] 2. 契约层：`shared/contracts` 目录先行，前后端单一类型来源
- [ ] 3. 测试基线：vitest forks 池 + setup.ts 测试库三重守卫 + skipIf 开箱即用
- [ ] 4. CI：check → lint → test(coverage) → build → audit 五关 + postgres 服务容器
- [ ] 5. 部署脚本：本地闸门 + 白名单打包 + 上传降级 + 健康检查 + 明确成功标志
- [ ] 6. 安全基线：.gitignore 密钥清单、nginx 安全头模板、响应结构与 500 兜底
- [ ] 7. 文档三件套：README（用户）/ ENGINEERING（现状）/ DEVELOPMENT-STANDARDS（规范）
- [ ] 8. 陷阱清单（第 13 章）整体带入，避免重蹈覆辙
