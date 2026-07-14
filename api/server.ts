import app from './app.js'
import { env } from './config/env.js'

const server = app.listen(env.port, () => {
  console.log(`[chevoink] server ready on ${env.serverUrl}`)
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
