const CHARACTER_NAME_BOUNDARY = String.raw`(?:^|[\s，。！？；：、“”‘’（）—])`
const CHARACTER_ACTION = String.raw`(?:说|问|答|道|看|望|笑|哭|走|跑|站|坐|来|回|发现|觉得|知道|点头|摇头|低头|皱眉|抬头|转身|开口|沉默|握住|拿起)`
const COMMON_SURNAMES = new Set('赵钱孙李周吴郑王冯陈褚卫蒋沈韩杨朱秦尤许何吕施张孔曹严华金魏陶姜戚谢邹喻柏水窦章云苏潘葛奚范彭郎鲁韦昌马苗凤花方俞任袁柳鲍史唐费廉岑薛雷贺倪汤滕殷罗毕郝邬安常乐于时傅皮卞齐康伍余元顾孟平黄和穆萧尹姚邵湛汪祁毛禹狄米贝明臧计伏成戴谈宋茅庞熊纪舒屈项祝董梁杜阮蓝闵季贾路娄江童颜郭梅盛林钟徐邱骆高夏蔡田樊胡凌霍虞万柯管卢莫房裘缪解应宗丁宣邓郁单杭洪包诸左石崔吉龚程邢裴陆荣翁荀羊甄曲封芮储靳汲邴糜松井段富巫乌焦巴弓牧隗山谷车侯宓蓬全郗班仰秋仲伊宫宁仇栾暴甘钭厉戎祖武符刘景詹束龙叶幸司韶郜黎蓟薄印宿白蒲台鄂索咸籍赖卓蔺屠蒙池乔阴胥能苍双闻莘党翟谭贡劳姬申扶堵冉宰郦雍郤璩桑桂濮牛寿通边扈燕冀浦尚农温别庄晏柴瞿阎充慕连茹习宦艾鱼容向古易慎戈廖庾终暨居衡步都耿满弘匡国文寇广禄阙东欧沃利蔚越隆师巩厍聂晁勾敖融冷訾辛阚那简饶空曾毋沙乜养鞠须丰巢关蒯相查后荆红游竺权逯盖益桓公'.split(''))
const CHARACTER_NAME_STOPWORDS = new Set([
  '他们', '她们', '我们', '你们', '自己', '有人', '没人', '众人', '所有人', '年轻人', '老人', '男人', '女人',
  '阿姨',
  '今天', '昨天', '明天', '此刻', '这时', '那时', '这里', '那里', '外面', '里面', '随后', '忽然', '终于',
])

function canonicalizeCandidate(candidate: string, knownNames: string[]): string {
  if (knownNames.includes(candidate)) return candidate
  // 旧抽取器会把动作首字吞进姓名（如“林渡知道”→“林渡知”）；人物卡是最高可信的归一化锚点。
  return knownNames.find((name) => candidate.startsWith(name)) ?? candidate
}

/** 供无模型关系图投影使用：人物卡优先，姓名段非贪婪，避免把后续动作拼成重复人物。 */
export function extractCharacterNames(content: string, knownCanonicalNames: string[] = []): string[] {
  const knownNames = [...new Set(knownCanonicalNames.map((name) => name.trim()).filter(Boolean))]
    .sort((left, right) => right.length - left.length)
  const candidates = new Set<string>()
  for (const name of knownNames) {
    if (content.includes(name)) candidates.add(name)
  }
  const patterns = [
    new RegExp(`${CHARACTER_NAME_BOUNDARY}([\\u3400-\\u9fff]{2,4}?)(?=${CHARACTER_ACTION})`, 'gmu'),
    new RegExp(`${CHARACTER_NAME_BOUNDARY}([\\u3400-\\u9fff]{2,4}?)(?=[：:]?[“\u201c])`, 'gmu'),
  ]
  for (const pattern of patterns) {
    for (const match of content.matchAll(pattern)) {
      const raw = match[1]?.trim()
      if (!raw || CHARACTER_NAME_STOPWORDS.has(raw) || !(COMMON_SURNAMES.has(raw[0]) || raw[0] === '阿')) continue
      const name = canonicalizeCandidate(raw, knownNames)
      if (!CHARACTER_NAME_STOPWORDS.has(name)) candidates.add(name)
    }
  }
  return [...candidates]
}
