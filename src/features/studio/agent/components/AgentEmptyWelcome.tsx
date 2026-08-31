import { BookPlus, Compass, Layers3, Sparkles, UsersRound } from 'lucide-react'
import { useMemo } from 'react'

import { useAgentStore } from '../agentStore'

type Props = {
  novelName: string
  initializingNovel?: boolean
  seed: string
}

const NOVEL_GENRES = ['玄幻', '都市悬疑', '古代言情', '科幻', '仙侠', '历史架空', '现代言情', '末日生存']

const CREATE_PROMPTS = [
  '帮我从一句灵感开始，设计主角、核心冲突和世界观',
  '帮我规划一部节奏紧凑、开篇有强钩子的长篇小说',
  '根据当下网文读者偏好，给我三个原创题材方向',
  '帮我设计一组有张力的人物关系和长期矛盾',
  '从零搭建故事大纲，并规划前三章的关键推进',
  '帮我把脑海里的零散设定整理成一部完整小说',
]

const BUILD_PROMPTS = [
  '检查现有设定，找出逻辑冲突并给出修订方案',
  '为下一章设计三个可推进主线的场景方向',
  '梳理主要人物关系，并补全缺失的动机',
  '优化作品简介和标签，让定位更清晰',
  '检查最近章节的节奏、连续性和人物表现',
  '根据现有正文规划下一卷的核心矛盾',
  '帮我设计一个自然但有冲击力的剧情转折',
  '把当前计划细化成可以直接写作的章节任务',
  '分析这部作品最值得强化的卖点',
  '为主要角色补充独特声口和行为习惯',
]

const CARD_ICONS = [BookPlus, Compass, UsersRound, Layers3] as const

function hashSeed(value: string) {
  let hash = 2166136261
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return hash >>> 0
}

function seededShuffle(values: string[], seed: string) {
  const result = [...values]
  let state = hashSeed(seed) || 1
  for (let index = result.length - 1; index > 0; index -= 1) {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0
    const target = state % (index + 1)
    ;[result[index], result[target]] = [result[target], result[index]]
  }
  return result
}

export default function AgentEmptyWelcome({ novelName, initializingNovel = false, seed }: Props) {
  const setComposerDraft = useAgentStore((state) => state.setComposerDraft)
  const suggestions = useMemo(() => {
    if (initializingNovel) {
      const genre = NOVEL_GENRES[hashSeed(`${seed}:genre`) % NOVEL_GENRES.length]
      return [`帮我创建一部${genre}类型的小说`, ...seededShuffle(CREATE_PROMPTS, `${seed}:create`).slice(0, 3)]
    }
    return seededShuffle(BUILD_PROMPTS, `${seed}:build`).slice(0, 4)
  }, [initializingNovel, seed])

  return (
    <div className="mx-auto flex h-full w-full max-w-[760px] flex-col items-center justify-center px-1 py-6 text-center sm:px-4">
      <img
        src="/chevoink-agent.png"
        alt="Chevoink Agent"
        className="h-12 w-12 rounded-[14px] object-contain sm:h-14 sm:w-14"
      />
      <h2 className="mt-5 text-balance text-lg font-semibold tracking-[-0.02em] text-[var(--text-primary)] sm:text-[22px]">
        {initializingNovel
          ? '你可以让 Chevoink Agent 帮你做些什么？'
          : `你想让我们在《${novelName}》构建什么？`}
      </h2>
      <p className="mt-2 max-w-[560px] text-xs leading-5 text-[var(--text-secondary)] sm:text-sm">
        选择一个方向作为起点，内容只会填入输入框，你可以继续修改后再发送。
      </p>
      <div className="mt-6 grid w-full grid-cols-1 gap-2.5 sm:grid-cols-2">
        {suggestions.map((suggestion, index) => {
          const Icon = CARD_ICONS[index] ?? Sparkles
          return (
            <button
              key={suggestion}
              type="button"
              onClick={() => setComposerDraft(suggestion)}
              className="group flex min-h-[74px] items-start gap-3 rounded-[14px] border border-[var(--border-subtle)] bg-[var(--surface-default)] px-4 py-3 text-left transition-[border-color,background-color,transform] hover:-translate-y-px hover:border-[var(--border-strong)] hover:bg-[var(--surface-muted)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--border-strong)]"
            >
              <Icon className="mt-0.5 h-4 w-4 shrink-0 text-[var(--text-tertiary)] transition-colors group-hover:text-[var(--text-primary)]" />
              <span className="text-xs font-medium leading-5 text-[var(--text-primary)] sm:text-[13px]">{suggestion}</span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
