import { describe, expect, it } from 'vitest'

import { isChapterRevisionCurrent } from '../../api/lib/data/chapter-revision.js'
import {
  changeSetSchema,
  memoryEvidenceSchema,
  taskSpecSchema,
  volumeSchema,
} from '../../shared/contracts/index.js'

const now = '2026-08-25T12:00:00.000Z'

describe('Agent 2.0 P0 冻结契约', () => {
  it('TaskSpec 接受可验证任务并补齐软硬约束默认值', () => {
    const task = taskSpecSchema.parse({
      id: 'task-1',
      intent: 'global_transform',
      scope: { novelId: 'novel-1', chapterIds: ['chapter-1'] },
      goals: ['全书人物改名且零遗漏'],
      expectedOutputs: [{ kind: 'changeset', description: '可审阅变更集' }],
      ambiguity: 'none',
      createdAt: now,
    })

    expect(task.hardConstraints).toEqual([])
    expect(task.softPreferences).toEqual([])
    expect(task.expectedOutputs[0].required).toBe(true)
  })

  it('TaskSpec 拒绝反向选区', () => {
    const result = taskSpecSchema.safeParse({
      id: 'task-2',
      intent: 'revise',
      scope: { novelId: 'novel-1', selection: { chapterId: 'chapter-1', start: 10, end: 2 } },
      goals: ['改写选区'],
      expectedOutputs: [{ kind: 'text', description: '改写文本' }],
      ambiguity: 'none',
      createdAt: now,
    })

    expect(result.success).toBe(false)
  })

  it('ChangeSet 要求补丁携带目标版本与修改前哈希', () => {
    const changeSet = changeSetSchema.parse({
      id: 'changeset-1',
      novelId: 'novel-1',
      taskSpecId: 'task-1',
      status: 'draft',
      baseRevision: 7,
      patches: [
        {
          id: 'patch-1',
          targetType: 'chapter',
          targetId: 'chapter-1',
          field: 'content',
          beforeHash: 'sha256:before',
          expectedRevision: 3,
          before: '旧名出现',
          after: '新名出现',
          reason: '人物统一改名',
        },
      ],
      createdAt: now,
      updatedAt: now,
    })

    expect(changeSet.patches[0].selected).toBe(true)
    expect(changeSet.validations).toEqual([])
  })

  it('Volume 与 MemoryEvidence 锁定顺序、版本和证据区间', () => {
    expect(
      volumeSchema.parse({
        id: 'volume-1',
        novelId: 'novel-1',
        title: '第一卷',
        summary: null,
        orderIndex: 1,
        revision: 1,
        createdAt: now,
        updatedAt: now,
      }).orderIndex,
    ).toBe(1)

    expect(
      memoryEvidenceSchema.safeParse({
        id: 'evidence-1',
        memoryId: 'memory-1',
        sourceType: 'chapter',
        sourceId: 'chapter-1',
        revision: 2,
        span: { start: 12, end: 3 },
        confidence: 0.9,
        createdAt: now,
      }).success,
    ).toBe(false)
  })
})

describe('章节 revision 兼容策略', () => {
  it('新客户端严格匹配，旧客户端缺省 expectedRevision 时保持兼容', () => {
    expect(isChapterRevisionCurrent(4, 4)).toBe(true)
    expect(isChapterRevisionCurrent(3, 4)).toBe(false)
    expect(isChapterRevisionCurrent(undefined, 4)).toBe(true)
  })
})
