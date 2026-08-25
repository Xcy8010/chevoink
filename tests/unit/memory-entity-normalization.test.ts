import { describe, expect, it } from 'vitest'

import { extractCharacterNames } from '../../api/lib/agent/memory-entity-normalization.js'

describe('记忆图谱人物实体归一化', () => {
  it('不把动作首字吞进姓名', () => {
    const names = extractCharacterNames('林渡知道那不是胡话。林渡低头看向桌面。阿雀说：“别走。”')
    expect(names).toEqual(expect.arrayContaining(['林渡', '阿雀']))
    expect(names).not.toEqual(expect.arrayContaining(['林渡知', '林渡低头']))
  })

  it('人物卡名称优先归一并保持单一节点', () => {
    expect(extractCharacterNames('林渡知道门后的秘密，林渡低头沉默。', ['林渡'])).toEqual(['林渡'])
  })
})
