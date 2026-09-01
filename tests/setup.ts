import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { config } from 'dotenv'

/**
 * 测试隔离三重闸（之一：库守卫）：
 * 1. DOTENV_PATH 指向 tests/.env.test —— env.ts 不再误读开发 .env（override:true 会覆盖注入变量）；
 * 2. 显式预加载同一份文件做守卫检查：凡 DATABASE_URL 存在，其库名必须包含 test，
 *    防止任何测试/迁移/seed 误指开发库或生产库；
 * 3. vitest pool:'forks' 进程级隔离（见 vitest.config.ts）。
 *
 * 开箱即用兜底：tests/.env.test 已被 .gitignore 排除（含密钥不入库），clone 后首次跑测试时
 * 文件不存在 —— 就地注入最小可用环境（??= 不覆盖外部已设值），让纯单测无需任何配置即可全绿；
 * 库指向本地 chevoink_test（含 test 过守卫），本地无 DB 时集成组由 skipIf 自动降级。
 */
// jsdom 会把 import.meta.url 映射成浏览器 URL；从仓库根解析可让 node/jsdom 两种环境共用守卫。
const envTestPath = resolve(process.cwd(), 'tests/.env.test')

if (!existsSync(envTestPath)) {
  process.env.APP_ENV ??= 'test'
  process.env.AUTH_SESSION_SECRET ??= 'chevoink-test-session-secret-placeholder'
  process.env.DATABASE_URL ??= 'postgresql://127.0.0.1:5432/chevoink_test'
}

process.env.DOTENV_PATH = envTestPath
config({ path: envTestPath, override: true })

const databaseUrl = process.env.DATABASE_URL ?? ''
if (databaseUrl && !/test/i.test(databaseUrl)) {
  throw new Error(
    `[test-guard] DATABASE_URL 指向了非测试库（${databaseUrl.replace(/:[^:@/]+@/, ':***@')}），` +
      '拒绝运行：请使用库名包含 test 的独立测试库。',
  )
}
