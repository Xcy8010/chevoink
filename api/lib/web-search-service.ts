import { env } from '../config/env.js'

/**
 * 联网搜索服务（Agent web_search 工具的后端）：
 * - bocha 主引擎：博查 AI Web Search API（境内稳定、结构化摘要），需 WEB_SEARCH_BOCHA_API_KEY
 * - bing 兜底引擎：无 key 直接抓取 Bing 结果页解析（best-effort，借鉴 open-websearch 的无 key 引擎思路）
 * 域名硬编码在服务层，模型只传 query，无 SSRF 面。
 */

export type WebSearchResult = {
  title: string
  url: string
  snippet: string
  /** 来源域名（前端卡片右侧展示） */
  source: string
}

export type WebSearchOutcome = {
  provider: 'bocha' | 'bing' | 'weather'
  results: WebSearchResult[]
}

export class WebSearchError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'WebSearchError'
  }
}

const SNIPPET_MAX = 300

function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&nbsp;|&ensp;|&#0?160;/g, ' ')
    .replace(/&#0?183;|&middot;/g, '·')
    .replace(/&amp;/g, '&')
}

function stripTags(text: string): string {
  return decodeHtmlEntities(text.replace(/<[^>]*>/g, '')).replace(/\s+/g, ' ').trim()
}

function truncate(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max)}…` : text
}

function hostOf(url: string): string {
  try {
    return new URL(url).host
  } catch {
    return ''
  }
}

/** 外部 signal 与超时合并（兼容无 AbortSignal.any 的 Node 版本） */
function withTimeout(external: AbortSignal | undefined, timeoutMs: number): { signal: AbortSignal; cleanup: () => void } {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(new Error('timeout')), timeoutMs)
  const onAbort = () => controller.abort(external?.reason)

  if (external) {
    if (external.aborted) {
      onAbort()
    } else {
      external.addEventListener('abort', onAbort, { once: true })
    }
  }

  const cleanup = () => {
    clearTimeout(timer)
    external?.removeEventListener('abort', onAbort)
  }

  return { signal: controller.signal, cleanup }
}

async function searchBocha(query: string, maxResults: number, signal: AbortSignal): Promise<WebSearchResult[]> {
  const response = await fetch('https://api.bochaai.com/v1/web-search', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.webSearchBochaApiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query, count: maxResults, summary: true }),
    signal,
  })

  if (!response.ok) {
    throw new WebSearchError(`博查返回 ${response.status}`)
  }

  const payload = (await response.json()) as {
    data?: { webPages?: { value?: Array<{ name?: string; url?: string; snippet?: string; summary?: string; siteName?: string }> } }
  }
  const values = payload.data?.webPages?.value ?? []

  return values
    .filter((item) => item.url && item.name)
    .map((item) => ({
      title: stripTags(item.name ?? ''),
      url: item.url ?? '',
      snippet: truncate(stripTags(item.summary || item.snippet || ''), SNIPPET_MAX),
      source: item.siteName || hostOf(item.url ?? ''),
    }))
}

/** 无 key 兜底：抓取 Bing 结果页，正则提取 b_algo 块（标题链接 + 摘要段落） */
async function searchBing(query: string, maxResults: number, signal: AbortSignal): Promise<WebSearchResult[]> {
  const url = `https://www.bing.com/search?q=${encodeURIComponent(query)}&setlang=zh-CN`
  const response = await fetch(url, {
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
      'Accept-Language': 'zh-CN,zh;q=0.9',
      Accept: 'text/html',
    },
    signal,
  })

  if (!response.ok) {
    throw new WebSearchError(`Bing 返回 ${response.status}`)
  }

  const html = await response.text()
  const blocks = [...html.matchAll(/<li class="b_algo"[\s\S]*?<\/li>/g)]
  const results: WebSearchResult[] = []

  for (const block of blocks) {
    if (results.length >= maxResults) {
      break
    }
    // b_algo 块首个链接可能是面包屑站点链接（标题=域名），逐个候选取第一个像真实标题的
    const anchors = [...block[0].matchAll(/<a[^>]*href="(https?:\/\/[^"]+)"[^>]*>([\s\S]*?)<\/a>/g)]
    let picked: { href: string; title: string } | null = null
    for (const anchor of anchors) {
      const title = stripTags(anchor[2])
      // 面包屑链接特征：文本内嵌 URL（含不带协议头的短域名）、带 › 分隔、或以域名开头
      if (!title || /https?:\/\//.test(title) || title.includes(' › ') || /^([a-z0-9-]+\.)+[a-z]{2,}/i.test(title)) {
        continue
      }
      picked = { href: anchor[1], title }
      break
    }
    if (!picked) {
      continue
    }
    const snippetMatch = block[0].match(/<p[^>]*>([\s\S]*?)<\/p>/)
    results.push({
      title: picked.title,
      url: picked.href,
      snippet: truncate(stripTags(snippetMatch?.[1] ?? ''), SNIPPET_MAX),
      source: hostOf(picked.href),
    })
  }

  if (results.length === 0) {
    throw new WebSearchError('Bing 结果解析为空（可能触发反爬或结构变化）')
  }

  return results
}

/** 天气查询意图：命中天气类词时优先走结构化天气源（搜索引擎自然结果给不了实时天气数据） */
const WEATHER_INTENT =
  /(天气|气温|温度|下雨|降雨|降雪|下雪|预报|紫外线|湿度|风力|风速|穿什么|带伞|多少度|weather|forecast)/i

const WEATHER_STOPWORDS =
  /(帮我|帮忙|请|查询|查一下|看看|看一下|告诉我|想知道|一下|今天|明天|后天|大后天|今日|明日|本周|下周|周末|未来|最近|现在|实时|当前|天气|气温|温度|预报|下雨|降雨|降雪|下雪|降水|概率|紫外线|湿度|风力|风速|空气质量|穿什么|带伞|多少度|怎么样|怎样|如何|是什么|有没有|吗|呢|吧|啊|的|了|和|与|及|查|weather|forecast)/gi

/** 从天气查询里提取地点（去掉意图词/动词后取第一个剩余词） */
function extractLocation(query: string): string {
  const cleaned = query
    .replace(WEATHER_STOPWORDS, ' ')
    .replace(/[，,。？?！!；;：:\s]+/g, ' ')
    .trim()
  const first = cleaned.split(' ')[0] ?? ''
  return first.length >= 2 && first.length <= 12 ? first : ''
}

/** wttr.in 的天气描述为英文，按关键词映射成中文 */
function descZhFromEnglish(desc: string): string {
  const d = desc.toLowerCase()
  if (d.includes('thunder')) return '雷阵雨'
  if (d.includes('sleet') || d.includes('hail')) return '雨夹雪'
  if (d.includes('snow') || d.includes('blizzard')) return '雪'
  if (d.includes('drizzle')) return '毛毛雨'
  if (d.includes('rain') || d.includes('shower')) {
    return d.includes('heavy') ? '大雨' : d.includes('moderate') ? '中雨' : '小雨'
  }
  if (d.includes('fog') || d.includes('mist')) return '雾'
  if (d.includes('overcast')) return '阴'
  if (d.includes('cloud')) return d.includes('partly') ? '多云' : '阴'
  if (d.includes('clear') || d.includes('sunny')) return '晴'
  return '多云'
}

/** Open-Meteo WMO 天气代码 → 中文 */
function wmoZh(code: number): string {
  if (code === 0) return '晴'
  if (code === 1) return '大部晴朗'
  if (code === 2) return '多云'
  if (code === 3) return '阴'
  if (code === 45 || code === 48) return '雾'
  if (code >= 51 && code <= 57) return '毛毛雨'
  if (code >= 61 && code <= 67) return code >= 65 ? '大雨' : '小雨'
  if (code >= 71 && code <= 77) return '雪'
  if (code >= 80 && code <= 82) return '阵雨'
  if (code === 85 || code === 86) return '阵雪'
  if (code >= 95) return '雷阵雨'
  return '多云'
}

type WttrJson = {
  current_condition?: Array<{
    temp_C?: string
    FeelsLikeC?: string
    humidity?: string
    windspeedKmph?: string
    precipMM?: string
    visibility?: string
    uvIndex?: string
    cloudcover?: string
    weatherDesc?: Array<{ value?: string }>
  }>
  weather?: Array<{
    date?: string
    maxtempC?: string
    mintempC?: string
    hourly?: Array<{
      chanceofrain?: string
      precipMM?: string
      humidity?: string
      windspeedKmph?: string
      weatherDesc?: Array<{ value?: string }>
    }>
  }>
}

/** 结构化天气源一：wttr.in（免 key，自带中文地名解析，实时 + 三日预报） */
async function searchWttrWeather(location: string, signal: AbortSignal): Promise<WebSearchResult[]> {
  const url = `https://wttr.in/${encodeURIComponent(location)}?format=j1&lang=zh`
  const response = await fetch(url, {
    headers: { 'User-Agent': 'curl/8.0', 'Accept-Language': 'zh-CN' },
    signal,
  })
  if (!response.ok) {
    throw new WebSearchError(`wttr.in 返回 ${response.status}`)
  }

  const payload = (await response.json()) as WttrJson
  const current = payload.current_condition?.[0]
  if (!current?.temp_C) {
    throw new WebSearchError('wttr.in 解析为空（地名可能无法识别）')
  }

  const pageUrl = `https://wttr.in/${encodeURIComponent(location)}`
  const results: WebSearchResult[] = [
    {
      title: `${location} 实时天气：${descZhFromEnglish(current.weatherDesc?.[0]?.value ?? '')} ${current.temp_C}°C（体感 ${current.FeelsLikeC ?? '-'}°C）`,
      url: pageUrl,
      snippet: `湿度 ${current.humidity ?? '-'}%，风 ${current.windspeedKmph ?? '-'}km/h，降水 ${current.precipMM ?? '-'}mm，能见度 ${current.visibility ?? '-'}km，紫外线指数 ${current.uvIndex ?? '-'}，云量 ${current.cloudcover ?? '-'}%`,
      source: 'wttr.in',
    },
  ]

  for (const day of (payload.weather ?? []).slice(0, 3)) {
    const noon = day.hourly?.[4] ?? day.hourly?.[0]
    results.push({
      title: `${location} ${day.date ?? ''}：${descZhFromEnglish(noon?.weatherDesc?.[0]?.value ?? '')} ${day.mintempC ?? '-'}~${day.maxtempC ?? '-'}°C`,
      url: pageUrl,
      snippet: `降雨概率 ${noon?.chanceofrain ?? '-'}%，降水 ${noon?.precipMM ?? '-'}mm，湿度 ${noon?.humidity ?? '-'}%，风 ${noon?.windspeedKmph ?? '-'}km/h`,
      source: 'wttr.in',
    })
  }

  return results
}

/** 主要城市坐标表（Open-Meteo 地理编码不认中文，用内置表兜底） */
const CITY_COORDS: Record<string, [number, number]> = {
  北京: [39.9, 116.41], 上海: [31.23, 121.47], 广州: [23.13, 113.26], 深圳: [22.55, 114.06],
  成都: [30.57, 104.07], 杭州: [30.27, 120.16], 南京: [32.06, 118.8], 重庆: [29.56, 106.55],
  武汉: [30.59, 114.31], 西安: [34.34, 108.94], 苏州: [31.3, 120.62], 天津: [39.13, 117.2],
  郑州: [34.75, 113.63], 长沙: [28.23, 112.94], 沈阳: [41.8, 123.43], 哈尔滨: [45.8, 126.53],
  长春: [43.88, 125.32], 济南: [36.65, 117.0], 青岛: [36.07, 120.38], 合肥: [31.82, 117.23],
  福州: [26.07, 119.3], 厦门: [24.48, 118.09], 昆明: [25.04, 102.71], 贵阳: [26.65, 106.63],
  南宁: [22.82, 108.32], 海口: [20.04, 110.35], 三亚: [18.25, 109.51], 兰州: [36.06, 103.83],
  西宁: [36.62, 101.78], 银川: [38.49, 106.23], 乌鲁木齐: [43.83, 87.62], 拉萨: [29.65, 91.14],
  呼和浩特: [40.84, 111.75], 太原: [37.87, 112.55], 石家庄: [38.04, 114.51], 大连: [38.91, 121.61],
  宁波: [29.87, 121.55], 无锡: [31.49, 120.31], 常州: [31.77, 119.95], 南通: [31.98, 120.89],
  扬州: [32.39, 119.42], 徐州: [34.26, 117.19], 烟台: [37.46, 121.44], 洛阳: [34.62, 112.45],
  桂林: [25.28, 110.29], 温州: [27.99, 120.7], 东莞: [23.02, 113.75], 佛山: [23.02, 113.12],
  珠海: [22.27, 113.58], 香港: [22.32, 114.17], 澳门: [22.2, 113.55], 台北: [25.03, 121.57],
}

/** 结构化天气源二：Open-Meteo（免 key，WMO 代码自映射中文；地理编码仅认英文/拼音，中文走内置坐标表） */
async function searchOpenMeteoWeather(location: string, signal: AbortSignal): Promise<WebSearchResult[]> {
  let coords: [number, number] | null = CITY_COORDS[location.replace(/(市|县|区|自治州)$/, '')] ?? null

  if (!coords) {
    const geoResponse = await fetch(
      `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(location)}&count=1&format=json`,
      { signal },
    )
    if (geoResponse.ok) {
      const geo = (await geoResponse.json()) as { results?: Array<{ latitude: number; longitude: number }> }
      const place = geo.results?.[0]
      if (place) coords = [place.latitude, place.longitude]
    }
  }
  if (!coords) {
    throw new WebSearchError(`Open-Meteo 无法解析地点「${location}」`)
  }

  const response = await fetch(
    `https://api.open-meteo.com/v1/forecast?latitude=${coords[0]}&longitude=${coords[1]}` +
      `&current=temperature_2m,relative_humidity_2m,apparent_temperature,weather_code,wind_speed_10m` +
      `&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max` +
      `&timezone=auto&forecast_days=3`,
    { signal },
  )
  if (!response.ok) {
    throw new WebSearchError(`Open-Meteo 返回 ${response.status}`)
  }

  const payload = (await response.json()) as {
    current?: {
      temperature_2m?: number
      apparent_temperature?: number
      relative_humidity_2m?: number
      wind_speed_10m?: number
      weather_code?: number
    }
    daily?: {
      time?: string[]
      weather_code?: number[]
      temperature_2m_max?: number[]
      temperature_2m_min?: number[]
      precipitation_probability_max?: number[]
    }
  }
  const current = payload.current
  if (current?.temperature_2m === undefined) {
    throw new WebSearchError('Open-Meteo 解析为空')
  }

  const pageUrl = `https://open-meteo.com/`
  const results: WebSearchResult[] = [
    {
      title: `${location} 实时天气：${wmoZh(current.weather_code ?? 2)} ${Math.round(current.temperature_2m ?? 0)}°C（体感 ${Math.round(current.apparent_temperature ?? 0)}°C）`,
      url: pageUrl,
      snippet: `湿度 ${current.relative_humidity_2m ?? '-'}%，风 ${current.wind_speed_10m ?? '-'}km/h（数据来源 Open-Meteo）`,
      source: 'open-meteo.com',
    },
  ]

  const daily = payload.daily
  for (let i = 0; i < (daily?.time?.length ?? 0); i += 1) {
    results.push({
      title: `${location} ${daily?.time?.[i]}：${wmoZh(daily?.weather_code?.[i] ?? 2)} ${Math.round(daily?.temperature_2m_min?.[i] ?? 0)}~${Math.round(daily?.temperature_2m_max?.[i] ?? 0)}°C`,
      url: pageUrl,
      snippet: `最大降雨概率 ${daily?.precipitation_probability_max?.[i] ?? '-'}%`,
      source: 'open-meteo.com',
    })
  }

  return results
}

/**
 * 联网搜索入口：auto = 有博查 key 用博查、失败降 Bing；显式 bocha/bing 也带降级；disabled 直接不可用。
 * 天气类查询优先走结构化天气源（wttr.in → Open-Meteo），搜索引擎自然结果不提供实时天气。
 * 两引擎都失败抛 WebSearchError，由工具层转成对模型的如实回填。
 */
export async function searchWeb(
  query: string,
  maxResults: number,
  signal?: AbortSignal,
): Promise<WebSearchOutcome> {
  const { signal: merged, cleanup } = withTimeout(signal, env.webSearchTimeoutMs)

  try {
    const preferBocha =
      env.webSearchProvider === 'bocha' || (env.webSearchProvider === 'auto' && env.webSearchBochaApiKeyConfigured)

    if (env.webSearchProvider === 'disabled') {
      throw new WebSearchError('联网搜索已禁用（WEB_SEARCH_PROVIDER=disabled）')
    }

    if (WEATHER_INTENT.test(query)) {
      const location = extractLocation(query)
      if (location) {
        for (const weatherSource of [searchWttrWeather, searchOpenMeteoWeather]) {
          try {
            const results = await weatherSource(location, merged)
            if (results.length > 0) {
              return { provider: 'weather', results }
            }
          } catch (error) {
            if (signal?.aborted) {
              throw error
            }
            // 该天气源失败，尝试下一个
          }
        }
      }
    }

    if (preferBocha) {
      try {
        const results = await searchBocha(query, maxResults, merged)
        if (results.length > 0) {
          return { provider: 'bocha', results }
        }
      } catch (error) {
        if (signal?.aborted) {
          throw error
        }
        // 博查失败（无 key/非 2xx/解析空）降级 Bing
      }
    }

    const results = await searchBing(query, maxResults, merged)
    return { provider: 'bing', results }
  } finally {
    cleanup()
  }
}
