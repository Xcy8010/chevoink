CREATE TYPE "CorpusSourceClass" AS ENUM ('internal', 'public_domain', 'permissive', 'licensed', 'author_private', 'platform_opt_in');
CREATE TYPE "CorpusRightsStatus" AS ENUM ('pending', 'approved', 'rejected', 'expired', 'revoked');
CREATE TYPE "CorpusScope" AS ENUM ('platform', 'user', 'novel');
CREATE TYPE "CorpusDocumentStatus" AS ENUM ('pending', 'indexed', 'blocked', 'revoked');
CREATE TYPE "StyleProfileKind" AS ENUM ('author', 'corpus');
CREATE TYPE "LeakageDecision" AS ENUM ('passed', 'blocked');

CREATE TABLE "corpus_sources" (
  "id" VARCHAR(64) NOT NULL,
  "user_id" VARCHAR(64),
  "novel_id" VARCHAR(64),
  "scope" "CorpusScope" NOT NULL DEFAULT 'platform',
  "name" VARCHAR(160) NOT NULL,
  "source_class" "CorpusSourceClass" NOT NULL,
  "rights_holder" VARCHAR(240) NOT NULL,
  "source_url" VARCHAR(1000),
  "license" VARCHAR(120) NOT NULL,
  "commercial_use" BOOLEAN NOT NULL DEFAULT false,
  "redistribution" BOOLEAN NOT NULL DEFAULT false,
  "modification" BOOLEAN NOT NULL DEFAULT false,
  "raw_storage_allowed" BOOLEAN NOT NULL DEFAULT false,
  "index_allowed" BOOLEAN NOT NULL DEFAULT false,
  "rights_status" "CorpusRightsStatus" NOT NULL DEFAULT 'pending',
  "rights_evidence" TEXT NOT NULL,
  "audit_note" TEXT,
  "audited_by_user_id" VARCHAR(64),
  "audited_at" TIMESTAMP(3),
  "expires_at" TIMESTAMP(3),
  "revoked_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "corpus_sources_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "corpus_documents" (
  "id" VARCHAR(64) NOT NULL,
  "user_id" VARCHAR(64),
  "novel_id" VARCHAR(64),
  "source_id" VARCHAR(64) NOT NULL,
  "title" VARCHAR(240) NOT NULL,
  "author_name" VARCHAR(160),
  "content_hash" VARCHAR(64) NOT NULL,
  "raw_storage_allowed" BOOLEAN NOT NULL DEFAULT false,
  "index_allowed" BOOLEAN NOT NULL DEFAULT false,
  "status" "CorpusDocumentStatus" NOT NULL DEFAULT 'pending',
  "metadata" JSONB NOT NULL DEFAULT '{}',
  "revoked_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "corpus_documents_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "corpus_passages" (
  "id" VARCHAR(64) NOT NULL,
  "user_id" VARCHAR(64),
  "novel_id" VARCHAR(64),
  "document_id" VARCHAR(64) NOT NULL,
  "ordinal" INTEGER NOT NULL,
  "content" TEXT NOT NULL,
  "content_hash" VARCHAR(64) NOT NULL,
  "char_count" INTEGER NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "corpus_passages_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "technique_cards" (
  "id" VARCHAR(64) NOT NULL,
  "user_id" VARCHAR(64),
  "novel_id" VARCHAR(64),
  "source_id" VARCHAR(64) NOT NULL,
  "document_id" VARCHAR(64),
  "card_key" VARCHAR(160) NOT NULL,
  "title" VARCHAR(160) NOT NULL,
  "genre" VARCHAR(64) NOT NULL,
  "subgenre" VARCHAR(64) NOT NULL DEFAULT '',
  "scene_type" VARCHAR(96) NOT NULL,
  "reader_effect" VARCHAR(240) NOT NULL,
  "relationship_stage" VARCHAR(96) NOT NULL DEFAULT '',
  "point_of_view" VARCHAR(48) NOT NULL DEFAULT '',
  "narrative_distance" VARCHAR(48) NOT NULL DEFAULT '',
  "pace" VARCHAR(48) NOT NULL DEFAULT '',
  "defect_targets" TEXT[] DEFAULT ARRAY[]::TEXT[],
  "techniques" JSONB NOT NULL,
  "style_stats" JSONB NOT NULL,
  "avoid" JSONB NOT NULL,
  "searchable_text" TEXT NOT NULL,
  "abstraction_hash" VARCHAR(64) NOT NULL,
  "active" BOOLEAN NOT NULL DEFAULT false,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "technique_cards_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "style_profiles" (
  "id" VARCHAR(64) NOT NULL,
  "user_id" VARCHAR(64),
  "novel_id" VARCHAR(64),
  "source_id" VARCHAR(64),
  "document_id" VARCHAR(64),
  "kind" "StyleProfileKind" NOT NULL,
  "name" VARCHAR(160) NOT NULL,
  "stats" JSONB NOT NULL,
  "sample_count" INTEGER NOT NULL,
  "sample_chars" INTEGER NOT NULL,
  "content_hash" VARCHAR(64) NOT NULL,
  "confirmed" BOOLEAN NOT NULL DEFAULT false,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "style_profiles_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "retrieval_traces" (
  "id" VARCHAR(64) NOT NULL,
  "user_id" VARCHAR(64) NOT NULL,
  "novel_id" VARCHAR(64) NOT NULL,
  "run_id" VARCHAR(64) NOT NULL,
  "query" JSONB NOT NULL,
  "candidate_ids" JSONB NOT NULL,
  "selected" JSONB NOT NULL,
  "profile_id" VARCHAR(64),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "retrieval_traces_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "leakage_checks" (
  "id" VARCHAR(64) NOT NULL,
  "user_id" VARCHAR(64) NOT NULL,
  "novel_id" VARCHAR(64) NOT NULL,
  "run_id" VARCHAR(64),
  "chapter_id" VARCHAR(64),
  "output_hash" VARCHAR(64) NOT NULL,
  "matched_passage_id" VARCHAR(64),
  "ngram_overlap" DOUBLE PRECISION NOT NULL,
  "longest_common_substring" INTEGER NOT NULL,
  "semantic_similarity" DOUBLE PRECISION NOT NULL,
  "decision" "LeakageDecision" NOT NULL,
  "action" VARCHAR(120) NOT NULL,
  "evidence_hash" VARCHAR(64),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "leakage_checks_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "corpus_deletion_receipts" (
  "id" VARCHAR(64) NOT NULL,
  "user_id" VARCHAR(64),
  "novel_id" VARCHAR(64),
  "source_id" VARCHAR(64) NOT NULL,
  "deleted_counts" JSONB NOT NULL,
  "reason" VARCHAR(500) NOT NULL,
  "receipt_hash" VARCHAR(64) NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "corpus_deletion_receipts_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "corpus_sources_rights_status_source_class_updated_at_idx" ON "corpus_sources"("rights_status", "source_class", "updated_at");
CREATE INDEX "corpus_sources_user_id_novel_id_rights_status_idx" ON "corpus_sources"("user_id", "novel_id", "rights_status");
CREATE INDEX "corpus_sources_expires_at_idx" ON "corpus_sources"("expires_at");
CREATE UNIQUE INDEX "corpus_documents_source_id_content_hash_key" ON "corpus_documents"("source_id", "content_hash");
CREATE INDEX "corpus_documents_user_id_novel_id_status_idx" ON "corpus_documents"("user_id", "novel_id", "status");
CREATE INDEX "corpus_documents_source_id_status_idx" ON "corpus_documents"("source_id", "status");
CREATE UNIQUE INDEX "corpus_passages_document_id_ordinal_key" ON "corpus_passages"("document_id", "ordinal");
CREATE INDEX "corpus_passages_user_id_novel_id_created_at_idx" ON "corpus_passages"("user_id", "novel_id", "created_at");
CREATE INDEX "corpus_passages_content_hash_idx" ON "corpus_passages"("content_hash");
CREATE UNIQUE INDEX "technique_cards_card_key_key" ON "technique_cards"("card_key");
CREATE INDEX "technique_cards_active_genre_scene_type_idx" ON "technique_cards"("active", "genre", "scene_type");
CREATE INDEX "technique_cards_user_id_novel_id_active_idx" ON "technique_cards"("user_id", "novel_id", "active");
CREATE INDEX "technique_cards_source_id_active_idx" ON "technique_cards"("source_id", "active");
CREATE INDEX "style_profiles_user_id_novel_id_confirmed_updated_at_idx" ON "style_profiles"("user_id", "novel_id", "confirmed", "updated_at");
CREATE INDEX "style_profiles_source_id_kind_idx" ON "style_profiles"("source_id", "kind");
CREATE INDEX "retrieval_traces_user_id_novel_id_created_at_idx" ON "retrieval_traces"("user_id", "novel_id", "created_at");
CREATE INDEX "retrieval_traces_run_id_created_at_idx" ON "retrieval_traces"("run_id", "created_at");
CREATE INDEX "leakage_checks_user_id_novel_id_created_at_idx" ON "leakage_checks"("user_id", "novel_id", "created_at");
CREATE INDEX "leakage_checks_run_id_decision_idx" ON "leakage_checks"("run_id", "decision");
CREATE INDEX "leakage_checks_matched_passage_id_idx" ON "leakage_checks"("matched_passage_id");
CREATE UNIQUE INDEX "corpus_deletion_receipts_receipt_hash_key" ON "corpus_deletion_receipts"("receipt_hash");
CREATE INDEX "corpus_deletion_receipts_user_id_novel_id_created_at_idx" ON "corpus_deletion_receipts"("user_id", "novel_id", "created_at");
CREATE INDEX "corpus_deletion_receipts_source_id_created_at_idx" ON "corpus_deletion_receipts"("source_id", "created_at");

ALTER TABLE "corpus_sources" ADD CONSTRAINT "corpus_sources_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "corpus_sources" ADD CONSTRAINT "corpus_sources_novel_id_fkey" FOREIGN KEY ("novel_id") REFERENCES "novels"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "corpus_sources" ADD CONSTRAINT "corpus_sources_audited_by_user_id_fkey" FOREIGN KEY ("audited_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "corpus_documents" ADD CONSTRAINT "corpus_documents_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "corpus_documents" ADD CONSTRAINT "corpus_documents_novel_id_fkey" FOREIGN KEY ("novel_id") REFERENCES "novels"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "corpus_documents" ADD CONSTRAINT "corpus_documents_source_id_fkey" FOREIGN KEY ("source_id") REFERENCES "corpus_sources"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "corpus_passages" ADD CONSTRAINT "corpus_passages_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "corpus_passages" ADD CONSTRAINT "corpus_passages_novel_id_fkey" FOREIGN KEY ("novel_id") REFERENCES "novels"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "corpus_passages" ADD CONSTRAINT "corpus_passages_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "corpus_documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "technique_cards" ADD CONSTRAINT "technique_cards_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "technique_cards" ADD CONSTRAINT "technique_cards_novel_id_fkey" FOREIGN KEY ("novel_id") REFERENCES "novels"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "technique_cards" ADD CONSTRAINT "technique_cards_source_id_fkey" FOREIGN KEY ("source_id") REFERENCES "corpus_sources"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "technique_cards" ADD CONSTRAINT "technique_cards_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "corpus_documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "style_profiles" ADD CONSTRAINT "style_profiles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "style_profiles" ADD CONSTRAINT "style_profiles_novel_id_fkey" FOREIGN KEY ("novel_id") REFERENCES "novels"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "style_profiles" ADD CONSTRAINT "style_profiles_source_id_fkey" FOREIGN KEY ("source_id") REFERENCES "corpus_sources"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "style_profiles" ADD CONSTRAINT "style_profiles_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "corpus_documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "retrieval_traces" ADD CONSTRAINT "retrieval_traces_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "retrieval_traces" ADD CONSTRAINT "retrieval_traces_novel_id_fkey" FOREIGN KEY ("novel_id") REFERENCES "novels"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "retrieval_traces" ADD CONSTRAINT "retrieval_traces_run_id_fkey" FOREIGN KEY ("run_id") REFERENCES "agent_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "leakage_checks" ADD CONSTRAINT "leakage_checks_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "leakage_checks" ADD CONSTRAINT "leakage_checks_novel_id_fkey" FOREIGN KEY ("novel_id") REFERENCES "novels"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "leakage_checks" ADD CONSTRAINT "leakage_checks_run_id_fkey" FOREIGN KEY ("run_id") REFERENCES "agent_runs"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "leakage_checks" ADD CONSTRAINT "leakage_checks_matched_passage_id_fkey" FOREIGN KEY ("matched_passage_id") REFERENCES "corpus_passages"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "corpus_deletion_receipts" ADD CONSTRAINT "corpus_deletion_receipts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "corpus_deletion_receipts" ADD CONSTRAINT "corpus_deletion_receipts_novel_id_fkey" FOREIGN KEY ("novel_id") REFERENCES "novels"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "corpus_deletion_receipts" ADD CONSTRAINT "corpus_deletion_receipts_source_id_fkey" FOREIGN KEY ("source_id") REFERENCES "corpus_sources"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- L0 内部技法知识不保存或引用小说原文；320 张卡由 16 个题材边界与 20 个场景任务交叉生成。
INSERT INTO "corpus_sources" (
  "id", "scope", "name", "source_class", "rights_holder", "license",
  "commercial_use", "redistribution", "modification", "raw_storage_allowed", "index_allowed",
  "rights_status", "rights_evidence", "audit_note", "audited_at"
) VALUES (
  'builtin.agent3.craft.v1', 'platform', 'Chevoink 中文网文技法卡 v1', 'internal', 'Chevoink', 'Proprietary-Internal',
  true, false, true, false, true, 'approved',
  '平台内部编辑方法与自建结构化正反例；不含第三方小说原文、可逆引文或作者克隆指令。',
  'P4 初始版权门：仅抽象技法进入生产索引。', CURRENT_TIMESTAMP
);

WITH genres(code, label, pov, distance, pace, genre_rule, genre_avoid) AS (
  VALUES
    ('urban', '都市', '第三人称限知', '近', '中快', '让职业、收入与城市生活细节互相校验', '用行业黑话替代真实利益'),
    ('workplace', '职场', '第三人称限知', '近', '中', '权力差必须落到权限、资源与评价后果', '靠众人震惊制造胜负'),
    ('suspense', '悬疑', '第三人称限知', '近', '张弛', '信息释放必须公平且可回看验证', '作者藏掉角色已经知道的信息'),
    ('romance', '言情', '双视角限知', '近', '中', '关系变化通过选择、误解成本与边界体现', '用身体反应代替全部情感'),
    ('fantasy', '玄幻', '第三人称限知', '中', '中快', '能力收益必须绑定代价、规则与对手反制', '连续报境界和设定说明'),
    ('xianxia', '仙侠', '第三人称限知', '中', '舒展', '大道与选择必须落回具体关系和牺牲', '把古雅词堆砌当仙气'),
    ('scifi', '科幻', '第三人称限知', '中', '中', '技术概念服务于可观察约束和人的选择', '用术语密度冒充推演'),
    ('historical', '历史', '第三人称限知', '中', '中', '制度、交通与物质条件约束人物行动', '现代观念换古装直接宣讲'),
    ('period', '古言', '第三人称限知', '近', '中', '礼法压力通过称谓、席位与后果呈现', '满篇仿古词遮住人物目的'),
    ('school', '校园', '第一人称或限知', '近', '轻快', '微小社交风险与同龄人的具体判断优先', '无铺垫突然宏大抒情'),
    ('family', '家庭', '多视角限知', '近', '中慢', '旧账、照料与资源分配形成关系压力', '把人物简化成道德标签'),
    ('crime', '刑侦', '第三人称限知', '中', '中快', '程序、证据链与时间成本必须可信', '灵感一闪跳过取证'),
    ('business', '商战', '第三人称限知', '中', '中快', '博弈结果落到现金流、合同与组织关系', '只写口头交锋不写执行成本'),
    ('game', '游戏', '第三人称限知', '近', '快', '机制、队伍角色与操作结果必须对应', '面板播报挤占现场行动'),
    ('apocalypse', '末世', '第三人称限知', '近', '快', '资源、伤势、路线与信任持续结算', '灾难只当背景装饰'),
    ('slice', '现实日常', '第一人称或限知', '近', '舒展', '用可辨认生活动作承载情绪与关系', '为显得高级强加奇观比喻')
), scenes(code, label, effect, relation_stage, defect, technique_a, technique_b, scene_avoid) AS (
  VALUES
    ('negotiation', '谈判', '权力差发生可验证逆转', '试探', 'plot_progress', '先用座位、称呼、等待时间或议程权建立谁能决定什么', '让主角用一次可验证判断或交换条件改变对方选择', '只写气场压迫而没有条件变化'),
    ('confrontation', '正面对峙', '冲突升级并逼出选择', '对立', 'causal_gap', '双方每轮发言都改变风险或暴露底牌', '结尾结算一个不可撤回的代价', '互放狠话但没人失去东西'),
    ('discovery', '发现线索', '读者获得可参与推理的新信息', '合作', 'explanation_echo', '先让异常通过动作或物件被看见，再给最少解释', '保留至少两种解释并标明哪条证据支持哪一种', '发现后立刻由旁白复述全部含义'),
    ('escape', '逃脱', '空间约束持续收紧后被具体突破', '临时合作', 'plot_progress', '每一步移动同时改变路线、体力或暴露风险', '突破方式必须使用前文已经出现的资源或认知', '连续形容紧张却不更新位置'),
    ('reunion', '重逢', '旧关系在新处境中显出错位', '重逢', 'emotion_grounding', '先用称呼、停顿或习惯动作暴露双方对过去的不同理解', '让一个现实请求迫使双方重新协商距离', '用回忆摘要替代当下互动'),
    ('betrayal', '背叛揭露', '信任损失转化为行动后果', '破裂', 'emotion_grounding', '证据出现前先让被背叛者做出一次基于信任的选择', '揭露后结算资源、关系或自我判断的损失', '只写心碎而不改变后续行动'),
    ('confession', '坦白秘密', '信息差关闭并产生新风险', '靠近', 'character_voice', '坦白者选择说什么和省略什么要符合其声口与恐惧', '听者的回应先处理现实后果，再处理情绪', '一次独白交代全部背景'),
    ('farewell', '告别', '关系余波在未说尽处成立', '分离', 'reader_pull', '用要带走或留下的具体物件承载决定', '让未完成动作或改口体现真实犹豫', '每个人都完整说出内心总结'),
    ('investigation', '调查走访', '多个局部事实汇成可行动判断', '合作', 'explanation_echo', '每个对象提供利益相关的偏差版本', '用矛盾细节推动下一步而不是列资料', '问一句得到标准答案'),
    ('training', '训练突破', '能力变化与代价同时可见', '师徒', 'description_load', '把失败拆成可观察误差而非抽象不够努力', '突破后立刻设置一个暴露新短板的应用', '升级数字替代过程'),
    ('combat', '战斗', '目标、位置和资源连续结算', '对抗', 'sentence_homology', '每个动作句明确意图、反馈和新局面', '句长随判断压力变化而非全篇短句', '招式名和感官词连续堆叠'),
    ('meal', '饭桌交锋', '日常礼节承载关系权力', '家庭或同盟', 'orphaned_sophistication', '用夹菜、座次、买单和被忽略的问题体现站队', '让一句表面日常的话改变某人的决定', '所有矛盾靠阴阳怪气台词'),
    ('arrival', '进入新场所', '环境信息转化为人物判断', '陌生', 'description_load', '只描写会影响路线、身份判断或风险的细节', '让人物注意什么暴露其经验与偏见', '先停下剧情展示全景'),
    ('decision', '艰难决定', '人物支付代价并关闭其他路径', '自我冲突', 'emotion_grounding', '把选项写成各自会伤害谁或失去什么', '决定通过动作执行，不用旁白宣布成长', '长篇权衡后仍维持原状'),
    ('failure', '计划失败', '错误因果被看见并形成新策略', '团队', 'causal_gap', '失败源自可追溯假设、资源或沟通缺口', '不同人物对责任的处理体现关系与能力', '天降意外强行打断成功'),
    ('victory', '阶段胜利', '兑现承诺同时打开更高成本', '同盟', 'reader_pull', '先结算读者等待的具体收益', '再让收益带出义务、暴露或关系变化', '胜利后立刻凭空出现更大反派'),
    ('intimacy', '亲密相处', '边界与信任发生微小变化', '暧昧或亲密', 'emotion_grounding', '用允许对方做一件以前不允许的事表现靠近', '保留生活摩擦，避免双方突然完美同步', '用脸红心跳循环代替关系变化'),
    ('argument', '争吵', '表层议题裂开并露出真正需求', '紧张', 'character_voice', '双方使用各自惯用的攻击、防御或回避方式', '至少一方因对方一句话改变策略而非只提高音量', '台词可互换到任何角色'),
    ('aftermath', '事件余波', '身体、关系和资源后果被结算', '修复', 'chapter_bridge', '先处理必须立刻完成的现实动作', '让情绪从动作失误、回避或补偿中出现', '复述上一场高潮全过程'),
    ('transition', '章间过渡', '上一章终态自然成为下一章开态', '持续', 'chapter_bridge', '带入一个未完成动作、知识差或情绪余波', '用新的具体阻力改变节奏而非机械报时换景', '用后来、与此同时直接跳过因果')
)
INSERT INTO "technique_cards" (
  "id", "source_id", "card_key", "title", "genre", "scene_type", "reader_effect",
  "relationship_stage", "point_of_view", "narrative_distance", "pace", "defect_targets",
  "techniques", "style_stats", "avoid", "searchable_text", "abstraction_hash", "active"
)
SELECT
  'craft_' || md5(genres.code || ':' || scenes.code),
  'builtin.agent3.craft.v1',
  'builtin.agent3.' || genres.code || '.' || scenes.code,
  genres.label || '·' || scenes.label,
  genres.label,
  scenes.label,
  scenes.effect,
  scenes.relation_stage,
  genres.pov,
  genres.distance,
  genres.pace,
  ARRAY[scenes.defect],
  jsonb_build_array(genres.genre_rule, scenes.technique_a, scenes.technique_b),
  jsonb_build_object('rhetoricDensity', 'contextual', 'dialogueRatio', 'scene-dependent', 'sentenceRhythm', genres.pace, 'narrativeDistance', genres.distance),
  jsonb_build_array(genres.genre_avoid, scenes.scene_avoid, '不得复写任何来源原文或克隆在世作者'),
  genres.label || ' ' || scenes.label || ' ' || scenes.effect || ' ' || genres.genre_rule || ' ' || scenes.technique_a || ' ' || scenes.technique_b || ' ' || scenes.defect,
  md5(genres.code || ':' || scenes.code || ':' || scenes.technique_a || ':' || scenes.technique_b),
  true
FROM genres CROSS JOIN scenes;
