import { config } from 'dotenv'
import { fileURLToPath } from 'node:url'

/**
 * 测试隔离三重闸（之一：库守卫）：
 * 1. DOTENV_PATH 指向 tests/.env.test —— env.ts 不再误读开发 .env（override:true 会覆盖注入变量）；
 * 2. 显式预加载同一份文件做守卫检查：凡 DATABASE_URL 存在，其库名必须包含 test，
 *    防止任何测试/迁移/seed 误指开发库或生产库；
 * 3. vitest pool:'forks' 进程级隔离（见 vitest.config.ts）。
 */
const envTestPath = fileURLToPath(new URL('./.env.test', import.meta.url))
process.env.DOTENV_PATH = envTestPath
config({ path: envTestPath, override: true })

const databaseUrl = process.env.DATABASE_URL ?? ''
if (databaseUrl && !/test/i.test(databaseUrl)) {
  throw new Error(
    `[test-guard] DATABASE_URL 指向了非测试库（${databaseUrl.replace(/:[^:@/]+@/, ':***@')}），` +
      '拒绝运行：请使用库名包含 test 的独立测试库。',
  )
}
