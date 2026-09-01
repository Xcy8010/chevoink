import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

describe('生产 nginx 安全响应头', () => {
  const config = readFileSync(resolve(process.cwd(), 'deploy/nginx.chevoink.conf'), 'utf8')

  it('强制执行 CSP，不再停留在无服务端收集端点的 Report-Only 状态', () => {
    expect(config).not.toContain('Content-Security-Policy-Report-Only')
    expect(config.match(/add_header Content-Security-Policy /g)).toHaveLength(2)
  })

  it('脚本与连接仅允许同源，并阻止框架嵌入和 base/form 劫持', () => {
    expect(config).toContain("script-src 'self'")
    expect(config).toContain("connect-src 'self'")
    expect(config).toContain("frame-ancestors 'none'")
    expect(config).toContain("base-uri 'self'")
    expect(config).toContain("form-action 'self'")
  })
})
