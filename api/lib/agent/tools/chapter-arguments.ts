import { z } from 'zod'

export const chapterWriteArguments = z.object({
  chapterId: z.string().optional().describe('目标章节 ID；缺省时默认写入最近操作/当前正在编辑的章节'),
  content: z.string().min(1).describe('完整的新正文'),
})
export const chapterAppendArguments = z.object({
  chapterId: z.string().optional().describe('目标章节 ID；缺省时默认追加到最近操作/当前正在编辑的章节'),
  content: z.string().min(1).describe('要追加的内容'),
})
export const chapterEditArguments = z.object({
  chapterId: z.string().optional().describe('目标章节 ID；缺省时默认操作最近操作/当前正在编辑的章节'),
  oldText: z.string().optional().describe('要替换的原文片段（从 chapter_read 返回的正文逐字拷贝，含标点换行）；系统自动定位，须在正文中唯一，不唯一就向两侧多拷几句'),
  start: z.number().int().min(0).optional().describe('片段起始字符位置（仅作者选区给出精确坐标时传；常规改写用 oldText 定位）'),
  end: z.number().int().min(0).optional().describe('片段结束字符位置（不含）'),
  newText: z.string().describe('替换后的新文本'),
})
