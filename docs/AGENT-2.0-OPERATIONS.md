# 创作区与 Agent 2.0 发布运维手册

> 适用版本：Agent 2.0 首个生产版本。本文是部署、灰度、监控、修复与回滚的唯一操作入口；架构与开发约束仍以 `ENGINEERING.md`、`DEVELOPMENT-STANDARDS.md` 为准。

## 1. 发布边界

本版本包含卷→章结构、全书检索与 ChangeSet、可恢复上下文、故事记忆 2.0、可组合写作 Skill，以及 Work/IDE 双工作区。所有增量能力共用 1.0 的登录态、Agent Run/SSE、审批、审计、导出和章节正文数据，不建立第二套业务状态。

上线不会删除原稿。Volume 迁移为存量作品创建默认卷；章节仍保留全书 `orderIndex`，旧客户端可继续只读。ChangeSet、上下文检查点和记忆 2.0 使用独立表或兼容扩展字段，关闭功能开关后数据仍保留。

## 2. 五项独立开关与单用户灰度

```dotenv
FEATURE_VOLUME_ENABLED=true
FEATURE_CHANGESET_ENABLED=true
FEATURE_MEMORY2_ENABLED=true
FEATURE_SKILL2_ENABLED=true
FEATURE_DUAL_WORKSPACE_ENABLED=true
AGENT2_ROLLOUT_USER_IDS=
```

- 五项开关均默认开启；设为 `false` 后仅关闭对应 2.0 入口和 Agent 工具，不删表、不删数据。
- `AGENT2_ROLLOUT_USER_IDS` 留空表示全量；填用户 ID（英文逗号分隔）时，只有名单用户进入 `v2`，其余账号返回 `v1-compatible`。
- `GET /api/meta` 与创作区聚合接口返回当前用户实际生效的开关。前端关闭双工作区时固定回到 IDE；关闭 Memory2/ChangeSet 时不渲染相应抽屉；服务端同时拒绝直连接口，避免只做 UI 隐藏。
- `AGENT_AUTO_APPROVE` 保持既有默认值；ChangeSet 应用与整体回滚仍由 `alwaysConfirm` 强制逐次确认。

建议灰度顺序：先仅填作者自己的用户 ID，观察至少一个完整创作周期；再扩到小比例真实作者；最后清空名单全量。每次只扩大名单，不同时改数据库结构和模型供应商。

## 3. 部署前门禁

严格按以下顺序执行，任一失败即停止发布：

```powershell
npx.cmd tsc --noEmit
npm.cmd test
npm.cmd run build
npm.cmd run lint
```

随后执行生产部署脚本。脚本还会运行生产依赖高危漏洞审计、白名单打包、远端迁移、服务重载、内网健康检查与公网 HEAD 检查。

```powershell
npm.cmd run deploy:prod -- -SkipLocalChecks
```

仅在本轮四闸刚刚全部通过时使用 `-SkipLocalChecks`，避免重复执行；否则直接运行 `npm.cmd run deploy:prod`。

## 4. 运维诊断与修复工具

所有写操作默认 dry-run，只有显式追加 `--apply` 才修改数据。可用 `--novel=<作品ID>` 限定单部作品。

```powershell
# 结构、记忆任务、待审核记忆和未闭合 ChangeSet 总览
npm.cmd run agent2:ops -- diagnose

# 查看/修复默认卷、卷序、卷内章序和全书章序
npm.cmd run agent2:ops -- repair-structure --novel=<作品ID>
npm.cmd run agent2:ops -- repair-structure --novel=<作品ID> --apply

# 低峰期并发重建章节与记忆检索索引
npm.cmd run agent2:ops -- rebuild-indexes
npm.cmd run agent2:ops -- rebuild-indexes --apply

# 按当前章节 revision 幂等重提取记忆
npm.cmd run agent2:ops -- reextract-memory --novel=<作品ID>
npm.cmd run agent2:ops -- reextract-memory --novel=<作品ID> --apply

# 最近 7 天 v1-compatible/v2 运行量、成功失败数、平均轮次和耗时
npm.cmd run agent2:ops -- rollout-metrics
```

执行 `--apply` 前必须确认数据库快照有效。索引重建使用 `CONCURRENTLY`，仍应在低峰执行；记忆重提取会增加数据库和模型上下文负载，应优先按单作品处理。

## 5. 监控与发布判定

灰度期间至少观察：Agent 完成率/失败率/平均轮次/耗时；上下文压缩次数与硬约束校验；ChangeSet 命中、冲突、应用和回滚；记忆任务 pending/failed、冲突审核箱；API 5xx、SSE 重连和数据库锁等待。

发布阻断条件：出现正文丢失或跨作品写入；ChangeSet 部分提交；卷章顺序重复/空洞；已确认记忆被静默覆盖；APP 恢复后重复执行写工具。发现任一项立即停止扩量并按第 6 节回退。

建议 SLO：ChangeSet 无并发冲突时原子提交率 100%；确定事实冲突静默覆盖率 0；上下文压缩硬约束保留率 100%；记忆抽取失败任务可重试且无重复事实；健康接口和公网首页持续可用。

## 6. 分级回滚

1. **功能回退（首选，分钟级）**：将对应 `FEATURE_*` 设为 `false`，或把灰度名单缩回单用户，重载服务。数据保留，可随时再开。
2. **Agent 收紧**：怀疑写工具风险时额外设置 `AGENT_AUTO_APPROVE=false`，恢复完整审批流；ChangeSet 强确认不受该值影响。
3. **应用版本回退**：部署上一个已验证提交，但保留 2.0 数据表；旧版本按原 `orderIndex` 读取章节，作者仍可导出全文。
4. **数据库回退（最后手段）**：只在生产流量停止、完整备份可恢复且确认旧版本无法带新表运行时，按各迁移目录中的 `rollback.sql` 逆序执行。Memory2/ChangeSet 回滚会丢弃派生数据，因此通常不应执行；正文和结构导出必须先完成。

任何回滚后都要先运行 `diagnose`，再验证随机作品的卷章顺序、全文导出、Agent 只读问答和健康接口。

## 7. 数据可携带性与线上验收

现有“一键导出”继续提供作品信息、目录、计划和全部章节 ZIP；2.0 不改变原稿导出入口。发布后由产品验收者在真实网页与 APP 完成：Work/IDE 切换、手机键盘连续开合、前后台恢复、全局改名预览/排除/回滚、记忆冲突审核、长对话压缩恢复、卷章移动及完整导出。

多题材真实模型盲评和线上视觉/APP 验收属于发布后人工验收，不以单元测试替代。验收结果应记录模型、参数、样本、设备、APP 版本和失败截图，失败项回到对应功能开关而不是直接修改生产数据。
