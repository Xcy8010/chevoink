export type DocSection = {
  id: string
  heading: string
  paragraphs?: string[]
  bullets?: string[]
}

export type DocEntry = {
  key: string
  group: string
  title: string
  summary: string
  sections: DocSection[]
}

/** 账户中心文档：只写产品能力与使用方式，不涉及模型标识、密钥与内部实现 */
export const DOCS: DocEntry[] = [
  {
    key: 'what-is',
    group: '产品概述',
    title: '什么是启创墨域',
    summary: '了解启创墨域如何把 Agent 能力带入网络小说的创作、阅读与社区互动。',
    sections: [
      {
        id: 'positioning',
        heading: '产品定位',
        paragraphs: [
          '启创墨域是一个面向真实创作的 Agentic 平台，把 AI 带入网络小说从灵感整理、章节成稿、封面设计到发布阅读的完整链路。',
          '它不止于给出一段续写或一次会话回复，而是围绕完整的创作闭环工作：理解作品上下文、制定写作计划、调用工具执行、校验章节质量，并持续迭代，直到交付目标结果。',
        ],
      },
      {
        id: 'philosophy',
        heading: '核心理念',
        bullets: [
          '增强上下文工程：为 Agent 提供覆盖大纲、人物、伏笔与章节历史的丰富且持续的上下文，使其准确理解真实任务。',
          'Agent 自主性：让 Agent 在创作流中理解意图、做出决策、调用工具并自主推进执行，同时保留必要的审批检查节点。',
          '目标导向的闭环：以清晰的章节目标和交付结果驱动 Agent，通过规划、执行、验证的端到端闭环持续推进，直至完成交付。',
        ],
      },
      {
        id: 'workspaces',
        heading: '一个产品，多种工作区',
        paragraphs: [
          '创作中心、阅读器、社区与账户中心共用同一套账户与作品数据：在创作中心写下的章节，会同步出现在阅读器与作品详情页；在社区收到的互动，会汇总进消息中心。',
          '账户中心则把个人资料、额度用量、发布记录、套餐与文档收在同一处，方便随时核对账户状态。',
        ],
      },
    ],
  },
  {
    key: 'quick-start',
    group: '产品概述',
    title: '快速入门',
    summary: '从注册到发布第一章，十分钟走完整个创作链路。',
    sections: [
      {
        id: 'register',
        heading: '注册与登录',
        paragraphs: [
          '支持手机号验证码与邮箱两种注册登录方式。注册成功后自动开通公测版套餐，立即获得每日公测额度，无需付费与绑卡。',
        ],
      },
      {
        id: 'first-novel',
        heading: '创建第一部作品',
        bullets: [
          '从顶部导航进入创作中心，点击新建作品。',
          '填写书名、题材标签与简介，保存后进入作品工作区。',
          '工作区左侧管理章节与资料，右侧是与写作 Agent 的任务窗口。',
        ],
      },
      {
        id: 'first-chapter',
        heading: '用 Agent 完成第一章',
        paragraphs: [
          '在任务窗口直接描述章节目标，例如「写第 1 章：主角初入宗门，埋下灵珠伏笔」。Agent 会自行构建场景任务、生成正文，并在写入章节前征求你的审批。',
          '成稿后可以继续对话润色，也可以到阅读器检查排版与手感，满意后发布到社区收集反馈。',
        ],
      },
    ],
  },
  {
    key: 'writing-agent',
    group: '创作中心',
    title: '写作 Agent',
    summary: '任务窗口、工具审批与中断续跑的完整使用说明。',
    sections: [
      {
        id: 'conversation',
        heading: '会话与任务窗口',
        paragraphs: [
          '每部作品拥有独立的任务窗口，会话历史长期保存。刷新页面或异常中断后，窗口会恢复最近一次任务的状态，并可一键继续执行。',
          'Agent 的回复分为正文与思考两个信道：正文是面向你的结论与交付说明，思考行展示其推理脉络，两者都以可读的中文呈现。',
        ],
      },
      {
        id: 'tools',
        heading: '工具调用与审批',
        bullets: [
          '正文写入工具：写入章节、追加正文、区间改写，均需你审批通过后才会落盘。',
          '结构工具：创建章节、调整卷章结构、构建场景任务。',
          '辅助工具：联网搜索取材、AI 封面生成、剧情编译校验（检查人物与伏笔的一致性）。',
        ],
      },
      {
        id: 'resume',
        heading: '中断与续跑',
        paragraphs: [
          '当任务因额度用尽、网络波动等原因异常终止时，页面会出现继续按钮。点击继续后，Agent 会先盘点未完成的派生窗口并驱动它们续跑，而不是重做已完成的部分。',
          '你也可以在输入框直接输入「继续」，效果与点击按钮一致。',
        ],
      },
    ],
  },
  {
    key: 'multi-window',
    group: '创作中心',
    title: '多窗口协作',
    summary: '主窗口调度、子窗口并行写章的协作模式。',
    sections: [
      {
        id: 'why',
        heading: '为什么需要多窗口',
        paragraphs: [
          '长篇创作经常需要同时推进多个章节：主线窗口负责调度与审查，派生子窗口各自专注一章的正文生产，互不阻塞，整体成稿速度成倍提升。',
        ],
      },
      {
        id: 'how',
        heading: '协作方式',
        bullets: [
          '主窗口通过派生任务开启子窗口，并下发章节目标、人物约束与伏笔要求。',
          '子窗口独立执行，正文只写入自己负责的章节，不互相干扰。',
          '主窗口用任务等待收取交付，用任务发送投递续跑或返工指令。',
        ],
      },
      {
        id: 'review',
        heading: '交付与审查',
        paragraphs: [
          '子窗口完成后会生成交付摘要，主窗口对照大纲与伏笔清单审查一致性，必要时投递返工指令，确认无误后再并入正式章节序列。',
        ],
      },
    ],
  },
  {
    key: 'cover',
    group: '创作中心',
    title: 'AI 封面',
    summary: '为作品生成并挑选一张合适的封面。',
    sections: [
      {
        id: 'generate',
        heading: '生成封面',
        paragraphs: [
          '在作品工作区的封面入口，Agent 会结合书名、题材与简介生成多张候选封面，每次生成消耗少量额度。',
        ],
      },
      {
        id: 'apply',
        heading: '挑选与应用',
        paragraphs: [
          '候选封面会保留在封面库中，可反复对比；应用后同步到作品详情页、书架与榜单封面位。',
        ],
      },
    ],
  },
  {
    key: 'reader',
    group: '阅读与社区',
    title: '阅读器',
    summary: '沉浸阅读、划线笔记、评论与听书。',
    sections: [
      {
        id: 'immersive',
        heading: '沉浸阅读',
        paragraphs: [
          '阅读器默认隐藏无关界面元素，正文始终保持在视觉中心；支持字号、行距、主题切换与沉浸全屏，手机端自动适配安全区。',
        ],
      },
      {
        id: 'notes',
        heading: '划线与评论',
        bullets: [
          '选中正文即可创建划线笔记，随时回看与删除。',
          '支持段评与章末评论，与作者和其他读者讨论剧情。',
          '阅读进度与划线在多端同步。',
        ],
      },
      {
        id: 'tts',
        heading: '听书',
        paragraphs: [
          '阅读器内置听书能力，可选择音色朗读当前章节，并支持连续播放后续章节，适合通勤与睡前场景。',
        ],
      },
    ],
  },
  {
    key: 'community',
    group: '阅读与社区',
    title: '社区互动',
    summary: '发帖、话题、互动与消息中心。',
    sections: [
      {
        id: 'posts',
        heading: '发帖与话题',
        paragraphs: [
          '可以发布文字讨论、配图，并关联自己的作品或公开话题；帖子会进入对应话题页与推荐流。',
        ],
      },
      {
        id: 'interact',
        heading: '互动与消息',
        bullets: [
          '点赞、收藏、评论与回复都会通知作者。',
          '私聊支持一对一会话与消息中心聚合提醒。',
          '我的发布页集中管理你发过的全部讨论。',
        ],
      },
    ],
  },
  {
    key: 'credits',
    group: '账户与额度',
    title: 'Credits 额度',
    summary: '额度是什么、如何重置、在哪里查记录。',
    sections: [
      {
        id: 'what',
        heading: '什么是 Credits',
        paragraphs: [
          'Credits 是公测期间调用平台能力的统一计量：文本模型对话、图片生成与联网搜索都会扣除相应额度。额度不足时 Agent 会安全保存当前任务，不会丢失进度。',
        ],
      },
      {
        id: 'reset',
        heading: '每日重置',
        paragraphs: [
          '每日公测额度在 UTC+8 15:00 自动重置，未用完的部分不累计到次日；奖励额度独立累计，长期有效。',
        ],
      },
      {
        id: 'records',
        heading: '记录查询',
        paragraphs: [
          '用量明细页展示最近 150 条消耗与获得记录，可按「已使用 / 已获得」筛选，每条记录附带时间、用量与抵扣额度。',
        ],
      },
    ],
  },
  {
    key: 'invite',
    group: '账户与额度',
    title: '邀请奖励',
    summary: '邀请好友注册，获得长期有效的奖励额度。',
    sections: [
      {
        id: 'how',
        heading: '如何邀请',
        paragraphs: [
          '在用量明细页点击邀请好友，复制你的专属邀请链接发送给好友；好友通过链接成功注册后，奖励即时到账。',
        ],
      },
      {
        id: 'reward',
        heading: '奖励发放',
        bullets: [
          '每位成功注册的新好友为你增加 300 Credits。',
          '奖励额度长期有效，不随每日重置清零。',
          '每日额度用完后，奖励额度自动接续抵扣。',
        ],
      },
    ],
  },
  {
    key: 'plan',
    group: '账户与额度',
    title: '套餐说明',
    summary: '公测版套餐权益与后续套餐规划。',
    sections: [
      {
        id: 'beta',
        heading: '公测版套餐',
        paragraphs: [
          '公测版是公测期间唯一套餐，注册即自动开通，¥0 / 月：包含每日公测额度、写作 Agent 全能力、多窗口协作、AI 封面、阅读器与社区全部功能。',
        ],
      },
      {
        id: 'future',
        heading: '后续规划',
        paragraphs: [
          '公测结束后将推出面向重度创作者的付费套餐：更高每日额度、优先体验新模型与新功能；公测用户享有优惠续订通道，已获得的奖励额度继续长期有效。',
        ],
      },
    ],
  },
  {
    key: 'faq',
    group: '帮助',
    title: '常见问题',
    summary: '额度、续跑、账户安全等高频问题的清晰解答。',
    sections: [
      {
        id: 'credits-out',
        heading: '额度用完了怎么办',
        paragraphs: [
          '可以等待每日 15:00 的额度重置，或邀请好友获得长期有效的奖励额度。额度耗尽前 Agent 会安全保存任务状态，获得额度后点击继续即可接续执行。',
        ],
      },
      {
        id: 'agent-stop',
        heading: 'Agent 中断了怎么恢复',
        paragraphs: [
          '先确认网络与额度状态，再点击窗口的继续按钮或输入「继续」。多窗口任务会优先驱动未完成的子窗口续跑，已完成的部分不会重做。',
        ],
      },
      {
        id: 'security',
        heading: '如何修改密码或绑定手机',
        paragraphs: [
          '在账户中心个人信息页的账户安全区块，点击对应管理入口跳转到设置页完成修改；修改后立即对新会话生效。',
        ],
      },
      {
        id: 'delete',
        heading: '如何删除作品或帖子',
        paragraphs: [
          '作品在创作中心的作品管理里删除；帖子在详情页删除。删除后不可恢复，请谨慎操作。',
        ],
      },
    ],
  },
  {
    key: 'changelog',
    group: '帮助',
    title: '更新日志',
    summary: '了解最新功能发布与改进。',
    sections: [
      {
        id: 'v3',
        heading: 'Agent 3.0 与多窗口协作',
        bullets: [
          '写作 Agent 升级任务窗口内核，支持派生子窗口并行写章。',
          '新增中断续跑协作：异常终止后一键继续，自动驱动子窗口续跑。',
          '正文与思考信道全流式清洗，运行过程不再泄漏内部协议词汇。',
        ],
      },
      {
        id: 'v2',
        heading: '阅读器听书与账户中心',
        bullets: [
          '阅读器新增听书能力，支持连续章节播放。',
          '账户中心改版：个人信息、用量明细、我的发布、价格与文档同屏可达。',
          '社区新增话题页与互动消息汇总。',
        ],
      },
      {
        id: 'v1',
        heading: '公测上线',
        bullets: [
          '创作中心、阅读器、社区与账户中心上线。',
          '公测版套餐开放，注册即享每日额度。',
        ],
      },
    ],
  },
]

export const DOC_GROUPS = DOCS.reduce<string[]>((groups, doc) => {
  if (!groups.includes(doc.group)) groups.push(doc.group)
  return groups
}, [])
