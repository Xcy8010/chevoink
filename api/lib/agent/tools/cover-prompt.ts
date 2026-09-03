/**
 * 封面提示词治理（平台规定：书封必须带作品名）：
 * 生图模型惯性爱写「无文字/no text」类负向约束，Agent 生成的提示词里经常出现，
 * 导致封面没有书名。这里在服务端做最后一道强制保险：
 * 1. 清洗提示词中的「无文字」类负向短语；
 * 2. 未声明书名文字时，追加「封面包含书名标题文字《书名》」的硬性要求。
 * cover_generate 与 cover_prompt_set 共用，规则层（operation 知识集）与参数描述层另行约束。
 */
export function enforceCoverTitleInPrompt(prompt: string, title: string, displayTitle?: string | null): string {
  // 去掉「无文字/没有文字/不含文字/不要文字/无标题/无字」等负向短语（含前面的分隔符）；
  // 「无字」加负向断言，避免误删「无字碑」这类合法画面描述
  const cleaned = prompt
    .replace(/[,，、;；\s]*(无文字|没有文字|不含文字|不要文字|不出现文字|无标题|无字(?![幕体帖碑画])|no text|without text)/gi, '')
    .trim()
  const bookTitle = (displayTitle ?? '').trim() || title.trim()
  if (!bookTitle) return cleaned
  // 已明确声明书名文字（如「封面标题《xx》」）则不重复追加，只保证书名出现在提示词里
  if (/标题|书名|文字/.test(cleaned) && cleaned.includes(bookTitle)) return cleaned
  return `${cleaned}，封面包含书名标题文字「${bookTitle}」，字体清晰端正、与画面风格协调`
}
