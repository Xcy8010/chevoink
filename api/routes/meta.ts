import { randomUUID } from 'node:crypto'
import { Router, type Request, type Response } from 'express'

import { env } from '../config/env.js'
import { getSessionUserId } from '../lib/auth-session.js'
import { resolveAgent2FeatureFlags } from '../lib/agent2-feature-flags.js'

const router = Router()

router.get('/', (req: Request, res: Response) => {
  res.status(200).json({
    success: true,
    data: {
      appName: env.appName,
      appEnv: env.appEnv,
      webUrl: env.webUrl,
                                                                                                 serverUrl: env.serverUrl,
      stage: env.appEnv,
      modules: ['discover', 'reader', 'studio', 'community', 'messages', 'profile'],
      agent2: resolveAgent2FeatureFlags(getSessionUserId(req)),
    },
    requestId: randomUUID(),
  })
})

export default router
