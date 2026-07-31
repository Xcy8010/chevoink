import { randomUUID } from 'node:crypto'
import { Router, type Request, type Response } from 'express'

import { env } from '../config/env.js'

const router = Router()

router.get('/', (_req: Request, res: Response) => {
  res.status(200).json({
    success: true,
    data: {
      appName: env.appName,
      appEnv: env.appEnv,
      webUrl: env.webUrl,
                                                                                                 serverUrl: env.serverUrl,
      stage: env.appEnv,
      modules: ['discover', 'reader', 'studio', 'community', 'messages', 'profile'],
    },
    requestId: randomUUID(),
  })
})

export default router
