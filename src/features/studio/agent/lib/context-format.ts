/** 将上下文 token 数统一显示为千位单位，避免受地区 compact 规则影响出现“万”。 */
export function formatContextTokenCount(value: number): string {
  const roundedThousands = Math.round((Math.max(0, value) / 1000) * 10) / 10
  return `${Number.isInteger(roundedThousands) ? roundedThousands.toFixed(0) : roundedThousands.toFixed(1)}k`
}
