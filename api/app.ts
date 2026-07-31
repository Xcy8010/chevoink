import express, {
  type Request,
  type Response,
  type NextFunction,
} from 'express'
import cors from 'cors'
import agentRoutes from './routes/agent.js'
import aiRoutes from './routes/ai.js'
import authRoutes from './routes/auth.js'
import commentsRoutes from './routes/comments.js'
import conversationsRoutes from './routes/conversations.js'
import homeRoutes from './routes/home.js'
import metaRoutes from './routes/meta.js'
import novelsRoutes from './routes/novels.js'
import postsRoutes from './routes/posts.js'
import searchRoutes from './routes/search.js'
import topicsRoutes from './routes/topics.js'
import usersRoutes from './routes/users.js'
import { env } from './config/env.js'
import { getUploadsStaticDirectory } from './lib/avatar-storage.js'

const app: express.Application = express()

app.use(
  cors({
    origin: env.webUrl,
    credentials: true,
  }),
)
// 发帖最多 9 张 base64 配图，预留到 40mb
app.use(express.json({ limit: '40mb' }))
app.use(express.urlencoded({ extended: true, limit: '40mb' }))
app.use('/api/uploads', express.static(getUploadsStaticDirectory(), { fallthrough: false }))

app.use('/api/agent', agentRoutes)
app.use('/api/ai', aiRoutes)
app.use('/api/auth', authRoutes)
app.use('/api/comments', commentsRoutes)
app.use('/api/conversations', conversationsRoutes)
app.use('/api/home', homeRoutes)
app.use('/api/meta', metaRoutes)
app.use('/api/novels', novelsRoutes)
app.use('/api/posts', postsRoutes)
app.use('/api/search', searchRoutes)
app.use('/api/topics', topicsRoutes)
app.use('/api/users', usersRoutes)

app.get('/api/health', (_req: Request, res: Response): void => {
  res.status(200).json({
    success: true,
    data: {
      status: 'ok',
      appName: env.appName,
      appEnv: env.appEnv,
    },
  })
})

app.use((error: Error, _req: Request, res: Response, _next: NextFunction) => {
  res.status(500).json({
    success: false,
    error: {
      code: 'INTERNAL_SERVER_ERROR',
      message: error.message || '服务端内部错误',
    },
  })
})

app.use((req: Request, res: Response) => {
  res.status(404).json({
    success: false,
    error: {
      code: 'NOT_FOUND',
      message: `未找到接口 ${req.method} ${req.originalUrl}`,
    },
  })
})

export default app
