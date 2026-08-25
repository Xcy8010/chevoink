import { Router, type Request, type Response } from 'express'

import { applyChangeSetRequestSchema, rollbackChangeSetRequestSchema } from '../../shared/contracts/index.js'
import { requireSessionUserId } from '../lib/auth-session.js'
import { applyChangeSetData, getChangeSetData, rollbackChangeSetData } from '../lib/data-access.js'
import { buildError, buildSuccess, createRequestId } from '../lib/http.js'
import { parseBody } from '../lib/parse-body.js'
import { sendRouteError } from '../lib/route-error.js'
import { requireAgent2Feature } from '../lib/agent2-feature-flags.js'

const router = Router()

router.get('/:changeSetId', async (req: Request, res: Response): Promise<void> => {
  const requestId = createRequestId()
  try {
    const userId = requireSessionUserId(req)
    requireAgent2Feature('changeSet', userId)
    const changeSet = await getChangeSetData(userId, req.params.changeSetId)
    if (!changeSet) {
      res.status(404).json(buildError(requestId, 'CHANGESET_NOT_FOUND', '未找到变更集。'))
      return
    }
    res.status(200).json(buildSuccess(requestId, { changeSet }))
  } catch (error) {
    sendRouteError(res, requestId, error)
  }
})

router.post('/:changeSetId/apply', async (req: Request, res: Response): Promise<void> => {
  const requestId = createRequestId()
  try {
    const userId = requireSessionUserId(req)
    requireAgent2Feature('changeSet', userId)
    const body = parseBody(applyChangeSetRequestSchema, req.body ?? {}, '应用参数不正确。')
    const changeSet = await applyChangeSetData(userId, req.params.changeSetId, body)
    if (!changeSet) {
      res.status(404).json(buildError(requestId, 'CHANGESET_NOT_FOUND', '未找到变更集。'))
      return
    }
    res.status(200).json(buildSuccess(requestId, { changeSet }))
  } catch (error) {
    sendRouteError(res, requestId, error)
  }
})

router.post('/:changeSetId/rollback', async (req: Request, res: Response): Promise<void> => {
  const requestId = createRequestId()
  try {
    const userId = requireSessionUserId(req)
    requireAgent2Feature('changeSet', userId)
    parseBody(rollbackChangeSetRequestSchema, req.body ?? {}, '回滚参数不正确。')
    const changeSet = await rollbackChangeSetData(userId, req.params.changeSetId)
    if (!changeSet) {
      res.status(404).json(buildError(requestId, 'CHANGESET_NOT_FOUND', '未找到变更集。'))
      return
    }
    res.status(200).json(buildSuccess(requestId, { changeSet }))
  } catch (error) {
    sendRouteError(res, requestId, error)
  }
})

export default router
