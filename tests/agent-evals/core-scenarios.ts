export type AgentCoreEvalScenario = {
  id: string
  category:
    | 'global_change'
    | 'story_memory'
    | 'directive_retention'
    | 'structure_consistency'
    | 'creative_quality'
    | 'volume_model'
    | 'workspace_continuity'
  title: string
  fixture: string
  prompt: string
  requiredChecks: string[]
}

/** 1.0/2.0 必须使用同一输入重复执行，模型、温度、代码 SHA 与数据集版本随结果记录。 */
export const AGENT_CORE_EVAL_SCENARIOS: AgentCoreEvalScenario[] = [
  {
    id: 'EVAL-001',
    category: 'global_change',
    title: '30 章人物全局改名',
    fixture: '30 章中旧名 47 处、同形非人物词 3 处、别名 2 个',
    prompt: '将人物“林舟”改名为“林川”，保留历史引语中的旧称并给出全部修改依据。',
    requiredChecks: ['47 处目标召回', '3 处同形词零误改', '可预览', '可整体回滚'],
  },
  {
    id: 'EVAL-002',
    category: 'story_memory',
    title: '跨 80 章人物状态召回',
    fixture: '人物关系、伤势、持有物分别在第 3/27/61 章变化',
    prompt: '规划第 81 章，并明确人物当前关系、伤势和持有物的证据来源。',
    requiredChecks: ['当前状态全对', '过期状态不混入', '每项结论可追溯'],
  },
  {
    id: 'EVAL-003',
    category: 'directive_retention',
    title: '200 轮对话硬约束保真',
    fixture: '两次上下文压缩；包含 12 条有效要求、3 条已撤销要求',
    prompt: '继续写下一场，严格遵守仍生效要求。',
    requiredChecks: ['12 条有效要求全部遵守', '3 条已撤销要求不再生效', '冲突要求显式说明'],
  },
  {
    id: 'EVAL-004',
    category: 'structure_consistency',
    title: '中间插章后的结构一致性',
    fixture: '三卷 36 章，在第二卷第 7 章前插入新章',
    prompt: '补写追逐场景并插入指定位置，完成后检查标题、顺序、摘要和引用。',
    requiredChecks: ['卷章顺序连续唯一', '显示编号正确', '受影响标题摘要同步', '结构校验通过'],
  },
  {
    id: 'EVAL-005',
    category: 'creative_quality',
    title: '去公式化盲评',
    fixture: '同一情节提供作者样章与禁用套路列表',
    prompt: '写一段 1500 字冲突场景，保持作者声音但避免复制样章表达。',
    requiredChecks: ['人物声音一致', '套路命中率低', '情节新鲜度达标', '无样章复写'],
  },
  {
    id: 'EVAL-006',
    category: 'volume_model',
    title: '卷章创建移动与导出',
    fixture: '五卷 100 章，包含空卷、跨卷移动和卷删除尝试',
    prompt: '重组第三、四卷并导出，禁止删除非空卷。',
    requiredChecks: ['非空卷删除被阻止', '跨卷移动原子完成', '导出顺序与 UI 一致'],
  },
  {
    id: 'EVAL-007',
    category: 'workspace_continuity',
    title: 'Work/IDE/移动端状态连续性',
    fixture: '运行中任务、未发送输入、正文选区、待审变更集各一份',
    prompt: '在 Work 发起任务，切换 IDE 编辑，再返回 Work 并从 APP 后台恢复。',
    requiredChecks: ['Session/Run 不丢', '光标选区不丢', '待审状态不丢', '无重复写入'],
  },
]
