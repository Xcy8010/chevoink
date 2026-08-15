import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    // forks 池每 worker 独立进程：进程内缓存（封禁/令牌版本/限流 Map）互不串扰，
    // 也避免全局 PrismaClient 单例跨测试文件复用连接
    pool: 'forks',
    setupFiles: ['./tests/setup.ts'],
    include: ['tests/**/*.test.ts'],
  },
})
