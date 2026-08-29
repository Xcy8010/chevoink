# <img src="public/favicon.png" alt="启创墨域" width="40" height="40"> 启创墨域 Chevoink

**简体中文** | [English](./README.en.md)

这是一个 AI 应用——AI 驱动的全栈小说创作与阅读平台：读者可以在书城发现、追更、听书，作者可以在创作区与写作 Agent 协作产出章节（Agent 支持图片/文件附件、视觉看图、参考资料读取、联网搜索调研与站内作品参考），社区提供帖子、话题与私信互动。支持网页端与安卓 APP（Capacitor 壳 + 应用内更新）。

🌐 线上地址：<https://chevoink.chevolink.com>

[![CI](https://github.com/Xcy8010/chevoink/actions/workflows/ci.yml/badge.svg)](https://github.com/Xcy8010/chevoink/actions/workflows/ci.yml)
[![GitHub stars](https://img.shields.io/github/stars/Xcy8010/chevoink?style=flat&logo=github&label=Stars)](https://github.com/Xcy8010/chevoink/stargazers)
[![License](https://img.shields.io/badge/License-MIT-crimson)](#-license)
[![React](https://img.shields.io/badge/React-18-61dafb?logo=react&logoColor=white)](#-技术栈)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-3178c6?logo=typescript&logoColor=white)](#-技术栈)
[![Release](https://img.shields.io/github/v/release/Xcy8010/chevoink?label=Release&color=gold)](https://github.com/Xcy8010/chevoink/releases)
[![QQ 交流群](https://img.shields.io/badge/QQ%E4%BA%A4%E6%B5%81%E7%BE%A4-158443235-blue?logo=tencentqq&logoColor=white)](https://qun.qq.com/universal-share/share?ac=1&authKey=O%2Bhtn0O51Qt5fW67Pj%2BSV7v0QI1%2FESTce7xHduNryLjTadVyekW9TMJcs0Wd5Qap&busi_data=eyJncm91cENvZGUiOiIxNTg0NDMyMzUiLCJ0b2tlbiI6ImdkU3I4ckRWR1M1L3hjTklTTGxHUnVYdVJ6bFNJeXN0c2ozbk1qd0pEeXpZb0JrdkZsbVNyUGtXY3lHZUFGYXQiLCJ1aW4iOiIyNDQ5MTI5ODYyIn0%3D&data=ys8RFeB2nMSORLKaLMkGLLRE8N8WU2t9WCjktU9Dg5YogAZktMZLLLMTj5t2KvcXA8K4p4J2NLPUEV0FO9OpRw&svctype=4&tempid=h5_group_info)

## 🖥️ 产品预览

**桌面端**

<table>
  <tr>
    <td align="center"><img src="public/PCdemo1.png" alt="桌面端演示 1" width="420"><br>书城与阅读链路</td>
    <td align="center"><img src="public/PCdemo2.png" alt="桌面端演示 2" width="420"><br>创作区与 AI 写作 Agent</td>
  </tr>
</table>

**移动端**

<table>
  <tr>
    <td align="center"><img src="public/MOBILEdemo1.jpg" alt="移动端演示 1" width="420"><br>手机端首页与社区</td>
    <td align="center"><img src="public/MOBILEdemo2.jpg" alt="移动端演示 2" width="420"><br>手机端创作与阅读</td>
  </tr>
</table>

## 🧭 快速导航

| 想做什么 | 去哪里 |
| --- | --- |
| 直接体验产品 | [线上地址](https://chevoink.chevolink.com)（网页端，无需安装） |
| 安装安卓 APP | [下载与安装教程](#-下载与安装安卓-app) · [Releases 页面](https://github.com/Xcy8010/chevoink/releases) |
| 了解怎么用 | [使用教程](#-使用教程) |
| 了解功能 | [功能一览](#-功能一览) |
| 本地跑起来 | [快速开始](#-快速开始) |
| 了解架构 | [技术栈](#-技术栈) · [目录结构](#-目录结构) |
| 深入工程细节 | 详细工程说明请参阅 [Engineering Documentation](./docs/ENGINEERING.md)（[English](./docs/ENGINEERING.en.md)）· 开发规范请参阅 [Development Standards](./docs/DEVELOPMENT-STANDARDS.md)（[English](./docs/DEVELOPMENT-STANDARDS.en.md)）· Agent 2.0 发布见 [运维手册](./docs/AGENT-2.0-OPERATIONS.md) |
| 部署上线 | [部署与发布](#-部署与发布) · [环境变量](#-环境变量) |
| 交流讨论 | [QQ 交流群 158443235](#-交流群) |

## 📥 下载与安装（安卓 APP）

两种方式任选其一：

1. **GitHub Releases（推荐）**
   - 打开 [Releases 页面](https://github.com/Xcy8010/chevoink/releases)，进入最新版本（如 `v1.07`）；
   - 在 Assets 中下载 `chevoink-vX.XX.apk` 到手机；
   - 点击安装。系统若提示「未知来源应用」，在弹窗中允许「本次安装」即可（APK 已使用发布密钥签名）。
2. **官网直装**
   - 手机浏览器访问 <https://chevoink.chevolink.com/download/chevoink.apk> 直接下载安装。

安装后无需手动升级：APP 启动时会自动检测新版本，站内条幅 / 设置页会提示更新并引导下载。网页端用户打开线上地址即是最新版。

## 📖 使用教程

### 读者

1. **登录**：手机号 + 短信验证码，无需注册流程，首次登录自动建号；
2. **找书**：书城首页有轮播、榜单与分类推荐，也可搜索书名/作者；
3. **阅读**：进入正文后左右翻页，点击屏幕中央呼出菜单，可调字号、字体、纸色主题、翻页方式；阅读进度与书架自动云同步，换设备接着读；
4. **听书**：阅读器内开启 TTS 听书，支持切换音色与语速，翻页模式下有底部播放胶囊；
5. **互动**：书籍详情页可评论、点赞、收藏；社区区可发帖、参与话题、关注作者、私信聊天。

### 作者

1. 进入**创作区**，「新建作品」填写书名、简介与标签；
2. 在章节编辑器直接写作，或呼出 **AI 写作 Agent**：默认最大权限自主执行（工具调用自动批准，保留追踪按钮），能按你的设定与知识集（世界观、人物卡）流式生成章节草稿、改写润色，还能联网搜索调研素材、参考站内已上架作品与本人未公开作品（二创/写序章、类似作品识别）、跨会话记忆你的偏好，全程可干预；
3. 在 Work、IDE 或手机端的**作品技能**区，用“新建”把长期可复用的写作规则存成私有草稿；每个字段都有示例提示，也可直接在对话说“为我创建一个……技能”。Agent 会生成草稿并运行正/负触发测试，只有你明确确认后才发布启用；共享技能可由你确认后安装，第三方源码导入则必须填写许可证、归属与固定版本；
4. 输入框可附加**图片（≤6 张）与文件（≤3 个，pdf/docx/txt/md）**随提示词发送，Agent 会先用视觉/读取工具理解附件再行动；对话内文件可点击打开、长文件内容默认折叠；
5. 用 **AI 封面生成**一键产出封面图（远程直链自动落盘本站）；也可以让 Agent 直接「查看当前封面」核对画面效果；
6. **一键导出**：沉浸模式工具栏、「…」更多菜单与手机端「更多」均可发起，勾选导出范围（规划/目录/章节/作品信息以及发布建议，章节可逐章自选），服务端打包 zip 直接下载，附 AI 按番茄小说官方词表生成的发布建议；也可在对话里让 Agent 按需导出（只导出指定章节、排除某部分内容）；
7. 章节写完点击发布，读者端即刻可见；支持定时追更与章节管理。

## ✨ 功能一览

- **阅读区**：书城首页（轮播、榜单、分类推荐）、书架与阅读进度云同步、沉浸式阅读器、TTS 听书
- **创作区**：小说/章节管理、AI 写作 Agent（流式事件、Harness 式紧凑工具过程与运行态、知识集 Skill、用户/Agent 创建私有技能、共享技能确认安装、默认最大权限、图片/文件附件、视觉看图、pdf/docx/txt/md 参考资料读取、联网搜索与网页阅读、站内作品参考（查看全站已上架作品与本人未公开作品、按标签/题材识别类似作品、站内无果联网补充，支持二创/写序章）、跨会话记忆）、AI 封面生成（远程直链自动落盘）、一键导出 zip（规划/目录/章节/作品信息以及发布建议，附番茄小说官方词表发布建议，Agent 工具可按需裁剪）
- **社区**：帖子与话题系统、推荐算法、评论/点赞/收藏、关注与粉丝、私信与在线状态
- **账号体系**：手机号验证码登录（腾讯云短信）、HttpOnly Cookie 会话 + Bearer 备选通道（安卓壳杀后台不掉登录）
- **管理后台**：数据看板、用户/作品/内容治理、移动端适配
- **安卓客户端**：Capacitor 壳加载远程站点，应用内检测更新与 APK 分发

## 🛠️ 技术栈

| 层 | 技术 |
| --- | --- |
| 前端 | React 18 · Vite 6 · TypeScript · TailwindCSS · React Query 5 · Zustand 5 · React Router 7 |
| 后端 | Express 4 · Prisma 6 · PostgreSQL · Zod |
| AI | DeepSeek 文本生成 · 智谱 GLM-4.1V 图像理解 · OpenAI 兼容图像生成 · Edge TTS 语音合成 · 博查联网搜索（多引擎降级） |
| Agent | 统一写作 loop 引擎（`api/lib/agent`）：loop 调度内核 + 工具集 + 权限守卫 + 知识集 Skill，前端消费标准事件流 |
| 测试 | Vitest + Supertest（单元与集成冒烟；开箱即用——clone 后直接 `npm test`，无测试库时 DB 用例自动跳过） |
| 部署 | PM2 + nginx（生产）· GitHub Actions CI（push 即跑类型检查/lint/单测/集成测试）· 安卓 Capacitor 壳工程（独立仓库目录） |

## 📁 目录结构

```
├── api/               # Express 后端（routes 路由、lib 业务模块、config 环境配置）
├── src/               # React 前端（app 壳与路由、features 业务域、components 通用组件）
├── shared/contracts/  # 前后端共享的类型契约
├── prisma/            # 数据模型 schema 与迁移、种子数据
├── tests/             # Vitest 测试（单元 + 集成冒烟，环境见 tests/.env.test.example）
├── docs/              # 工程文档（ENGINEERING 与 DEVELOPMENT-STANDARDS，均中英文双语）
├── plan/              # 各阶段规划方案快照（24 篇 + 并行执行清单）
├── deploy/            # nginx 配置与服务器部署脚本
├── scripts/           # 部署 / 推送 / 数据清理脚本
└── public/            # 静态资源
```

## 🚀 快速开始

```bash
# 1. 安装依赖
npm install

# 2. 配置环境变量（参考 .env.example，填入数据库连接、AI Key 等）
copy .env.example .env

# 3. 初始化数据库
npm run prisma:generate
npm run prisma:migrate:deploy
npm run prisma:seed   # 可选：种子数据

# 4. 启动开发（前端 Vite + 后端 nodemon 并行）
npm run dev
```

常用脚本：

| 命令 | 说明 |
| --- | --- |
| `npm run dev` | 前后端并行开发 |
| `npm run check` | TypeScript 类型检查 |
| `npm run test` | 运行测试（Vitest） |
| `npm run lint` | ESLint 检查 |
| `npm run build` | 生产构建 |
| `npm run deploy:prod` | 一键部署到生产服务器 |

## 📦 部署与发布

- **生产部署**：`npm run deploy:prod`（本地闸门：类型检查 → 测试 → 生产依赖安全审计 → 构建；然后打包上传 → 远端迁移/构建 → PM2 重载 → 健康检查）
- **推送 GitHub**：`powershell -ExecutionPolicy Bypass -File scripts\push-to-github.ps1`，支持 `-Tag v1.07 -ReleaseAsset <apk路径>` 打 Tag 并发布 Release（附安卓 APK）
- **安卓 APK**：由独立的 Capacitor 壳工程构建，通过应用内更新条幅 / 设置页检测更新分发

## 🔐 环境变量

所有密钥通过 `.env` 注入（数据库、会话签名、腾讯云短信、AI 服务等），模板见 [.env.example](.env.example)。`.env`、证书、密钥库等敏感文件均已被 `.gitignore` 排除，不会进入仓库。

## 💬 交流群

欢迎加入 **启创墨域交流群**（QQ 群号：`158443235`），讨论使用体验、反馈问题或参与共建：

👉 [点击加入 QQ 交流群](https://qun.qq.com/universal-share/share?ac=1&authKey=O%2Bhtn0O51Qt5fW67Pj%2BSV7v0QI1%2FESTce7xHduNryLjTadVyekW9TMJcs0Wd5Qap&busi_data=eyJncm91cENvZGUiOiIxNTg0NDMyMzUiLCJ0b2tlbiI6ImdkU3I4ckRWR1M1L3hjTklTTGxHUnVYdVJ6bFNJeXN0c2ozbk1qd0pEeXpZb0JrdkZsbVNyUGtXY3lHZUFGYXQiLCJ1aW4iOiIyNDQ5MTI5ODYyIn0%3D&data=ys8RFeB2nMSORLKaLMkGLLRE8N8WU2t9WCjktU9Dg5YogAZktMZLLLMTj5t2KvcXA8K4p4J2NLPUEV0FO9OpRw&svctype=4&tempid=h5_group_info)

## 📄 License

本项目基于 [MIT License](LICENSE) 开源：可自由使用、修改与分发，需保留版权声明。

## 🙏 特别鸣谢

Chevoink 是独立设计与实现的开源项目。在 Agent 2.0、小说工程结构和创作区体验的演进过程中，以下优秀开源项目提供了重要参考：

| 开源项目 | Chevoink 中的参考位置 | 主要参考内容 |
| --- | --- | --- |
| [OpenAI Codex](https://github.com/openai/codex) | 写作 Agent Loop、Work 模式、任务与工具执行过程、上下文整理 | Agent-first 工作流、可追踪工具调用、长任务连续执行、上下文压缩，以及克制的工作台信息层级与可折叠侧栏思路 |
| [OpenFic](https://github.com/syrizelink/OpenFic) | IDE 模式、作品树、卷章结构、小说检索与创作 Skill | 面向小说创作的 IDE 信息架构、`卷 → 章`领域模型、面板布局持久化、章节检索流程及开放式创作能力组织方式 |
| [TencentDB Agent Memory](https://github.com/TencentCloud/TencentDB-Agent-Memory) | Agent 2.0 作品记忆、人物关系、事件与冲突审核 | 分层记忆、来源与版本追踪、混合召回、记忆更新和冲突治理等工程思路 |
| [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) | Work / IDE 对话区的思考过程与工具活动 UI | 推理过程的渐进披露、执行状态表达，以及工具调用记录的紧凑视觉层级 |
| [React Flow / xyflow](https://github.com/xyflow/xyflow) | 作品记忆关系图 | 直接使用 `@xyflow/react` 实现关系图的拖拽平移、缩放、视口适配、控制器和缩略图导航 |

上述项目主要用于架构研究、产品交互与工程原则参考；除项目依赖清单中明确引入的第三方软件外，Chevoink 的业务代码均结合自身技术栈与小说创作场景重新设计实现。感谢这些项目及其贡献者推动开源 Agent 与创作工具生态持续发展。
