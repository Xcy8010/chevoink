/**
 * 创作区任务窗状态类型
 * 由 StudioWorkspace.tsx 模块级拆分而来（声明顺序与原文件一致）。
 */
import type { AgentArtifact } from '../types'


export type AgentTaskWindowState = {
  id: string
  sessionId: string | null
  title: string
  prompt: string
  artifacts: AgentArtifact[]
  activeArtifactId: string | null
  loaded: boolean
  temporary: boolean
  customNamed: boolean
  firstPromptSubmitted: boolean
  createdAt: string
  updatedAt: string
}



export type StoredAgentTaskWindowSnapshot = {
  id: string
  sessionId: string | null
  title: string
  prompt: string
  artifacts: AgentArtifact[]
  activeArtifactId: string | null
  loaded: boolean
  temporary: boolean
  customNamed: boolean
  firstPromptSubmitted: boolean
  createdAt: string
  updatedAt: string
}



export type StoredAgentWorkspaceSnapshot = {
  tasks: StoredAgentTaskWindowSnapshot[]
  activeTaskId: string | null
  selectedTreeItemId?: string | null
  catalogDocument?: {
    title: string
    content: string
    manualTitle: boolean
    manualContent: boolean
  } | null
}
