import { Router } from 'express'
import { startStyleLearningSchema, changeStyleLearningSchema } from '../../shared/contracts/style-learning.js'
import { requireSessionUserId } from '../lib/auth-session.js'
import { buildSuccess, createRequestId } from '../lib/http.js'
import { parseBody } from '../lib/parse-body.js'
import { sendRouteError } from '../lib/route-error.js'
import { changeStyleLearning, getStyleLearningWorkspace, previewStyleSamples, startStyleLearning } from '../lib/agent/style-learning.js'

const router = Router()
router.get('/novels/:novelId/style-learning', async (req, res) => {
  const requestId = createRequestId()
  try { res.json(buildSuccess(requestId, await getStyleLearningWorkspace(requireSessionUserId(req), req.params.novelId))) }
  catch (error) { sendRouteError(res, requestId, error) }
})
router.get('/novels/:novelId/style-learning/samples/:id', async (req, res) => {
  const requestId = createRequestId()
  try { res.json(buildSuccess(requestId, await previewStyleSamples(requireSessionUserId(req), req.params.novelId, req.params.id))) }
  catch (error) { sendRouteError(res, requestId, error) }
})
router.post('/novels/:novelId/style-learning', async (req, res) => {
  const requestId = createRequestId()
  try { res.status(202).json(buildSuccess(requestId, await startStyleLearning(requireSessionUserId(req), req.params.novelId, parseBody(startStyleLearningSchema, req.body, '请确认模型和样章发送授权。')))) }
  catch (error) { sendRouteError(res, requestId, error) }
})
router.patch('/novels/:novelId/style-learning/:id', async (req, res) => {
  const requestId = createRequestId()
  try { res.json(buildSuccess(requestId, await changeStyleLearning(requireSessionUserId(req), req.params.novelId, req.params.id, parseBody(changeStyleLearningSchema, req.body, '学习操作参数无效。')))) }
  catch (error) { sendRouteError(res, requestId, error) }
})
export default router
