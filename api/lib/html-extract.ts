import { Readability } from '@mozilla/readability'
import iconv from 'iconv-lite'
import { parseHTML } from 'linkedom'

/**
 * 网页正文处理：charset 解码 + Readability 正文提取。
 * 供 Agent web_read 深读工具使用（api/lib/agent/tools/search-tools.ts）。
 */

/**
 * 三级 charset 探测解码：Content-Type charset → 头部 2KB 内 <meta charset>/http-equiv 扫描 → 默认 UTF-8。
 * 仅当 charset 明确为 gb 系（gbk/gb2312/gb18030/hz）才走 iconv-lite 转码，避免误判把 UTF-8 页转乱。
 * 注意：undici 的 res.text() 只按 UTF-8 解码，GBK 中文站会乱码，必须先拿 ArrayBuffer 再自行解码。
 */
export function decodeWebPageBuffer(buffer: Buffer, contentType: string): string {
  let charset = ''

  const ctMatch = contentType.match(/charset=([\w-]+)/i)
  if (ctMatch) {
    charset = ctMatch[1]
  }
  if (!charset) {
    const head = buffer.subarray(0, 2048).toString('ascii')
    const metaMatch =
      head.match(/<meta[^>]+charset=["']?([\w-]+)/i) ?? head.match(/<meta[^>]+content=["'][^"']*charset=([\w-]+)/i)
    if (metaMatch) {
      charset = metaMatch[1]
    }
  }

  if (/^(gbk|gb2312|gb18030|hz)$/i.test(charset)) {
    return iconv.decode(buffer, 'gbk')
  }
  return new TextDecoder('utf-8').decode(buffer)
}

/**
 * 正文提取升级：Firefox 阅读模式同款算法（Readability）+ 服务端 DOM（linkedom）。
 * 只取 textContent（纯文本，无 XSS 面）；parseHTML 每次新建 DOM，Readability 修改 DOM 无副作用。
 * 任何异常或提取失败返回 null，调用方回退正则提取，行为不会比现状更差。
 */
export function extractArticleText(html: string): string | null {
  try {
    const { document } = parseHTML(html)
    const article = new Readability(document).parse()
    if (!article?.textContent) {
      return null
    }
    const text = article.textContent.replace(/\s+/g, ' ').trim()
    return text || null
  } catch {
    return null
  }
}
