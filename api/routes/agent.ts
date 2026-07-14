import { Router, type Request, type Response } from 'express'

import type {
  ApplyAgentArtifactRequest,
  ContinueChapterRequest,
  CreateAgentRunRequest,
  CreateAgentSessionRequest,
  DraftChapterRequest,
  ExecuteWorkspaceAgentRequest,
  GenerateAgentCoverPromptRequest,
  PlanChapterRequest,
  PolishSelectionRequest,
  ReviewContinuityRequest,
  RewriteSelectionRequest,
} from '../../shared/contracts/index.js'
import { requireSessionUserId } from '../lib/auth-session.js'
import {
  applyAgentArtifactData,
  createAgentRunData,
  createAgentSessionData,
  deleteAgentRunData,
  executeAgentActionData,
  executeWorkspaceAgentData,
  getAgentRunData,
  listAgentArtifactsData,
  listAgentSessionHistoryData,
  listAgentSessionsData,
  rollbackAgentRunData,
  streamAgentRunData,
} from '../lib/agent-service.js'
import { buildError, buildSuccess, createRequestId } from '../lib/http.js'
import { sendRouteError } from '../lib/route-error.js'

const router = Router()

function writeSse(res: Response, event: string, payload: unknown) {
  res.write(`event: ${event}\n`)
  res.write(`data: ${JSON.stringify(payload)}\n\n`)
  ;(res as Response & { flush?: () => void }).flush?.()
}

router.get('/sessions', async (req: Request, res: Response): Promise<void> => {
  const requestId = createRequestId()

  try {
    const userId = requireSessionUserId(req)
    const novelId = typeof req.query.novelId === 'string' ? req.query.novelId : undefined
    const payload = await listAgentSessionsData(userId, novelId)
    res.status(200).json(buildSuccess(requestId, payload))
  } catch (error) {
    sendRouteError(res, requestId, error)
  }
})

router.post('/sessions', async (req: Request, res: Response): Promise<void> => {
  const requestId = createRequestId()
  const body = (req.body ?? {}) as Partial<CreateAgentSessionRequest>

  try {
    const userId = requireSessionUserId(req)
    if (!body.novelId) {
      res.status(400).json(buildError(requestId, 'VALIDATION_ERROR', '请提供作品 ID。'))
      return
    }

    const payload = await createAgentSessionData(userId, {
      novelId: body.novelId,
      title: body.title,
    })
    res.status(201).json(buildSuccess(requestId, payload))
  } catch (error) {
    sendRouteError(res, requestId, error)
  }
})

router.get('/sessions/:sessionId/history', async (req: Request, res: Response): Promise<void> => {
  const requestId = createRequestId()

  try {
    const userId = requireSessionUserId(req)
    const payload = await listAgentSessionHistoryData(userId, req.params.sessionId)
    res.status(200).json(buildSuccess(requestId, payload))
  } catch (error) {
    sendRouteError(res, requestId, error)
  }
})

router.post('/runs', async (req: Request, res: Response): Promise<void> => {
  const requestId = createRequestId()
  const body = (req.body ?? {}) as Partial<CreateAgentRunRequest>

  try {
    const userId = requireSessionUserId(req)
    if (!body.sessionId || !body.action || !body.mode || !body.prompt?.trim()) {
      res.status(400).json(buildError(requestId, 'VALIDATION_ERROR', '请完整填写运行参数。'))
      return
    }

    const payload = await createAgentRunData(userId, {
      sessionId: body.sessionId,
      chapterId: body.chapterId,
      mode: body.mode,
      action: body.action,
      prompt: body.prompt.trim(),
      selectedText: body.selectedText,
      metadata: body.metadata,
      runtimeContext: body.runtimeContext,
    })

    res.status(200).json(buildSuccess(requestId, payload))
  } catch (error) {
    sendRouteError(res, requestId, error)
  }
})

router.get('/runs/:runId', async (req: Request, res: Response): Promise<void> => {
  const requestId = createRequestId()

  try {
    const userId = requireSessionUserId(req)
    const payload = await getAgentRunData(userId, req.params.runId)
    res.status(200).json(buildSuccess(requestId, payload))
  } catch (error) {
    sendRouteError(res, requestId, error)
  }
})

router.get('/runs/:runId/stream', async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = requireSessionUserId(req)
    const events = await streamAgentRunData(userId, req.params.runId)

    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
    })

    for (const event of events) {
      writeSse(res, String(event.stage ?? 'message'), event)
    }

    res.end()
  } catch (error) {
    const requestId = createRequestId()
    sendRouteError(res, requestId, error)
  }
})

router.get('/runs/:runId/artifacts', async (req: Request, res: Response): Promise<void> => {
  const requestId = createRequestId()

  try {
    const userId = requireSessionUserId(req)
    const payload = await listAgentArtifactsData(userId, req.params.runId)
    res.status(200).json(buildSuccess(requestId, payload))
  } catch (error) {
    sendRouteError(res, requestId, error)
  }
})

router.delete('/runs/:runId', async (req: Request, res: Response): Promise<void> => {
  const requestId = createRequestId()

  try {
    const userId = requireSessionUserId(req)
    const payload = await deleteAgentRunData(userId, req.params.runId)
    res.status(200).json(buildSuccess(requestId, payload))
  } catch (error) {
    sendRouteError(res, requestId, error)
  }
})

router.post('/runs/:runId/rollback', async (req: Request, res: Response): Promise<void> => {
  const requestId = createRequestId()

  try {
    const userId = requireSessionUserId(req)
    const payload = await rollbackAgentRunData(userId, req.params.runId)
    res.status(200).json(buildSuccess(requestId, payload))
  } catch (error) {
    sendRouteError(res, requestId, error)
  }
})

router.post('/artifacts/:artifactId/apply', async (req: Request, res: Response): Promise<void> => {
  const requestId = createRequestId()
  const body = (req.body ?? {}) as Partial<ApplyAgentArtifactRequest>

  try {
    const userId = requireSessionUserId(req)
    const payload = await applyAgentArtifactData(userId, req.params.artifactId, {
      strategy: body.strategy,
      chapterId: body.chapterId,
    })
    res.status(200).json(buildSuccess(requestId, payload))
  } catch (error) {
    sendRouteError(res, requestId, error)
  }
})

router.post('/actions/plan-chapter', async (req: Request, res: Response): Promise<void> => {
  const requestId = createRequestId()
  const body = (req.body ?? {}) as Partial<PlanChapterRequest>

  try {
    const userId = requireSessionUserId(req)
    if (!body.novelId || !body.prompt?.trim()) {
      res.status(400).json(buildError(requestId, 'VALIDATION_ERROR', '请提供作品 ID 和任务说明。'))
      return
    }

    const payload = await executeAgentActionData(userId, {
      kind: 'planChapter',
      novelId: body.novelId,
      sessionId: body.sessionId,
      chapterId: body.chapterId,
      title: body.title,
      prompt: body.prompt.trim(),
    })

    res.status(200).json(buildSuccess(requestId, payload))
  } catch (error) {
    sendRouteError(res, requestId, error)
  }
})

router.post('/actions/draft-chapter', async (req: Request, res: Response): Promise<void> => {
  const requestId = createRequestId()
  const body = (req.body ?? {}) as Partial<DraftChapterRequest>

  try {
    const userId = requireSessionUserId(req)
    if (!body.novelId || !body.prompt?.trim()) {
      res.status(400).json(buildError(requestId, 'VALIDATION_ERROR', '请提供作品 ID 和任务说明。'))
      return
    }

    const payload = await executeAgentActionData(userId, {
      kind: 'draftChapter',
      novelId: body.novelId,
      sessionId: body.sessionId,
      chapterId: body.chapterId,
      title: body.title,
      prompt: body.prompt.trim(),
      selectedText: body.selectedText,
      novelTitle: body.novelTitle,
      novelSummary: body.novelSummary,
      chapterTitle: body.chapterTitle,
      chapterSummary: body.chapterSummary,
      chapterContent: body.chapterContent,
      genre: body.genre,
      protagonist: body.protagonist,
      tone: body.tone,
      stylePreference: body.stylePreference,
    })

    res.status(200).json(buildSuccess(requestId, payload))
  } catch (error) {
    sendRouteError(res, requestId, error)
  }
})

router.post('/actions/continue-chapter', async (req: Request, res: Response): Promise<void> => {
  const requestId = createRequestId()
  const body = (req.body ?? {}) as Partial<ContinueChapterRequest>

  try {
    const userId = requireSessionUserId(req)
    if (!body.novelId) {
      res.status(400).json(buildError(requestId, 'VALIDATION_ERROR', '请提供作品 ID。'))
      return
    }

    const payload = await executeAgentActionData(userId, {
      kind: 'continueChapter',
      novelId: body.novelId,
      sessionId: body.sessionId,
      chapterId: body.chapterId,
      title: body.title,
      prompt: body.prompt,
      novelTitle: body.novelTitle,
      novelSummary: body.novelSummary,
      chapterTitle: body.chapterTitle,
      chapterSummary: body.chapterSummary,
      chapterContent: body.chapterContent,
      genre: body.genre,
      protagonist: body.protagonist,
      tone: body.tone,
      stylePreference: body.stylePreference,
    })

    res.status(200).json(buildSuccess(requestId, payload))
  } catch (error) {
    sendRouteError(res, requestId, error)
  }
})

router.post('/actions/rewrite-selection', async (req: Request, res: Response): Promise<void> => {
  const requestId = createRequestId()
  const body = (req.body ?? {}) as Partial<RewriteSelectionRequest>

  try {
    const userId = requireSessionUserId(req)
    if (!body.novelId || !body.chapterId || !body.selectedText?.trim() || !body.instruction?.trim()) {
      res.status(400).json(buildError(requestId, 'VALIDATION_ERROR', '请提供完整的改写参数。'))
      return
    }

    const payload = await executeAgentActionData(userId, {
      kind: 'rewriteSelection',
      novelId: body.novelId,
      sessionId: body.sessionId,
      chapterId: body.chapterId,
      selectedText: body.selectedText.trim(),
      instruction: body.instruction.trim(),
      novelTitle: body.novelTitle,
      novelSummary: body.novelSummary,
      chapterTitle: body.chapterTitle,
      chapterSummary: body.chapterSummary,
      chapterContent: body.chapterContent,
      genre: body.genre,
      protagonist: body.protagonist,
      tone: body.tone,
      stylePreference: body.stylePreference,
    })

    res.status(200).json(buildSuccess(requestId, payload))
  } catch (error) {
    sendRouteError(res, requestId, error)
  }
})

router.post('/actions/polish-selection', async (req: Request, res: Response): Promise<void> => {
  const requestId = createRequestId()
  const body = (req.body ?? {}) as Partial<PolishSelectionRequest>

  try {
    const userId = requireSessionUserId(req)
    if (!body.novelId || !body.chapterId || !body.selectedText?.trim()) {
      res.status(400).json(buildError(requestId, 'VALIDATION_ERROR', '请提供完整的润色参数。'))
      return
    }

    const payload = await executeAgentActionData(userId, {
      kind: 'polishSelection',
      novelId: body.novelId,
      sessionId: body.sessionId,
      chapterId: body.chapterId,
      selectedText: body.selectedText.trim(),
      prompt: body.prompt,
      instruction: body.instruction,
      novelTitle: body.novelTitle,
      novelSummary: body.novelSummary,
      chapterTitle: body.chapterTitle,
      chapterSummary: body.chapterSummary,
      chapterContent: body.chapterContent,
      genre: body.genre,
      protagonist: body.protagonist,
      tone: body.tone,
      stylePreference: body.stylePreference,
    })

    res.status(200).json(buildSuccess(requestId, payload))
  } catch (error) {
    sendRouteError(res, requestId, error)
  }
})

router.post('/actions/review-continuity', async (req: Request, res: Response): Promise<void> => {
  const requestId = createRequestId()
  const body = (req.body ?? {}) as Partial<ReviewContinuityRequest>

  try {
    const userId = requireSessionUserId(req)
    if (!body.novelId || !body.prompt?.trim()) {
      res.status(400).json(buildError(requestId, 'VALIDATION_ERROR', '请提供作品 ID 和审查要求。'))
      return
    }

    const payload = await executeAgentActionData(userId, {
      kind: 'reviewContinuity',
      novelId: body.novelId,
      sessionId: body.sessionId,
      chapterId: body.chapterId,
      prompt: body.prompt.trim(),
      novelTitle: body.novelTitle,
      novelSummary: body.novelSummary,
      chapterTitle: body.chapterTitle,
      chapterSummary: body.chapterSummary,
      chapterContent: body.chapterContent,
      genre: body.genre,
      protagonist: body.protagonist,
      tone: body.tone,
      stylePreference: body.stylePreference,
    })

    res.status(200).json(buildSuccess(requestId, payload))
  } catch (error) {
    sendRouteError(res, requestId, error)
  }
})

router.post('/actions/generate-cover-prompt', async (req: Request, res: Response): Promise<void> => {
  const requestId = createRequestId()
  const body = (req.body ?? {}) as Partial<GenerateAgentCoverPromptRequest>

  try {
    const userId = requireSessionUserId(req)
    if (!body.novelId) {
      res.status(400).json(buildError(requestId, 'VALIDATION_ERROR', '请提供作品 ID。'))
      return
    }

    const payload = await executeAgentActionData(userId, {
      kind: 'generateCoverPrompt',
      novelId: body.novelId,
      sessionId: body.sessionId,
      chapterId: body.chapterId,
      prompt: body.prompt,
      novelTitle: body.novelTitle,
      novelSummary: body.novelSummary,
      chapterTitle: body.chapterTitle,
      chapterSummary: body.chapterSummary,
      chapterContent: body.chapterContent,
      genre: body.genre,
      protagonist: body.protagonist,
      tone: body.tone,
      stylePreference: body.stylePreference,
    })

    res.status(200).json(buildSuccess(requestId, payload))
  } catch (error) {
    sendRouteError(res, requestId, error)
  }
})

router.post('/actions/execute', async (req: Request, res: Response): Promise<void> => {
  const requestId = createRequestId()
  const body = (req.body ?? {}) as Partial<ExecuteWorkspaceAgentRequest>

  try {
    const userId = requireSessionUserId(req)
    if (!body.novelId || !body.prompt?.trim()) {
      res.status(400).json(buildError(requestId, 'VALIDATION_ERROR', '请提供作品 ID 和 Agent 指令。'))
      return
    }

    const acceptsEventStream = String(req.headers.accept ?? '').includes('text/event-stream')

    if (acceptsEventStream) {
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache, no-transform',
        Connection: 'keep-alive',
        'X-Accel-Buffering': 'no',
      })
      res.flushHeaders?.()
    }

    const payload = await executeWorkspaceAgentData(userId, {
      novelId: body.novelId,
      sessionId: body.sessionId,
      chapterId: body.chapterId,
      prompt: body.prompt.trim(),
      selectedText: body.selectedText,
      actionHint: body.actionHint,
      novelTitle: body.novelTitle,
      novelSummary: body.novelSummary,
      chapterTitle: body.chapterTitle,
      chapterSummary: body.chapterSummary,
      chapterContent: body.chapterContent,
      genre: body.genre,
      protagonist: body.protagonist,
      tone: body.tone,
      stylePreference: body.stylePreference,
    }, acceptsEventStream
      ? {
          onProgress: (event) => {
            writeSse(res, String(event.stage ?? 'status'), {
              type: event.type ?? 'status',
              stage: event.stage,
              message: event.message,
              runId: event.runId ?? null,
              createdAt: event.createdAt,
              data: event.data ?? {},
            })
          },
        }
      : undefined)

    if (acceptsEventStream) {
      writeSse(res, 'result', {
        type: 'result',
        ...payload,
      })
      writeSse(res, 'done', {
        type: 'done',
      })
      res.end()
      return
    }

    res.status(200).json(buildSuccess(requestId, payload))
  } catch (error) {
    sendRouteError(res, requestId, error)
  }
})

export default router
