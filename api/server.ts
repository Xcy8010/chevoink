import app from './app.js'
import { env } from './config/env.js'
import { recoverOrphanLoopRuns } from './lib/agent/run-service.js'

const server = app.listen(env.port, () => {
  console.log(`[chevoink] server ready on ${env.serverUrl}`)
  // 上一个进程被杀（部署 reload/崩溃）时遗留的进行中 Agent 任务统一收尾
  void recoverOrphanLoopRuns()
})

process.on('SIGTERM', () => {
  console.log('SIGTERM signal received')
  server.close(() => {
    console.log('Server closed')
    process.exit(0)
  })
})

process.on('SIGINT', () => {
  console.log('SIGINT signal received')
  server.close(() => {
    console.log('Server closed')
    process.exit(0)
  })
})

export default app
