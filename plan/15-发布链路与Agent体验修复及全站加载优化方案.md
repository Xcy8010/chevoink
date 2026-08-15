# 15-发布链路与Agent体验修复及全站加载优化方案

> 版本：v1.0（2026-07-25）
> 范围：六大类问题的定位结论 + 修复与优化方案。本文档只做方案约定，不含实现代码。
> 关联文档：plan/12（前端 UIUX）、plan/13（创作区 Agent 重构）、plan/14（Agent 幻觉治理）。

---

## 目录

1. 发布作品与章节可见性链路修复
2. 创作区 Agent 六项体验修复
3. 个人中心三项修复与设置页重构
4. 侧栏收起态头像悬停浮层
5. 全站骨架屏统一与加载性能优化
6. 消息 / 论坛 / 阅读评论功能完善度审计与补齐
7. 优先级分组与实施顺序
8. 验收清单

---

## 1. 发布作品与章节可见性链路修复

### 1.1 现状与根因

**症状**：点击"发布作品"后，作品详情页仍显示"暂未开放阅读"。

根因链（三段）：

| 环节 | 位置 | 问题 |
| --- | --- | --- |
| 发布动作 | `api/lib/data-access.ts` L606-644 `updateNovelData` | 发布只把 `novel.status` 改为 `published`，**不触碰任何章节的 status/visibility** |
| 章节默认值 | `api/routes/novels.ts` L222 | 创建章节时 `visibility: body.visibility ?? 'private'`，兜底为 **private**，与"默认公开"诉求相反 |
| 详情页过滤 | `api/lib/data-access.ts` L646-707 `getNovelDetailData` | 非作者仅返回 `status='published' AND visibility='public' AND publishedAt<=now` 的章节；全部被过滤后 `firstPublishedChapter` 为空 → `DetailCtaRow.tsx` L31 渲染"暂未开放阅读" |

前端发布入口 `StudioWorkspace.tsx` L5285-5299 `handlePublishNovel` 目前只是一个 confirm 确认框，没有任何章节选择能力。

### 1.2 修复方案

#### A. 章节默认可见性改为 public

- `api/routes/novels.ts` L222：创建章节兜底改为 `body.visibility ?? 'public'`。
- 同步检查更新章节接口，未显式传 visibility 时不改动原值（保持现状即可）。
- 存量数据迁移：新增一条 SQL 迁移（或一次性脚本），将「所属作品已 published 且章节 status=published 但 visibility=private 且用户从未手动设置过」的章节批量置为 public。为避免误伤用户主动设为私密的章节，采取保守策略：**只在发布弹窗里由用户勾选批量放开，不做静默迁移**（见下）。

#### B. 发布弹窗（含章节多选）

替换 `handlePublishNovel` 的 confirm 为正式弹窗组件 `PublishNovelDialog`（新建 `src/features/studio/components/PublishNovelDialog.tsx`）：

- 弹窗内容：
  - 作品信息摘要（标题/封面/简介缺失提醒）。
  - **章节清单多选列表**：每章一行，显示序号、标题、当前 status/visibility；提供「全选」「反选」快捷操作；默认全选所有草稿+未公开章节。
  - 可见范围选择：默认 `public`（公开），可切 followers/private。
- 确认后调用新的后端批量接口：`POST /api/novels/:id/publish`，body：`{ chapterIds: string[], visibility: Visibility }`。
- 后端在一个事务里：
  1. `novel.status = 'published'`，`publishedAt` 首次发布时写入。
  2. 对选中章节批量 `status='published'`、`visibility=<所选>`、`publishedAt = publishedAt ?? now()`。
- 契约：`shared/contracts/api.ts` 增加 `PublishNovelRequest/Response` 类型。

#### C. 发布后可读性验证

- `getNovelDetailData` 过滤逻辑本身正确，无需改动；发布事务完成后前端 invalidate 作品详情/目录相关 query。
- `ReaderDirectory.tsx` L31 的 `fromStudio || isPublicReadableChapter(chapter)` 判定保持不变，发布后自然可点。

#### D. 章节设置区优化 + 按钮醒目化 + 沉浸区入口

- **章节设置按钮样式**：`StudioWorkspace.tsx` L8750-8791 的章节设置触发按钮改为黑底白字（`bg-zinc-900 text-white hover:bg-zinc-800`，暗色主题下反转为白底黑字），尺寸与图标不变。
- **章节设置面板重构**：参考 `MetaPanel.tsx`（作品设置）的分组卡片式布局，将现有零散的 status/visibility 按钮整理为独立抽屉/面板 `ChapterSettingsPanel`：
  - 分组一：基本信息（章节标题、序号）。
  - 分组二：发布状态（draft/published/scheduled/archived 单选段）。
  - 分组三：可见范围（public/followers/private 单选段，附文案说明）。
  - 分组四：危险操作（删除章节）。
- **沉浸创作区**：`ImmersiveComposer.tsx` L716-762 已有状态/可见性按钮区，在其旁增加同款黑底白字「章节设置」按钮，点击打开同一个 `ChapterSettingsPanel`（组件复用，props 传入 chapter + 回调）。

---

## 2. 创作区 Agent 六项体验修复

### 2.1 计划文件无法重命名/就地修改（问题 2a）

**根因**：
- `api/lib/agent/tools/write-tools.ts` L519-588 的 `plan_save` 已支持 `planId` 就地更新与同名去重更新，但模型经常不带 `planId` 且改了标题 → 同名匹配失败 → 落成新文件。
- `api/lib/agent-workspace-tools.ts` L20-119 工具注册表**没有独立的计划重命名/删除工具**。

**方案**：
1. 新增工具 `plan_rename`（参数：planId, newTitle）与 `plan_delete`（参数：planId），注册进工具表；plan/build 模式 allow，review 模式 deny；`plan_delete` 设为 ask（需用户确认）。
2. `plan_save` 增强：当传入 `planId` 时允许同时更新 `title` 与 `content`（改名+改内容一步完成），返回 planDiff 时带上 `titleChanged` 标记。
3. 系统提示词（`api/lib/agent-service.ts` L2464-2498 `buildWorkspaceSystemPrompt`）追加硬性协议：**修改既有计划必须先 `plan_list`/读取拿到 planId，再带 planId 调 `plan_save`；禁止在已有同主题计划时另起新计划**。
4. 前端 `handleAgentStreamEvent`（`StudioWorkspace.tsx` L3458-3588）处理改名事件：planDiff 携带 `titleChanged` 时刷新计划列表标题。

### 2.2 移除"未审查无法前往"拦截（问题 2b）

**根因**：`pendingChapterReview`（`StudioWorkspace.tsx` L2755-2759）存在时，切章 guard 弹出"当前未审查无法前往"阻断导航。

**方案**：
- 删除切章 guard 中的阻断分支：允许自由切换章节；`pendingChapterReview` 改为**按章节挂载**（`Map<chapterId, ReviewState>`），离开章节不丢审查状态，回来仍能看到绿增红减与"采纳/拒绝"条。
- 若目标章节自身有 pending review，进入后直接展示审查视图，而非弹窗拦截。

### 2.3 自动追踪模式（问题 2c）

**方案**：
- 在 Agent 面板头部（`AgentPanel.tsx`）新增「自动追踪」开关按钮，默认开启，状态持久化到 `localStorage`（key: `studio.agent.autoFollow`）。
- 逻辑挂在现有 `refreshWorkspaceAfterAgentWrite`（`StudioWorkspace.tsx` L3440-3456）与 `captureAgentChapterReview`（L3344-3438）之后：当 agent 完成一次章节写入/计划写入且开关开启时，自动 `setActiveChapter(chapterId)` / 切到对应计划视图，并滚动到 diff 起始位置。
- 与 2.2 配合：切走后 review 状态仍按章节保留。

### 2.4 新建内容先落空白正文，保证 diff 审查（问题 2d）

**根因**：Agent 新写章节/计划时一次性把全文端上来，`captureAgentChapterReview` 没有 before 基线（新建计划返回 planFile 无 before），前端无法渲染绿增红减。

**方案**（前后端各一半）：
1. **后端协议**：`buildWorkspaceSystemPrompt` 中已有"先创建空白章节→补标题→写正文"三步协议，扩展到计划：新建计划必须先 `plan_save` 一个仅含标题的空白文档（content=''），再第二次 `plan_save` 带 planId 写入正文；工具层在 `plan_save` 检测到"新建且 content 非空"时在返回里附 `warning` 提醒模型（软约束）。
2. **前端兜底**（硬保证，不依赖模型听话）：`handleAgentStreamEvent` 收到 `planFile`（新建、无 before）或新建章节首次写入时，**主动以空字符串作为 before 基线**构造 diff → 全文显示为绿色新增，审查条正常出现。这样即使模型跳过两步协议，审查功能也不消失。

### 2.5 一键审查条移位（问题 2e）

- `AgentPanel.tsx`：把 L638-704 的一键审查条从消息流上方移至 L873-883 `AgentComposer` 输入区的**正上方**，作为独立 sticky 块，与输入框留 8px 间距；z-index 层级低于弹出菜单，避免与模式切换/斜杠命令弹层重叠。

### 2.6 即时自动保存（问题 2f）

**根因**：`StudioWorkspace.tsx` L5494-5506 用 `setTimeout(..., 5000)` 的 5 秒防抖。

**方案**：
- 防抖时间降为 **800ms**（"有改动就保存"但避免每击键一次请求打爆后端；800ms 对用户感知即"即时"）。
- 追加两个立即触发点：`blur`（编辑器失焦）与切换章节前 flush 未保存内容（复用 `persistChapter` L5398-5492）。
- 保存状态指示文案从"5 秒后自动保存"改为"已自动保存 · HH:mm:ss"。

---

## 3. 个人中心三项修复与设置页重构

### 3.1 "未命名作品"显示错误

**根因**：`src/pages/ProfilePage.tsx` L145-157，书架/收藏卡片直接用 `item.title`，未走 displayTitle 归一；后端 shelf 数据返回的 title 可能是创建时的占位标题（`BOOTSTRAP_NOVEL_TITLES`，L33）。

**方案**：
- 后端：shelf / 创作 / 收藏三处数据源统一返回作品**当前** title（检查 `api/lib/data-access.ts` 内相应查询是否 join 了最新 novel.title，而非冗余快照字段；若存在快照字段，改为实时 join）。
- 前端：抽公共函数 `resolveNovelDisplayTitle(novel)`（放 `src/lib/utils.ts`），占位标题集合命中时显示"未命名作品"，否则显示真实标题；ProfilePage 三个 tab 与 StudioWorkspace 作品下拉统一调用，消除多处各写一套的现状。

### 3.2 用户封面误显示作品封面（图一）

**根因**：`ProfilePage.tsx` L190-194 fallback 链：

```
profileCoverUrl ?? recentCoverAsset?.imageUrl ?? visibleAuthoredNovels[0]?.coverUrl ?? null
```

用户未设置个人封面时，回退到了 AI 封面资产/第一部作品封面。

**方案**：删除后两级 fallback，改为 `profileCoverUrl ?? null`；为空时渲染品牌默认渐变背景（与设置页封面占位一致）。`recentCoverAsset` 仅保留给"最近生成的封面"功能位使用，不再混入个人封面。

### 3.3 设置页重构

现状：`src/app/routes/SettingsPage.tsx` 所有表单纵向堆叠，层级混乱。

**方案**：改为左侧锚点导航 + 右侧分区卡片（移动端退化为分组手风琴）：

| 分区 | 内容 |
| --- | --- |
| 个人资料 | 昵称、简介、头像上传 |
| 外观 | 个人主页封面（上传/移除/预览）、主题（亮/暗/跟随系统） |
| 账号安全 | 手机号展示、修改密码 |
| 会话 | 退出登录（危险区样式） |

- 每张卡片独立保存按钮（或自动保存 + toast），不再一个长表单一起提交。
- 复用 `MetaPanel.tsx` 的卡片分组视觉语言，保持全站一致。

---

## 4. 侧栏收起态头像悬停浮层

**现状**：`AppShell.tsx` L407-427 收起态底部头像仅 `onClick → navigate('/me')`，无 hover 行为；四按钮菜单已存在于 `renderAccountMenuActions`（L142-173）。

**方案**：
- 收起态头像外包 hover 触发容器：`onMouseEnter` 延迟 150ms 显示、`onMouseLeave` 延迟 200ms 关闭（浮层自身 hover 时保持），避免误触闪烁。
- 浮层内容 = 头像 + 昵称 + 手机号/签名一行 + 复用 `renderAccountMenuActions` 的四个按钮（个人中心/设置/我的创作/退出登录），定位在头像右侧（`position: fixed` + 计算坐标或 Popover 组件），z-index 高于主内容。
- 键盘可达性：头像获得焦点时同样展示浮层；Esc 关闭。
- 展开态侧栏行为不变。

---

## 5. 全站骨架屏统一与加载性能优化

### 5.1 骨架屏统一

标准：以 `ReaderSkeleton`（`src/components/ui/Skeleton.tsx`）的样式为基准。

| 页面/区域 | 现状 | 改造 |
| --- | --- | --- |
| ProfilePage L334-343 | AppState 转圈 | 新增 `ProfileSkeleton`（封面条 + 头像圆 + tab 条 + 卡片栅格） |
| PostDetailPage | AppState 转圈 | 新增 `PostDetailSkeleton`（标题行 + 段落若干 + 评论列表条） |
| StudioPage / StudioWorkspace L8042-8053 | 转圈 | 新增 `StudioSkeleton`（三栏骨架：左侧目录条列 + 中部编辑区大块 + 右侧面板条列） |
| SettingsPage | 无 | `SettingsSkeleton`（卡片轮廓） |
| 作品下拉（选择作品） | 空白等待 | 下拉内条状骨架 3-5 行 |
| Home/Community/Messages/NovelDetail/Reader | 已有骨架 | 不动，仅核对风格一致 |

全部新增骨架统一收敛进 `src/components/ui/Skeleton.tsx`。

### 5.2 加载性能（重点：创作区）

已定位的瀑布与浪费：

1. **请求瀑布**：`StudioPage.tsx` L20-25 `meQuery` 完成 → 才渲染 `StudioWorkspace` → 再发 `studioQuery` + `myNovelsQuery`（L2674-2683），串行两跳。
2. **重复请求**：`getMyStudioNovels`（`src/features/studio/api.ts` L1387-1390）内部又调 `/api/users/me`，与 meQuery 重复。
3. **无缓存策略**：相关 query 均未设 `staleTime`，每次进入/切回都全量重拉。

**方案**：
- 消除瀑布：`StudioWorkspace` 不再等待 meQuery 结果才发起自身请求；me 信息通过 react-query 缓存共享（同 queryKey `['me']`），StudioPage 与 Workspace 并行读取。
- 去重：`getMyStudioNovels` 删除内部 `/api/users/me` 调用，改为接收上层传入的 userId 或直接由后端从 session 取。
- 后端聚合：新增 `GET /api/studio/bootstrap` 一次返回 `{ me, novels(轻量列表), activeNovel(含章节目录) }`，创作区首屏一个请求打满；作品下拉直接吃该列表，点击展开即刻渲染（后台再静默刷新）。
- 缓存策略：全局 QueryClient 默认 `staleTime: 30_000`；作品列表/个人信息 `staleTime: 60_000`；章节正文保持即时。
- 列表瘦身：作品下拉与 shelf 列表接口只返回 id/title/coverUrl/updatedAt，不带章节与统计大字段。

---

## 6. 消息 / 论坛 / 阅读评论功能完善度审计与补齐

审计结论（按模块）：

### 6.1 消息页

| 缺口 | 位置 | 补齐方案 |
| --- | --- | --- |
| 无已读标记 | `api/routes/conversations.ts` 仅 list/listMessages/send | 新增 `POST /api/conversations/:id/read`；Conversation 增加 `lastReadAt`（迁移）；前端进入会话即调用，未读徽标据此计算 |
| 无新消息刷新 | 前端无轮询 | 会话页 `refetchInterval: 15s` 轻轮询（后续可升级 SSE） |

### 6.2 论坛（社区）

| 缺口 | 位置 | 补齐方案 |
| --- | --- | --- |
| 点赞/收藏是假的 | `PostCard.tsx` L24-25 仅本地 useState | 后端新增 `POST/DELETE /api/posts/:id/like`、`/bookmark`（新表 PostLike/PostBookmark，迁移）；前端乐观更新 |
| 话题筛选未接后端 | `CommunityPage.tsx` L34-37 前端过滤 | listPosts 传 `topicId`（后端 `api/routes/posts.ts` 已支持），删除前端过滤 |
| 无分页 | CommunityPage 一次拉全部 | cursor 分页 + 「加载更多」按钮（后端已具备 skip/take 基础则补 cursor 参数） |
| 评论点赞/回复无交互 | `CommentList.tsx` L27-36 span 无 onClick | 回复：接线已有的 `parentId` 能力，点击展开内联回复框；点赞：新增 `POST /api/comments/:id/like`（CommentLike 表） |

### 6.3 阅读页评论

| 缺口 | 位置 | 补齐方案 |
| --- | --- | --- |
| 只能看不能发 | `ReaderCommentsPanel.tsx` 无输入框 | 面板底部增加发表输入框（登录校验、字数上限、提交后乐观插入列表），复用社区评论提交接口 |

### 6.4 契约与迁移汇总

- 新增 Prisma 迁移：`PostLike`、`PostBookmark`、`CommentLike` 三表 + Conversation `lastReadAt` 字段。
- `shared/contracts/api.ts` 补齐上述端点的请求/响应类型。

---

## 7. 优先级分组与实施顺序

| 批次 | 内容 | 理由 |
| --- | --- | --- |
| **P0（先做，直击可用性）** | 1.2A 章节默认 public、1.2B 发布弹窗+批量发布接口、2.2 移除审查拦截、2.6 即时保存、3.1 未命名作品、3.2 封面错位 | 都是用户当前每天踩到的 bug/阻断 |
| **P1（体验闭环）** | 2.1 计划改名工具、2.3 自动追踪、2.4 diff 审查兜底、2.5 审查条移位、1.2D 章节设置面板+黑底白字按钮+沉浸区入口、4 侧栏悬停浮层 | 创作区核心体验 |
| **P2（性能与统一）** | 5.1 骨架屏全覆盖、5.2 bootstrap 聚合接口+缓存策略 | 需要新端点与较多页面改动 |
| **P3（功能补齐）** | 6 消息已读/论坛点赞收藏/评论回复/阅读页发评（含 3 张新表迁移）、3.3 设置页重构 | 涉及新数据模型，独立成批降低风险 |

依赖关系：2.3 依赖 2.2 的按章节 review 状态改造；5.2 的 bootstrap 接口落地后 5.1 的 StudioSkeleton 才有稳定首屏时序；6 的迁移应合并为一次 migration 提交。

## 8. 验收清单

- [ ] 新建章节默认可见范围为公开；发布弹窗可勾选/全选章节，确认后所选章节在作品页可点击进入阅读，无"暂未开放阅读"。
- [ ] 章节设置为独立分组面板（对齐作品设置样式）；按钮黑底白字；沉浸创作区可见同一按钮。
- [ ] Agent 能就地改名/修改既有计划，不再产生重复计划文件。
- [ ] 切换到 Agent 新写章节不再被"未审查无法前往"拦截；审查状态按章节保留。
- [ ] 自动追踪默认开启，Agent 写完自动跳到对应正文/计划；开关状态持久化。
- [ ] Agent 新建章节/计划时前端始终能显示绿增红减审查（含全绿新建场景）。
- [ ] 一键审查条位于输入框上方，无遮挡冲突。
- [ ] 正文编辑约 0.8s 内自动保存；失焦与切章即时保存。
- [ ] 个人中心书架/创作/收藏显示真实作品名；个人封面不再回退为作品封面。
- [ ] 设置页为分区卡片布局。
- [ ] 侧栏收起时悬停头像出现用户信息浮层（头像+昵称+四按钮）。
- [ ] Profile/PostDetail/Studio/Settings/作品下拉全部为骨架屏加载；创作区首屏请求数 ≤2，二次进入命中缓存秒开。
- [ ] 消息已读、帖子点赞/收藏、评论点赞/回复、阅读页发表评论全部真实落库可用。
