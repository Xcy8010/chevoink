import type { Dispatch, SetStateAction } from 'react'
import { createNovelPlanFile, updateNovelPlanFile } from '../api'
import { buildServerPlanFile } from '../lib/plan-review'
import type { AgentArtifact, AgentRunState, MobileView, SaveState, WorkspacePlanFile } from '../types'

type PlanDocumentActions = {
  activeNovelId: string
  savedPlanFiles: WorkspacePlanFile[]
  agentArtifacts: AgentArtifact[]
  selectedTreeItemId: string | null
  catalogPreview: { title: string; content: string }
  setSelectedTreeItemId: Dispatch<SetStateAction<string | null>>
  setWorkViewer: Dispatch<SetStateAction<'chapter' | 'document' | null>>
  setMobileView: Dispatch<SetStateAction<MobileView>>
  setActiveAgentArtifactId: Dispatch<SetStateAction<string | null>>
  setAgentArtifacts: Dispatch<SetStateAction<AgentArtifact[]>>
  setServerPlanFiles: Dispatch<SetStateAction<WorkspacePlanFile[]>>
  setChapterSaveState: Dispatch<SetStateAction<SaveState>>
  setChapterSaveMessage: Dispatch<SetStateAction<string>>
  setAgentRunState: Dispatch<SetStateAction<AgentRunState>>
  setWorkspaceDialog: (dialog: { title: string; description: string; confirmLabel?: string; cancelLabel?: string; tone?: 'default' | 'danger'; onConfirm: () => void | Promise<void> }) => void
  setCatalogDocument: Dispatch<SetStateAction<{ title: string; content: string; manualTitle: boolean; manualContent: boolean } | null>>
  updateAgentArtifact: (id: string, updater: (current: AgentArtifact) => AgentArtifact) => void
  schedulePlanServerSync: (artifactId: string, title: string, content: string) => void
}

/** Plan/catalog editing and confirmations. Does not own the editor's current chapter. */
export function createPlanDocumentActions({
  activeNovelId, savedPlanFiles, agentArtifacts, selectedTreeItemId, catalogPreview, setSelectedTreeItemId, setWorkViewer, setMobileView, setActiveAgentArtifactId, setAgentArtifacts, setServerPlanFiles, setChapterSaveState, setChapterSaveMessage, setAgentRunState, setWorkspaceDialog, setCatalogDocument, updateAgentArtifact, schedulePlanServerSync,
}: PlanDocumentActions) {
  function handleSelectPlanFromTree(planId: string) {
    const artifactId = savedPlanFiles.find(plan => plan.id === planId)?.artifactId ?? planId
    setSelectedTreeItemId(`plan:${planId}`)
    setWorkViewer('document')
    if (agentArtifacts.some((artifact) => artifact.id === artifactId)) {
      setActiveAgentArtifactId(artifactId)
    }
    setMobileView('editor')
  }

  function handleRequestDeletePlan(planId: string) {
    const targetPlan = savedPlanFiles.find((plan) => plan.id === planId)

    if (!targetPlan) {
      return
    }

    const targetArtifact =
      agentArtifacts.find((artifact) => artifact.id === targetPlan.artifactId && artifact.savedAsPlan) ?? null
    const planTitle = targetPlan.title.trim() || '这份计划'
    if (targetArtifact) {
      setActiveAgentArtifactId(targetArtifact.id)
    }

    setWorkspaceDialog({
      title: '确认删除这份计划',
      description: `删除后，“${planTitle}”会从左侧计划文件夹移除，但不会影响这轮 Agent 对话记录。`,
      confirmLabel: '确认删除',
      cancelLabel: '取消',
      tone: 'danger',
      onConfirm: async () => {
        if (targetArtifact) {
          setAgentArtifacts((current) =>
            current.map((artifact) =>
              artifact.id === targetArtifact.id
                ? {
                    ...artifact,
                    savedAsPlan: false,
                  }
                : artifact,
            ),
          )
        }
        setServerPlanFiles((current) =>
          current.filter((plan) =>
            targetPlan.backendArtifactId
              ? plan.backendArtifactId !== targetPlan.backendArtifactId
              : plan.id !== planId,
          ),
        )
        // 同步云端标记，刷新后不再出现在计划文件夹
        if (targetPlan.backendArtifactId) {
          try {
            await updateNovelPlanFile(targetPlan.backendArtifactId, { saved: false })
          } catch {
            /* 云端同步失败时本地已移除，刷新后可重新删除 */
          }
        }
        setChapterSaveState('saved')
        setChapterSaveMessage('这份计划已从计划文件夹移除。')
        setAgentRunState((current) => ({
          ...current,
          statusText: '已删除这份计划。',
        }))
      },
    })
  }

  /** 手工新建空白计划：落到云端后直接选中，作者可在编辑区改名/补充内容 */
  async function handleCreatePlanFile() {
    setChapterSaveState('saving')
    setChapterSaveMessage('正在新建计划...')

    try {
      const item = await createNovelPlanFile(activeNovelId)
      const nextPlan = buildServerPlanFile(item)
      setServerPlanFiles((current) => [...current, nextPlan])
      setSelectedTreeItemId(`plan:${nextPlan.id}`)
      setMobileView('editor')
      setChapterSaveState('saved')
      setChapterSaveMessage('已新建一份空白计划，可直接改名或补充内容。')
    } catch (error) {
      setChapterSaveState('error')
      setChapterSaveMessage(error instanceof Error ? error.message : '新建计划失败，请稍后重试。')
    }
  }

  function handleRequestCreatePlan() {
    setWorkspaceDialog({
      title: '确认新建计划',
      description: '将会在计划文件夹新建一份空白计划，Agent 后续可直接读取它。确定现在新建吗？',
      confirmLabel: '确认新建',
      cancelLabel: '取消',
      tone: 'default',
      onConfirm: async () => {
        await handleCreatePlanFile()
      },
    })
  }

  /** 计划设置面板内改名：本地产物与云端列表同步更新，再去抖 PATCH */
  function handleRenamePlan(planId: string, nextTitle: string) {
    const targetPlan = savedPlanFiles.find((plan) => plan.id === planId)

    if (!targetPlan) {
      return
    }

    updateAgentArtifact(targetPlan.artifactId, (current) => ({
      ...current,
      title: nextTitle.trim() || current.title,
    }))
    setServerPlanFiles((current) =>
      current.map((plan) =>
        plan.id === planId ||
        Boolean(targetPlan.backendArtifactId && plan.backendArtifactId === targetPlan.backendArtifactId)
          ? { ...plan, title: nextTitle.trim() || plan.title }
          : plan,
      ),
    )
    if (targetPlan.backendArtifactId) {
      schedulePlanServerSync(
        targetPlan.backendArtifactId,
        nextTitle.trim() || targetPlan.title,
        targetPlan.content,
      )
    }
    setChapterSaveState('saved')
    setChapterSaveMessage('计划名称已更新。')
  }


  function handleWorkspaceDocumentChange(next: { title: string; content: string }) {
    if (selectedTreeItemId === 'catalog') {
      setCatalogDocument((current) => {
        const fallbackTitle = current?.title ?? catalogPreview.title
        const nextTitle = next.title || fallbackTitle

        return {
          title: nextTitle,
          content: next.content,
          manualTitle: Boolean(nextTitle.trim()) && nextTitle.trim() !== catalogPreview.title,
          manualContent: next.content.trim() !== catalogPreview.content.trim(),
        }
      })
      setChapterSaveState('saved')
      setChapterSaveMessage('目录已更新。')
      return
    }

    if (selectedTreeItemId?.startsWith('plan:')) {
      const artifactId = selectedTreeItemId.slice('plan:'.length)
      const targetPlan = savedPlanFiles.find((plan) => plan.id === artifactId)
      updateAgentArtifact(targetPlan?.artifactId ?? artifactId, (current) => ({
        ...current,
        title: next.title.trim() || current.title,
        content: next.content,
        rawContent: next.content,
      }))
      setServerPlanFiles((current) =>
        current.map((plan) =>
          plan.id === artifactId ||
          Boolean(targetPlan?.backendArtifactId && plan.backendArtifactId === targetPlan.backendArtifactId)
            ? { ...plan, title: next.title.trim() || plan.title, content: next.content }
            : plan,
        ),
      )
      if (targetPlan?.backendArtifactId) {
        schedulePlanServerSync(
          targetPlan.backendArtifactId,
          next.title.trim() || targetPlan.title,
          next.content,
        )
      }
      setChapterSaveState('saved')
      setChapterSaveMessage('创作计划已更新。')
    }
  }
  return { handleSelectPlanFromTree, handleRequestDeletePlan, handleRequestCreatePlan, handleRenamePlan, handleWorkspaceDocumentChange }
}
