import app from './app.js'
import { env } from './config/env.js'
import { recoverOrphanLoopRuns } from './lib/agent/run-service.js'
import { runDueAgentSchedules } from './lib/agent/productivity.js'
import { dispatchQueuedRequests } from './lib/agent/request-queue.js'

let recovered = false

// 只绑回环地址：Node 只服务 nginx 反代（127.0.0.1:3001），不直接暴露公网，
// 避免绕过 nginx 的限流/体积限制/安全头；本地开发 vite proxy 同样走 localhost
const server = app.listen(env.port, '127.0.0.1', () => {
  console.log(`[chevoink] server ready on ${env.serverUrl}`)
  // 上一个进程被杀（部署 reload/崩溃）时遗留的进行中 Agent 任务统一收尾
  void recoverOrphanLoopRuns().then(() => { recovered = true })
  void runDueAgentSchedules()
})

const scheduleTimer = setInterval(() => void runDueAgentSchedules(), 60_000)
scheduleTimer.unref()
const queueTimer = setInterval(() => { if (recovered) void dispatchQueuedRequests() }, 2000)
queueTimer.unref()

process.on('SIGTERM', () => {
  clearInterval(queueTimer)
  clearInterval(scheduleTimer)
  console.log('SIGTERM signal received')
  server.close(() => {
    console.log('Server closed')
    process.exit(0)
  })
})

process.on('SIGINT', () => {
  clearInterval(queueTimer)
  clearInterval(scheduleTimer)
  console.log('SIGINT signal received')
  server.close(() => {
    console.log('Server closed')
    process.exit(0)
  })
})

export default app
