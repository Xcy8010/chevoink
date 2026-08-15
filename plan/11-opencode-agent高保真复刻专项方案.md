# 启创墨域 `opencode` Agent 高保真复刻专项方案

> 修订记录：2026-07 v1.1 —— 本文 5.1 节“模型直接返回 AgentActionPlan JSON”的产出机制已被
> 《13-创作区Agent深度重构与前端产品级优化方案》修正为“原生 Function Calling 工具循环”（见第 11 节修订说明）。
> 本文其余结论（分层 Agent、权限驱动、handoff、执行导向展示）继续有效，并已并入 13 号方案。

## 1. 文档目标

这份文档只解决一件事：

> 在 `启创墨域` 当前创作工作台内，如何以 **九成把握** 复刻 `opencode` 的 Agent 工作方式，而不是只复刻一个“像聊天框的外壳”。

这里说的“复刻”不是逐行照搬源码，而是尽可能高保真地复刻以下三层能力：

1. `Agent 行为方式`
2. `Agent 工具调度方式`
3. `Agent 对话呈现方式`

同时保持当前项目硬约束不变：

- 所有 AI 调用继续走本地后端
- 真实 Key 继续只放服务端
- 不把产品做成脱离小说工作流的泛编程工具
- 中心目标不是“抄一个 CLI”，而是把 `opencode` 的 Agent 方法论迁移到小说创作场景

---

## 2. 调研结论

这次专项方案参考了 4 类外部资料：

1. `OpenCode` 官方仓库与 README
2. `OpenCode` 官方 Agents 文档
3. `OpenCode` 公开 issue / PR 中暴露出的真实工作流细节
4. `OpenCode` 官方前端应用 `packages/app` 的可见目录说明

调研后可以确认，`opencode` 真正强的不是“会输出代码”，而是下面这套组合：

1. `Primary Agent + Subagent` 分层
2. `Plan / Build` 明确分离
3. `权限系统` 驱动工具访问，而不是单纯 prompt 约束
4. `结构化 handoff`，而不是用户重复解释需求
5. `工具调用优先`，自然语言输出只是执行汇报
6. `对话里展示摘要`，原始结果与内部状态不直接砸给用户
7. `项目上下文选择`、`会话隔离`、`可恢复历史`

这也是为什么单纯“加几个关键词命中规则”不够。  
如果没有 `执行计划 -> 工具调用 -> 状态落库 -> 摘要汇报` 这一整条链，就还不是真正的 `opencode` 风格 Agent。

---

## 3. 基于公开资料可确认的 `opencode` 关键特征

## 3.1 Agent 不是单体，而是分层体系

`opencode` 官方 Agents 文档明确区分了：

- `primary agents`
- `subagents`

并且内置至少有：

- `build`
- `plan`
- `general`
- `explore`
- `scout`

这说明它不是只有一个“大模型人格”，而是 **主对话 Agent + 专用子 Agent** 的体系。

对我们最有价值的结论：

- 写作工作台也必须分层
- “自由聊天”不能等于“自由执行”
- 复杂任务要允许拆给专职 Agent

## 3.2 真正的分界不是 UI Tab，而是权限差异

官方文档里 `plan` 的核心不是名字，而是：

- 文件编辑默认 `ask`
- bash 默认 `ask`

也就是说，`Plan / Build` 的本质是 **权限和工具边界不同**，不是单纯切换一个标签。

迁移到启创墨域后，对应关系应该是：

- `Plan`：只分析，不落正文，不改作品状态
- `Act / Build`：可以真实调用章节、作品、封面接口
- `Review`：可读上下文和历史，但不写正文

## 3.3 `plan_exit` / handoff 是真工作流，不是文案提示

从 `opencode` 官方 issue / PR 可以确认：

- `plan_exit` 是真实工具，不是“请切换模式”的普通文本
- handoff 过程中涉及：
  - 下一个主 Agent 选择
  - synthetic message 注入
  - 模型继承与回退
  - 子 Agent 禁用某些逃逸工具

这说明 `opencode` 的体验之所以顺，不是因为模型“会来事”，而是因为系统提供了 **跨模式交接机制**。

对我们的直接启发：

- 不能只让 Agent 说“我建议你执行”
- 需要一条真正的 `plan -> approve -> execute` 交接链
- 交接后用户不应该重新解释上下文

## 3.4 它的 UI 不是“展示所有产物”，而是“展示任务过程”

`opencode` 的主界面重点不是堆长文本，而是：

- 当前模式
- 当前项目
- 当前会话
- 当前动作
- 工具执行结果
- 最终摘要

所以高保真复刻时，最该学的是：

- 对话里主要显示“做了什么”
- 原始正文 / 原始计划属于可展开结果，不该默认塞满聊天区
- 对用户可见的是 `行动摘要 + 当前状态 + 下一步`

---

## 4. 结合当前项目，什么已经有了

目前启创墨域已经具备了一部分基础，这很重要，因为说明不是从零开始。

## 4.1 已经具备的基础能力

### 对话历史和会话恢复

已经有：

- Agent session / run / artifact / memory 落库
- 重新进入作品后恢复会话历史
- 删除 run 后真实删除历史

### 初步执行能力

已经有：

- 命名作品
- 命名章节
- 写入正文
- 追加正文
- 新建章节并写入

并且这些动作已经能通过前端执行链真实调接口，而不只是输出文本。

### 初步摘要化展示

已经有：

- `rawContent`
- `actionSummary`
- 已执行后对话区优先显示摘要而不是原文

### 会话级目标对齐

已经有：

- 作品级上下文
- 当前章节对齐
- 已选章节兜底

---

## 5. 距离 `opencode` 风格还缺什么

这是本次文档最重要的部分。

## 5.1 还缺统一的“动作规划层”

现在虽然已经能做自动执行，但本质还是：

- 通过 prompt 关键词
- 命中若干前端规则
- 执行本地 if/else 分支

这离 `opencode` 的差别在于：

- 计划不是结构化返回
- 前后端没有统一动作协议
- 很难稳定扩到更多能力

必须补一层：

`AgentActionPlan`

建议结构：

```ts
type AgentActionPlan = {
  mode: 'plan' | 'execute' | 'review'
  summary: string
  steps: Array<{
    id: string
    type:
      | 'rename_novel'
      | 'rename_chapter'
      | 'create_chapter'
      | 'write_chapter'
      | 'append_chapter'
      | 'update_novel_meta'
      | 'publish_novel'
      | 'archive_novel'
      | 'delete_novel'
      | 'open_cover_panel'
      | 'generate_cover_prompt'
    target: {
      novelId?: string
      chapterId?: string
    }
    requiresConfirm: boolean
    payload: Record<string, unknown>
  }>
}
```

核心变化：

- 模型先返回“准备做什么”
- 系统再按 step 调真实接口
- UI 只显示执行摘要

> **2026-07 修订（重要）**：上述“模型一次性返回完整 steps JSON、系统再逐步代执行”的方式，在实际代码中退化成了穷举规则提示词 + `<workspace_plan>` 信封 + 正则解析（诊断见 13 号方案 2.1）。最终执行方案改为：计划不再要求模型一次性输出，而是由原生 `tool_calls` 在多轮循环中逐步“涌现”（执行→观察→修正）；`AgentActionPlan` 保留为计划的**持久化/展示投影**（由系统从工具调用轨迹与 `plan_exit` 参数归纳生成），不再是模型的输出格式契约。这也更接近 opencode 的真实做法——它的计划同样来自工具循环，而非一次性 JSON 信封。

## 5.2 还缺统一的“工具注册表”

`opencode` 的核心不是 prompt 里写死能力，而是工具系统 + 权限系统。

我们现在需要把小说工作台的真实能力收敛成工具层，例如：

- `novel.rename`
- `novel.update_meta`
- `novel.publish`
- `novel.archive`
- `novel.delete`
- `chapter.create`
- `chapter.rename`
- `chapter.write`
- `chapter.append`
- `chapter.summary.update`
- `cover.prompt.set`
- `workspace.open_meta_panel`

然后让 Agent 不直接拼 UI 行为，而是输出工具调用计划。

## 5.3 还缺真正的模式系统

当前项目里虽然已经有：

- `workspace-agent`
- `draft-chapter`
- `continue-chapter`
- `review-continuity`

但这仍偏“任务分类”，还不是 `opencode` 那种真正的主模式。

应该升级成 3 个主模式：

### `Build`

- 允许真实执行工作台接口
- 允许落正文
- 允许修改作品状态

### `Plan`

- 只产出结构化动作计划
- 不真实写正文
- 不真实改状态

### `Review`

- 只读取作品、章节、记忆、历史执行记录
- 输出问题与建议
- 不执行修改

这三个模式要同时影响：

- 后端 prompt
- 工具可用范围
- 前端可见的动作按钮
- 最终摘要文案

## 5.4 还缺真正的 handoff

这是和 `opencode` 最像的一步。

目标效果：

1. 用户说：`先帮我规划这一章怎么写`
2. Agent 在 `Plan` 模式输出结构化计划
3. 用户点击确认执行
4. 系统自动把这份计划交给 `Build`
5. `Build` 不要求用户重说一遍，直接开始执行
6. 执行后回对话摘要

也就是说，不能再是：

- 先规划一段文本
- 用户再重新发一句“那你执行吧”

而要像 `opencode` 那样具备交接连续性。

## 5.5 还缺真正的子 Agent 路由

目前我们更像“一个主 Agent + 一些分支判断”。

而高保真复刻建议至少拆成：

- `workspace-orchestrator`
- `story-planner`
- `draft-writer`
- `continuity-reviewer`
- `style-editor`
- `cover-agent`

其中：

- 主 Agent 只做判断、组装上下文、决定模式、生成动作计划
- 子 Agent 只对自己的能力域负责

这一步很关键，因为 `opencode` 的稳定感很大一部分就来自：

- 小 Agent 关注面更窄
- 任务说明更短
- 工具权限更少
- 结果更可控

## 5.6 还缺“项目级规则文件”注入

`opencode` 很强调：

- agent markdown
- project rules
- config / permissions

启创墨域对应要做的是：

- 作品级写作规则
- 当前小说风格偏好
- 当前人物、世界观、禁改设定
- 当前项目写作约束

建议落地成：

- `Novel Agent Profile`
- `Novel Rule Bundle`
- `Story Memory Digest`

而不是每次把一大段设定重新塞进 prompt。

## 5.7 还缺“动作日志而不是产物日志”

现在我们虽然已经开始显示 `actionSummary`，但还不够彻底。

下一步应该把一次执行记录标准化为：

```ts
type AgentExecutionLog = {
  id: string
  mode: 'plan' | 'build' | 'review'
  summary: string
  steps: Array<{
    label: string
    status: 'pending' | 'running' | 'done' | 'failed'
    detail?: string
  }>
  affectedResources: Array<{
    type: 'novel' | 'chapter' | 'cover' | 'memory'
    id: string
    label: string
  }>
}
```

这样对话区看到的就不再是：

- 大段正文
- 大段中间产物

而是：

- 已命名章节
- 已写入正文
- 已追加 623 字
- 已保存章节摘要

这才像 Agent。

---

## 6. 九成把握复刻成功的前提条件

要把成功率拉到九成，我认为必须同时满足下面 6 个条件：

1. **不追求一比一照抄 OpenCode 的终端产品形态**  
   复刻它的 `Agent 方法`，不是把小说工作台做成 CLI。

2. **前后端都改，不接受只改前端 UI**
   如果没有后端动作计划和权限层，前端再像也是假象。

3. **先做结构化动作，再扩能力数量**
   不先补协议层，能力越多越乱。

4. **把“模式”和“工具权限”绑定**
   否则 Plan / Build 只是两个名字。

5. **把“结果展示”从产物导向改成执行导向**
   否则体验永远像聊天模型，不像 Agent。

6. **接受“90% 高保真”而不是“100% 逐行复制”**
   因为 `opencode` 是代码工作流，我们是小说工作流。  
   能做到的是：
   - 行为方式九成像
   - 交接方式九成像
   - 反馈方式九成像
   - 工具编排九成像  
   但不会也不应该把终端和代码 diff 审查一字不差搬进创作中心。

---

## 7. 面向当前项目的落地路线

> 2026-07 修订：本节 P0~P3 保留为历史思路；正式执行以 13 号方案第 7 节的阶段计划为准（P0 内核替换 → P1 审批/handoff/流式 → P2 记忆与子 Agent → P3 打磨），并按 13 号第 6 节迁移清单验收。

## 7.1 P0：补协议，不再补关键词

目标：

- 后端返回 `AgentActionPlan`
- 前端按 `steps` 执行
- 对话区只看执行摘要

需要改的目录：

- `shared/contracts/`
- `api/lib/agent-service.ts`
- `api/routes/agent.ts`
- `src/features/studio/api.ts`
- `src/features/studio/StudioWorkspace.tsx`
- `src/features/studio/components/WritingAgentPanel.tsx`

完成标准：

- 一句话里多个动作能稳定顺序执行
- 不靠前端关键词表硬撑
- 执行结果不再吐原始正文

## 7.2 P1：补模式与 handoff

目标：

- `Plan`
- `Build`
- `Review`

三种主模式成立，并支持：

- `Plan -> Build` 真交接
- 用户确认后自动执行
- 不要求二次复述

完成标准：

- “先规划再执行”有真实连续性
- 计划文档或结构化计划可以落库
- 执行后可追踪每一步

## 7.3 P2：补子 Agent 与权限矩阵

目标：

- 主控 Agent 只做路由与编排
- 子 Agent 分域执行
- 每个 Agent 绑定有限工具集

完成标准：

- 起书名不再混杂正文生成 prompt
- 审阅 Agent 不会误写正文
- 封面 Agent 不会误调用章节接口

## 7.4 P3：补项目规则与长期记忆

目标：

- 作品级规则注入
- 章节级摘要
- 人物 / 设定 / 时间线记忆
- 记忆回填到计划与执行

完成标准：

- 跨设备、跨章节保持一致性
- 长篇写作不依赖长聊天记录硬撑

---

## 8. 当前项目与 `opencode` 的映射关系

| OpenCode 能力 | 启创墨域对应能力 | 当前状态 | 下一步 |
|---|---|---|---|
| Build agent | 写作执行 Agent | 已有雏形 | 升级为真实工具执行器 |
| Plan agent | 写作规划 Agent | 缺正式模式 | 补结构化计划与 handoff |
| Subagents | Planner / Writer / Reviewer / Cover | 逻辑上已有角色 | 缺真正路由与权限 |
| plan_exit | 计划确认后交接执行 | 缺 | 必做 |
| Tools + permissions | 工作台接口工具层 | 缺统一注册表 | 必做 |
| Project selector | 作品 / 章节上下文选择 | 已有一部分 | 补持久上下文与作用域 |
| Action summary | 执行摘要 | 已有雏形 | 改成标准化执行日志 |
| Session history | Agent 会话历史 | 已有 | 补计划与步骤状态恢复 |

---

## 9. 最终建议

如果目标是“做得像 `opencode` 一样真”，那后面不要再把主力时间花在：

- 加更多关键词
- 微调几句系统提示词
- 调整聊天框文案

而应该集中做这 4 件事：

1. `结构化动作计划`
2. `真实工具注册表`
3. `Plan -> Build handoff`
4. `主 Agent / 子 Agent / 权限矩阵`

只要这 4 件事做对，启创墨域里的 Agent 会明显从：

> “一个能聊也能偶尔帮你改点东西的 AI”

变成：

> “一个先理解任务、再调用工作台能力、最后用摘要向你汇报的真实执行型 Agent”

---

## 10. 参考资料

以下是本专项文档直接参考的主要公开资料：

1. `anomalyco/opencode` 官方仓库  
   https://github.com/anomalyco/opencode

2. `OpenCode Agents` 官方文档  
   https://opencode.ai/docs/en/agents/

3. `OpenCode` 关于 `plan -> build` 自动切换的公开 issue  
   https://github.com/anomalyco/opencode/issues/17428

4. `OpenCode` 关于 `plan_exit` 默认 handoff 到 `build` 的公开 issue  
   https://github.com/anomalyco/opencode/issues/31868

5. `OpenCode` 关于 `plan_exit` 回退逻辑的公开 issue  
   https://github.com/anomalyco/opencode/issues/9822

6. `OpenCode` 关于 `plan_exit` 模型继承问题的公开 PR  
   https://github.com/anomalyco/opencode/pull/29457

7. `OpenCode` 关于子 Agent 禁止调用 `plan_exit` 的公开 PR  
   https://github.com/anomalyco/opencode/pull/27887

8. `packages/app/AGENTS.md` 可见前端结构说明  
   https://github.com/anomalyco/opencode/blob/2e2c3773f0825e28f8a009f3deba3b3db34e1914/packages/app/AGENTS.md

---

## 11. 2026-07 修订说明：从信封计划到原生工具循环

基于对实际代码的逐行调研（诊断证据见 13 号方案第 2 节），本文以下内容需要修正或已被取代：

| 本文原设计 | 修正后（以 13 号方案为准） | 原因 |
|---|---|---|
| 5.1 模型直接返回 `AgentActionPlan` JSON，系统按 steps 代执行 | 原生 function calling 多轮工具循环，计划在执行中涌现；`AgentActionPlan` 降级为展示/持久化投影 | 信封解析脆弱、无自修正能力，实际实现已退化为穷举规则 prompt，被用户与调研双重否定 |
| 5.2 工具注册表（仅列名称） | 升级为 zod Schema + execute + 权限三位一体，并新增读工具与元决策工具（`ask_user`/`todo_write`/`novel_search` 等，见 10 号方案第 19 节） | 无 Schema 则模型不知参数格式，只能靠规则 prompt 描述，循环论证了本文 5.2 的担忧 |
| 5.7 `AgentExecutionLog` 自定义日志结构 | 结构化 SSE 事件协议 + `AgentRunEvent` 全量持久化（live/replay 同源，见 13 号 4.6） | 事件即日志，不需要第二套结构；且消除了 replay 伪造问题 |
| 7 节 P0~P3 路线 | 13 号方案第 7 节阶段计划 + 第 6 节迁移验收清单 | 新路线包含部署形态、并发冲突、计费审计等执行级约束 |

继续有效并已被 13 号方案吸收的结论：主/子 Agent 分层（3.1）、模式即权限边界（3.2）、`plan_exit` 真实 handoff（3.3）、展示任务过程而非产物（3.4）、六个成功前提（第 6 节）。
