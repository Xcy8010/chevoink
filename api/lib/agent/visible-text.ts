import { allTools } from './tools/registry.js'

/**
 * 正文信道面向作者的可见性清洗：工具英文名与内部系统名是协议层词汇，
 * 出现在正文里对作者等于乱码（作者反馈：scene_task_build、Story Compiler 这类词不该进正文）。
 * 统一替换成注册表里的中文工具名 / 内部系统中文名；思考信道与工具观察不经过这里。
 */

const TOOL_LABEL_BY_NAME = new Map(allTools.map((tool) => [tool.name, tool.title]))

/** 内部系统英文名 → 中文功能名（非工具注册表成员，单独维护） */
const INTERNAL_NAME_ALIASES: Array<[RegExp, string]> = [
  [/Story\s*Compiler/gi, '剧情编译'],
  [/Chapter\s*Bridge/gi, '章节桥'],
  [/Scene\s*Task/gi, '场景任务'],
  [/Story\s*Charter/gi, '故事宪章'],
]

/** snake_case 标识符（工具名/参数名形态）：命中注册表才替换，避免误伤普通英文 */
const SNAKE_CASE_IDENTIFIER = /\b[a-z][a-z0-9]*(?:_[a-z0-9]+)+\b/g

export function humanizeAgentVisibleText(text: string): string {
  if (!text) return text
  let out = text.replace(SNAKE_CASE_IDENTIFIER, (name) => TOOL_LABEL_BY_NAME.get(name) ?? name)
  for (const [pattern, label] of INTERNAL_NAME_ALIASES) {
    out = out.replace(pattern, label)
  }
  return out
}
