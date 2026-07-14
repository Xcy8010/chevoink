import type {
  AgentExecutionMode,
  AgentWorkspaceToolName,
  AgentWorkspaceToolPermission,
  AgentWorkspaceToolPolicy,
} from '../../shared/contracts/index.js'

type WorkspaceToolRecord = {
  toolName: AgentWorkspaceToolName
  title: string
  description: string
  permissions: Record<AgentExecutionMode, AgentWorkspaceToolPermission>
}

const workspaceToolRegistry: WorkspaceToolRecord[] = [
  {
    toolName: 'novel.rename',
    title: '命名作品',
    description: '修改当前作品标题。',
    permissions: { plan: 'ask', build: 'allow', review: 'deny' },
  },
  {
    toolName: 'chapter.rename',
    title: '命名章节',
    description: '修改当前章节标题。',
    permissions: { plan: 'ask', build: 'allow', review: 'deny' },
  },
  {
    toolName: 'chapter.create',
    title: '新建章节',
    description: '创建新章节并写入正文。',
    permissions: { plan: 'ask', build: 'allow', review: 'deny' },
  },
  {
    toolName: 'chapter.write',
    title: '覆盖正文',
    description: '直接写入当前章节正文。',
    permissions: { plan: 'ask', build: 'allow', review: 'deny' },
  },
  {
    toolName: 'chapter.append',
    title: '追加正文',
    description: '把生成内容追加到当前章节。',
    permissions: { plan: 'ask', build: 'allow', review: 'deny' },
  },
  {
    toolName: 'novel.update_meta',
    title: '修改作品设置',
    description: '更新作品摘要、标签和可见范围。',
    permissions: { plan: 'ask', build: 'allow', review: 'deny' },
  },
  {
    toolName: 'novel.publish',
    title: '发布作品',
    description: '把作品切换到公开发布状态。',
    permissions: { plan: 'ask', build: 'ask', review: 'deny' },
  },
  {
    toolName: 'novel.archive',
    title: '下架作品',
    description: '把作品切换到已下架状态。',
    permissions: { plan: 'ask', build: 'ask', review: 'deny' },
  },
  {
    toolName: 'novel.delete',
    title: '删除作品',
    description: '彻底删除当前作品及关联数据。',
    permissions: { plan: 'ask', build: 'ask', review: 'deny' },
  },
  {
    toolName: 'cover.prompt.set',
    title: '设置封面提示词',
    description: '把封面提示词写回当前作品。',
    permissions: { plan: 'ask', build: 'allow', review: 'deny' },
  },
  {
    toolName: 'workspace.open_meta',
    title: '打开作品设置',
    description: '展开作品设置面板或弹窗。',
    permissions: { plan: 'allow', build: 'allow', review: 'allow' },
  },
  {
    toolName: 'workspace.open_cover',
    title: '打开封面面板',
    description: '展开封面设置或生成面板。',
    permissions: { plan: 'allow', build: 'allow', review: 'allow' },
  },
]

export function getWorkspaceToolDefinition(toolName: AgentWorkspaceToolName) {
  return workspaceToolRegistry.find((tool) => tool.toolName === toolName) ?? null
}

export function resolveWorkspaceToolPermission(
  mode: AgentExecutionMode,
  toolName: AgentWorkspaceToolName,
): AgentWorkspaceToolPermission {
  return getWorkspaceToolDefinition(toolName)?.permissions[mode] ?? 'deny'
}

export function buildWorkspaceToolPolicy(mode: AgentExecutionMode): AgentWorkspaceToolPolicy {
  return {
    mode,
    tools: workspaceToolRegistry.map((tool) => ({
      toolName: tool.toolName,
      title: tool.title,
      description: tool.description,
      permission: tool.permissions[mode],
    })),
  }
}
