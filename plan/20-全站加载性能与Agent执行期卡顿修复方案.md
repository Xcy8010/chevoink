# 20-全站加载性能与 Agent 执行期卡顿修复方案

> 目标：解决两大类真实用户痛点——
> **问题 A**：全站（尤其 APP 端无缓存冷启动）加载速度慢；图片「一点一点、一部分一部分」渐进显示，体验差。
> **问题 B**：手机 APP 创作区 Agent 执行任务期间，点击输入框 / 展开待办 / 工作区变更 / 底部导航等任何交互，整个界面严重卡顿未响应，约 1 分钟才恢复。
> **问题 C**（体验细节追加）：C1 部分用户头像外多一圈灰色边框且比其他头像显小；C2 社区页/发现页已在当前页时，点击底部导航对应按钮应回到顶部并刷新（带刷新动画，3 秒冷却）。
>
> 本文为**定位报告 + 产品级修复方案**，所有根因均已在代码级核实（附文件与行号证据），未改动任何代码。

---

## 0. 问题诊断总览

### 0.1 问题 A：加载性能（按影响排序）

| # | 严重度 | 根因 | 证据位置 |
|---|--------|------|----------|
| A1 | 致命 | 前端**零代码分割**：所有页面打进单一 JS（约 951KB / gzip 253KB），APP 冷启动必须下载并解析完整包才能渲染首屏 | `vite.config.ts`（全文 32 行，无 `build.rollupOptions.manualChunks`）；`src/app/route-config.tsx` L4-22（16+ 个页面全部同步 `import`，无 `React.lazy`）；`src/app/AppRouter.tsx`（无 `Suspense`） |
| A2 | 致命 | **图片原图直存、零压缩**：头像 2MB、封面 3MB、帖子配图 3MB×9 张，base64 解出来什么样就存什么样，无压缩 / 无缩略图 / 无 WebP；前端上传前也不压缩 | `api/lib/avatar-storage.ts`、`api/lib/novel-cover-storage.ts`、`api/lib/post-image-storage.ts`（三者均为 dataURL 解析后直接 `writeFile`） |
| A3 | 严重 | **上传图片无 HTTP 缓存 + 走 Node 转发**：`/api/uploads` 未在 nginx 静态直服，每张图都经 Node 进程；`express.static` 未设 `maxAge`，浏览器/WebView 每次都重新请求 | `deploy/nginx.chevoink.conf`（无 `/api/uploads` location）；`api/app.ts` L35（`express.static(..., { fallthrough: false })` 无缓存配置） |
| A4 | 严重 | **图片渐进扫描式显示**：大体积 JPEG/PNG 在慢网络下逐行解码渲染（浏览器默认行为），叠加 A2 的超大原图，形成「一点一点加载」的观感；`<img>` 缺整张显示控制与骨架过渡 | `PostCard`、`DiscoverPage`、`RankingsPage` 等消费端仅有 `loading="lazy"`，无 onLoad 整张淡入、无骨架占位（`src/components/ui/Skeleton.tsx` 已有 `skeleton-shimmer` 体系但图片未接入） |
| A5 | 中等 | **首页数据链路偏重**：`['home']` 一次拉大 payload，`['home-continue-reading']` 再逐本调 `getNovelDetailPayload`，串联放大首屏等待 | `src/features/home/useHomeData.ts`；`api/routes/home.ts` → `getHomePayloadData` |

> 已确认良好、无需动：`index.html` 无阻塞资源；nginx `/assets/` 已有 `max-age=31536000, immutable`。

### 0.2 问题 B：Agent 执行期整页卡死（按影响排序）

| # | 严重度 | 根因 | 证据位置 |
|---|--------|------|----------|
| B1 | 致命 | **SSE 高频事件零批处理**：`text.delta` / `reasoning.delta` / `tool.delta` 每条事件立刻 `applyEvent` → Zustand 全局 `set`。模型高速输出时每秒可达几十上百次全局状态更新 | `src/features/studio/agent/useAgentStream.ts` L56-74（`handleEvent` 内直接 `useAgentStore.getState().applyEvent(event)`） |
| B2 | 致命 | **每条 delta 全量重建消息数组**：`applyEvent` 的 text.delta 分支每次 `updateMessageParts`（全量 `map` 生成新数组）+ `appendDelta`，所有订阅组件引用全变、全部重渲染 | `src/features/studio/agent/agentStore.ts` L347-547（applyEvent）、L375-381（text.delta 分支）、L224-247（updateMessageParts / appendDelta） |
| B3 | 致命 | **消息面板无虚拟化、无 memo**：`WritingAgentPanel`（1540+ 行）把全部 conversationArtifacts 一次性 map 渲染，每次 delta 触发整列表重算 `buildArtifactSummary` / `buildLiveStepItems`。长会话下单次渲染成本 × 每秒几十次 = 主线程持续满载，**手机端表现即为「点什么都没反应」** | `src/features/studio/components/WritingAgentPanel.tsx` L903 起（artifacts.map 无 memo / 无虚拟化） |
| B4 | 严重 | **diff 反复重算**：`buildReviewDiff` 虽在 `useMemo` 中，但依赖的 review 对象在 tool.result 等事件后引用频繁变化，大文本 diff 反复计算 | `PlanChangeReview.tsx` L52-56、`ChapterChangeReview.tsx` L58-62 |
| B5 | 严重 | **StudioWorkspace 巨型组件缺乏状态隔离**：9474 行单组件，agent store 波及范围覆盖整个 studio 树（含底部导航、输入框、待办抽屉），任何 agent 状态更新都可能连带整树 reconcile | `src/features/studio/StudioWorkspace.tsx` |

**卡顿链路还原**：Agent 输出正文时，`text.delta` 高频到达 → B1 无节流逐条进 store → B2 每条全量重建数组 → B3 整个消息面板重渲染（含 diff、摘要重算 B4）→ 主线程被 JS 长任务占满 → 用户此时点击任何按钮，事件回调排队在长任务之后 → 手机端 CPU 弱、会话越长渲染越贵，队列积压 → 表现为整页冻结约 1 分钟。

### 0.3 问题 C：体验细节（追加）

| # | 现象 | 根因 | 证据位置 |
|---|------|------|----------|
| C1 | 互关好友栏 / 会话列表中，部分用户头像外多一圈灰色边框，且头像内容比其他用户显小 | **不是组件描边**（`Avatar.tsx` 已无 border，且三个头像走同一组件、同一 `size="md"`，若是组件问题会全员出现）。真正原因是这些用户上传的**头像图片文件本身**是「圆形内容 + 透明/纯色边距」的 PNG（从 QQ 等平台另存的圆形头像），`object-cover` 铺满容器后，透明边距露出容器的 `bg-[var(--surface-muted)]` 灰底 → 视觉上就是一圈灰边框 + 头像显小；满幅方图用户则正常 | `src/features/community/components/Avatar.tsx` L36-42（容器灰底 + img object-cover）；`api/lib/avatar-storage.ts`（原图直存，未裁掉透明边距） |
| C2 | 已在社区页/发现页时，点击底部导航「社区」「发现」按钮无任何反馈 | 底部导航为 `NavLink`，目标即当前路由时点击是空操作，无回顶与刷新逻辑 | `src/components/layout/AppShell.tsx` L780-799（mobileNavItems 渲染为 NavLink，无 onClick 复用逻辑） |

---

## 1. 设计原则

1. **先减字节，再减请求，最后减渲染**：A 类问题按「包体 → 图片体积 → 缓存命中 → 感知优化」顺序做，收益从大到小。
2. **图片必须「整张出现」**：用户看到的只有两种状态——骨架 shimmer 或完整图片，不允许出现半张图。手段 = 骨架占位 + `onLoad` 后整张淡入（图片加载完成前 `opacity: 0`）。
3. **高频事件必须帧对齐**：SSE delta 以「渲染帧」为单位合并消费，UI 每帧最多更新一次，与模型输出速度解耦。
4. **渲染范围最小化**：正在流式输出的只有「最后一条消息的最后一个 part」，历史消息必须免于重渲染。
5. **零功能回归**：本方案全部为性能与体验优化，不改任何业务语义、接口契约与数据结构（除新增缩略图 URL 字段）。

---

## 2. 问题 A 修复方案

### 2.1 A1：代码分割与路由懒加载（首屏包体 -60% 以上）

**vite.config.ts** 增加 `build.rollupOptions.output.manualChunks`，拆出稳定长缓存 vendor 块：

- `react-vendor`：react / react-dom / react-router-dom
- `query-vendor`：@tanstack/react-query、zustand
- 其余重依赖（如 markdown / diff / 图标库）按实际打包分析结果拆分，以 `npm run build` 的 chunk 报告为准

**route-config.tsx** 全部页面改 `React.lazy(() => import(...))`：

- 首屏关键路由（`/`、`/login`）可保留同步导入或用 modulepreload 预热
- 重型页面必须懒加载：`StudioPage`（连带整个 studio 目录与 agent 体系，是最大单块）、`ReaderPage`、`MessagesPage`、`CommunityPage` 等
- `AppRouter.tsx` 包一层 `<Suspense fallback={<页面级骨架>}>`，fallback 复用现有 `Skeleton` 体系，避免白屏
- 懒加载 chunk 请求失败（发版后旧 HTML 引用旧 hash）需兜底：捕获动态 import 错误后 `location.reload()` 一次

**预期**：非创作用户首屏 JS 从 ~951KB 降到 ~300KB 以内；创作区代码只在进入 `/studio` 时下载。

### 2.2 A2：图片压缩链路（前端压一道、后端压一道）

**前端上传前压缩（第一道，立刻减少上行与存储）**：新建 `src/lib/image-compress.ts`，基于 canvas：

- 头像：压到 512×512 以内、JPEG/WebP 质量 0.85（头像展示最大不过 96px，512 已冗余）
- 封面：压到 900×1200 以内（3:4）、质量 0.85
- 帖子配图：长边 ≤1600、质量 0.82
- 三个上传入口（头像设置、封面上传、发帖配图）统一接入，上传体积预期从 2-3MB 降到 100-300KB

**后端落盘时转码 + 生成缩略图（第二道，治理存量并兜底绕过前端的请求）**：三个 storage 文件统一接入 `sharp`：

- 落盘统一转 WebP（质量 80），并额外生成缩略图：头像 128px、封面 320px、帖子配图 480px（命名约定 `xxx.webp` + `xxx.thumb.webp`）
- 列表场景（发现页、榜单、社区流、会话列表）消费缩略图；详情/大图查看消费原尺寸
- 契约层：图片 URL 字段新增可选 `thumbUrl`（或约定式派生 `-thumb` 后缀，推荐约定式派生，不动 contracts）
- **存量迁移**：写一个 `scripts/migrate-images-webp.mjs` 一次性脚本，扫描 uploads 目录把历史 JPEG/PNG 批量转 WebP + 缩略图，保留原文件名映射（数据库 URL 不变时用 nginx `try_files` 优先命中 .webp）
- **风险项**：`sharp` 含原生二进制，需在生产服务器（Linux x64）验证 `npm install` 可正常编译/下载预编译包；若服务器安装受阻，降级方案为仅保留前端 canvas 压缩（已能解决 90% 增量问题），存量用本地跑脚本后 scp 上传

### 2.3 A3：HTTP 缓存与静态直服

**nginx（`deploy/nginx.chevoink.conf`）** 新增 location，让上传图片绕过 Node：

```nginx
location /api/uploads/ {
    alias /var/www/chevoink/uploads/;   # 以生产实际 uploads 目录为准
    expires 30d;
    add_header Cache-Control "public, max-age=2592000";
    try_files $uri =404;
}
```

- 文件名含随机 ID、内容不可变，30 天缓存安全；若后续做「同 URL 覆盖头像」需改为 URL 加版本参数
- **express.static 兜底**（本地开发与 nginx 未更新期间）：`api/app.ts` L35 加 `maxAge: '30d', immutable: true`

**nginx gzip**：确认全局启用 `gzip on` 且覆盖 `text/css application/javascript application/json`（当前配置无显式 gzip，需补齐或确认 http 块已有）。

### 2.4 A4：图片「整张显示」+ 专属骨架加载动画（核心体验项）

新建统一图片组件 `src/components/ui/AppImage.tsx`，全站替换裸 `<img>`：

**行为规范**：

1. 挂载即渲染骨架占位（复用 `skeleton-shimmer`，按使用场景传入宽高比：封面 3:4、头像圆形、帖子图自适应），占位撑住布局防 CLS
2. `<img>` 始终渲染但 `opacity-0`，`onLoad` 触发后骨架淡出、图片 200ms 整张淡入（`transition-opacity`）——**用户永远看不到半张图**
3. `onError` 显示统一占位图（灰底 + 图标），不留破图
4. 保留 `loading="lazy"` + `decoding="async"`；列表首屏前 2-3 张图可传 `priority` 关闭 lazy
5. 支持 `thumbSrc` 属性：列表场景传缩略图 URL（对接 2.2 的缩略图产物）

**接入点**（全站扫描替换）：PostCard 配图、DiscoverPage / RankingsPage / Home 封面、Avatar 组件、NovelDetailPage 封面、会话列表头像、TopicPage 等。Avatar 组件因已有字母兜底逻辑，内部改造为「骨架 → 图片整张淡入 → 失败回退字母」三态。

> 说明：图片「一点一点显示」的根源是大 JPEG 逐行解码（A2）+ 无过渡控制（本节）。A2 把图压小后加载时间大幅缩短，本节保证加载过程中只见骨架、完成后整张出现，两者叠加彻底消除渐进扫描观感。

### 2.5 A5：首页数据链路减负

- `['home-continue-reading']` 不再逐本调 `getNovelDetailPayload`：后端在 home payload 中直接内嵌继续阅读所需的轻量字段（书名/封面/进度/最新章节），砍掉 N 次串行请求
- home payload 内各板块图片全部走缩略图
- 首页各板块骨架已有基础，确保数据到达前全部展示 Skeleton 而非空白

---

## 3. 问题 B 修复方案

### 3.1 B1：SSE delta 帧级批处理（治本第一刀）

改造 `useAgentStream.ts` 的 `handleEvent`：

- 高频事件（`text.delta` / `reasoning.delta` / `tool.delta`）**不再逐条进 store**，先推入 `pendingRef` 队列
- 用 `requestAnimationFrame`（页面后台时降级 100ms `setTimeout`）冲刷队列：一帧内把同一 message/part 的多条 delta **拼接成一条**后调用一次 `applyEvent`
- 低频事件（run.started / tool.call / tool.result / permission.* / step.finish / run.paused / run.finished / error）到达时**先冲刷队列再同步应用**，保证事件顺序语义不变
- 终态事件冲刷后关闭连接，逻辑同现状

**效果**：store 更新频率从「每秒几十上百次」压到「每秒最多 60 次、通常 10-20 次」，且每次更新只做一次数组重建。

### 3.2 B2：agentStore 增量更新优化

- `appendDelta` 改为只替换目标 message 与目标 part 的引用，其余 message 保持**引用不变**（当前 `updateMessageParts` 已是 map 重建，需确认未变更的 message 对象直接复用原引用，为 3.3 的 memo 提供前提）
- 会话消息数组超过阈值（如 200 条 part）时考虑分段存储（历史段 + 活跃段），活跃段更新不触碰历史段引用

### 3.3 B3：WritingAgentPanel 渲染隔离（治本第二刀）

- **每条 artifact/消息抽成独立 `memo` 子组件**，props 仅接收自身 message 对象；配合 3.2 的引用稳定，delta 到达时只有「最后一条正在流式的消息」重渲染，历史消息全部命中 memo 跳过
- `buildArtifactSummary` / `buildLiveStepItems` 移入子组件内 `useMemo`，依赖各自 message 引用
- 消息列表**虚拟化**：长会话（>50 条 artifact）只渲染视口附近内容。优先用轻量方案（如 `content-visibility: auto` + `contain-intrinsic-size` 的 CSS 方案，零依赖、对现有 DOM 结构侵入最小）；若实测不足再上 `@tanstack/react-virtual`
- 流式自动滚动改为 rAF 节流，避免每条 delta 触发 `scrollIntoView`

### 3.4 B4：diff 计算缓存

- `PlanChangeReview` / `ChapterChangeReview` 的 `buildReviewDiff` 依赖从「review 对象引用」改为「内容签名」（如 `review.id + status + 文本长度/哈希`），对象引用变化但内容未变时不重算
- diff 结果超过阈值（如 2000 行）截断渲染 + 「展开完整对比」按钮，避免单次渲染超大 DOM

### 3.5 B5：StudioWorkspace 状态隔离

- 审计 `StudioWorkspace.tsx` 对 `useAgentStore` 的订阅：所有订阅改为**细粒度 selector**（只取所需字段），禁止整 store 订阅；phase 等低频字段与 messages 等高频字段分开订阅
- 底部导航、输入框、待办抽屉等外围 UI 不订阅高频 agent 状态；确需展示运行态的（如「运行中」小圆点）只订阅 `phase`
- 本项不做 9474 行大拆分（风险高、收益与 3.1-3.3 重叠），仅做订阅面收敛；组件拆分留待后续专项

---

## 4. 问题 C 修复方案

### 4.1 C1：头像透明/纯色边距治理（统一头像视觉尺寸）

目标：无论用户上传什么样的图（圆形带透明边距、带纯色留白、满幅方图），最终展示的头像内容尺寸一致、无额外灰圈。

**上传链路治理（治本，与 2.2 图片压缩链路合并实施）**：

- **前端 canvas 压缩时同步处理**（`src/lib/image-compress.ts`，头像入口专属预处理）：
  1. 绘制前扫描四边透明/近似纯色像素，裁切到实际内容包围盒（trim 透明与纯色边距）
  2. 绘制到不透明背景的 canvas 上（透明区域填底色），再导出 JPEG/WebP —— 从此不存在透明像素
- **后端 sharp 兼容处理**（`api/lib/avatar-storage.ts`，兜底绕过前端的请求）：`sharp().trim()`（裁掉透明/纯色边距）`.flatten()`（压平透明通道）后再 resize 转 WebP，与 2.2 同一条管线

**存量治理**：2.2 的 `scripts/migrate-images-webp.mjs` 迁移脚本对头像目录额外加 trim + flatten 步骤，现有带灰圈头像（如图中前两位用户）一次性修复，无需用户重新上传。

**实施前验证步骤**：先下载图中两位用户的头像原文件确认确实含透明/纯色边距（预期成立；若实际是其他原因则回到组件层排查）。

### 4.2 C2：底部导航重复点击 = 回顶 + 刷新（社区页、发现页）

**交互规范**：

1. 已在 `/community` 时点底栏「社区」、已在 `/discover` 时点底栏「发现」：
   - 主滚动容器平滑回顶（`mainScrollRef.scrollTo({ top: 0, behavior: 'smooth' })`，同时清掉 `scrollPositionsRef` 中该路由的记录，避免下次返回又跳回旧位置）
   - 触发数据刷新：`invalidateQueries` 对应页的 React Query key（社区信息流 / 发现页数据）
   - **刷新动画**：页面顶部展示一个旋转 loading 指示器（复用现有 spinner 风格，与下拉刷新视觉一致），数据 refetch 完成后收起；同时底栏图标可做一次轻微缩放反馈（press-feedback 已有）
2. **3 秒冷却**：记录上次刷新时间戳（`useRef`，按路由分开），冷却期内重复点击仅回顶、不触发 refetch 与动画，防止连点打爆接口
3. 其他底栏按钮（首页/消息/我的）本期不加刷新行为，仅社区与发现两页生效；交互入口预留可扩展结构（按路由配置开关）

**改动点**：`AppShell.tsx` 底部导航 NavLink 加 `onClick`，判断 `location.pathname === item.href` 时 `preventDefault` 并执行上述逻辑；刷新指示器状态可放在 AppShell 本地 state，通过现有 `useShellStore` 或自定义事件通知页面层展示顶部 spinner（优先选侵入最小的 shellStore 方案）。

---

## 5. 实施阶段划分

| 阶段 | 内容 | 预期收益 | 风险 |
|------|------|----------|------|
| **P0（先做，收益最大）** | 3.1 delta 批处理 + 3.3 消息 memo 化 + 3.2 引用稳定；2.1 代码分割与路由懒加载 | Agent 卡死直接解除；首屏 JS -60% | 低：纯前端，`npm run check` + 手机实测即可验证 |
| **P1** | 2.4 AppImage 骨架整张显示组件并全站替换；2.2 前端 canvas 上传压缩（含 4.1 头像 trim+flatten 预处理）；2.3 express.static maxAge；4.2 底栏重复点击回顶刷新 | 图片体验质变、新增图片体积 -90%；头像灰圈与刷新交互落地 | 低 |
| **P2** | 2.3 nginx uploads 直服 + 缓存头 + gzip 确认；2.2 后端 sharp 转码与缩略图（含 4.1 trim/flatten）+ 存量迁移脚本（含存量灰圈头像修复） | 图片请求绕过 Node、二次访问零请求、存量图片瘦身 | 中：涉及生产 nginx 与 sharp 安装，需灰度验证 |
| **P3** | 3.4 diff 缓存 + 3.5 订阅收敛；2.5 首页数据链路 | 长会话与首页进一步提速 | 低 |

每阶段独立可部署（`npm run deploy:prod`），互不阻塞；P0 完成即可解决用户最痛的两点。

---

## 6. 验收标准

**问题 A**：
- [ ] 清缓存冷启动，4G 网络下首页可交互时间 < 3s（现状目测 8-15s）
- [ ] `npm run build` 首屏入口 chunk gzip < 100KB，无单 chunk > 300KB 警告
- [ ] 全站任何图片不出现「半张图」：加载中为骨架 shimmer，完成后整张 200ms 淡入
- [ ] 新上传头像 ≤ 50KB、封面 ≤ 150KB、帖子图 ≤ 300KB（WebP）
- [ ] 二次访问上传图片全部命中缓存（Network 面板 memory/disk cache 或 304）

**问题 B**：
- [ ] Agent 高速输出正文期间，手机端点击输入框 / 展开待办 / 工作区变更 / 底部导航，响应延迟 < 200ms，无任何冻结
- [ ] Chrome Performance 录制：流式期间无 > 200ms 长任务；历史消息组件零重渲染（React DevTools Profiler 验证 memo 命中）
- [ ] 事件顺序语义不变：tool.call / permission.ask / run.finished 等低频事件展示时序与现状一致，无 delta 丢失或乱序

**问题 C**：
- [ ] 图中两位用户（及所有带透明/纯色边距头像的用户）头像与满幅方图用户视觉尺寸一致，无灰色外圈（互关好友栏、会话列表、社区、关注粉丝页全部验证）
- [ ] 新上传带透明边距的 PNG 头像，落库后已被裁切为满幅不透明图
- [ ] 在社区页点底栏「社区」/在发现页点底栏「发现」：平滑回顶 + 顶部刷新动画 + 数据重新拉取；3 秒内重复点击仅回顶不重复刷新
- [ ] 刷新后社区页滚动位置记忆被清除（不会刷新完又跳回旧位置）

---

## 7. 风险与注意事项

1. **sharp 原生依赖**：生产服务器需先验证安装；失败则 P2 后端转码降级为「本地跑迁移脚本 + 前端压缩兜底」，不阻塞其他项。
2. **懒加载发版兼容**：发版后旧页面请求旧 hash chunk 会 404，必须实现动态 import 失败自动 reload 兜底。
3. **delta 批处理时序**：低频事件必须先冲刷 pending 队列再应用，否则会出现 tool.result 先于其 text 内容展示的乱序；需针对 permission.ask（等待用户输入）场景专测。
4. **缓存与头像更新**：30 天强缓存要求图片 URL 内容不可变；确认现有上传均为随机文件名后再上线缓存头。
5. **memo 前提是引用稳定**：3.2 与 3.3 必须同一批上线，只做 memo 不做引用稳定则 memo 全部失效。
6. **头像 trim 误裁风险**：`sharp.trim()` 对近似纯色背景的正常头像（如纯色背景证件照）可能过度裁切，需设置容差阈值并限制最大裁切比例（如裁切后面积 < 原图 40% 则放弃 trim 只做 flatten）；存量迁移前先抽样验证。
7. **底栏刷新与滚动记忆冲突**：C2 刷新回顶时必须同步清除 `scrollPositionsRef` 对应路由记录，否则与已上线的「社区返回恢复滚动位置」功能冲突。
8. **部署铁律**：所有改动在 `C:\Users\Xcy24\Desktop\ai写作` 完成并 `npm run deploy:prod` 后才对 APP 生效；nginx 配置变更需同步 `deploy/nginx.chevoink.conf` 并在服务器 reload。
