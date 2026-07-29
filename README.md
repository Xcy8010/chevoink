# 启创墨域 Chevoink

AI 驱动的全栈小说创作与阅读平台：读者可以在书城发现、追更、听书，作者可以在创作区与写作 Agent 协作产出章节，社区提供帖子、话题与私信互动。支持网页端与安卓 APP（Capacitor 壳 + 应用内更新）。

线上地址：<https://chevoink.chevolink.com>

## 功能一览

- **阅读区**：书城首页（轮播、榜单、分类推荐）、书架与阅读进度云同步、沉浸式阅读器、TTS 听书
- **创作区**：小说/章节管理、AI 写作 Agent（流式事件、工具调用、知识集 Skill）、AI 封面生成
- **社区**：帖子与话题系统、推荐算法、评论/点赞/收藏、关注与粉丝、私信与在线状态
- **账号体系**：手机号验证码登录（腾讯云短信）、HttpOnly Cookie 会话 + Bearer 备选通道（安卓壳杀后台不掉登录）
- **安卓客户端**：Capacitor 壳加载远程站点，应用内检测更新与 APK 分发

## 技术栈

| 层 | 技术 |
| --- | --- |
| 前端 | React 18 · Vite 6 · TypeScript · TailwindCSS · React Query 5 · Zustand 5 · React Router 7 |
| 后端 | Express 4 · Prisma 6 · PostgreSQL · Zod |
| AI | DeepSeek 文本生成 · OpenAI 兼容图像生成 · Edge TTS 语音合成 |
| 部署 | PM2 + nginx（生产）· 安卓 Capacitor 壳工程（独立仓库目录） |

## 目录结构

```
├── api/               # Express 后端（routes 路由、lib 业务模块、config 环境配置）
├── src/               # React 前端（app 壳与路由、features 业务域、components 通用组件）
├── shared/contracts/  # 前后端共享的类型契约
├── prisma/            # 数据模型 schema 与迁移、种子数据
├── deploy/            # nginx 配置与服务器部署脚本
├── scripts/           # 部署 / 推送 / 数据清理脚本
└── public/            # 静态资源
```

## 快速开始

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
| `npm run lint` | ESLint 检查 |
| `npm run build` | 生产构建 |
| `npm run deploy:prod` | 一键部署到生产服务器 |

## 部署与发布

- **生产部署**：`npm run deploy:prod`（本地检查 → 构建 → 打包上传 → 远端迁移/构建 → PM2 重载 → 健康检查）
- **推送 GitHub**：`powershell -ExecutionPolicy Bypass -File scripts\push-to-github.ps1`，支持 `-Tag v1.01 -ReleaseAsset <apk路径>` 打 Tag 并发布 Release（附安卓 APK）
- **安卓 APK**：由独立的 Capacitor 壳工程构建，通过应用内更新条幅 / 设置页检测更新分发

## 环境变量

所有密钥通过 `.env` 注入（数据库、会话签名、腾讯云短信、AI 服务等），模板见 [.env.example](.env.example)。`.env`、证书、密钥库等敏感文件均已被 `.gitignore` 排除，不会进入仓库。

## License

私有项目，保留所有权利，未经授权不得使用、复制或分发。
