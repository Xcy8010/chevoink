# 启创墨域 env 变量设计与密钥托管规范

## 1. 目标

这份文档用于统一：

- 本地测试阶段的环境变量命名
- AI Provider 密钥托管方式
- 前后端哪些配置可以暴露，哪些绝不能暴露
- 后续公网阶段可平滑升级的配置结构

当前阶段仍然遵循：

- 仅本地服务器运行
- 禁止公网部署相关改动
- 所有 AI 请求只允许走本地业务后端

---

## 2. 核心原则

### 2.1 前端永远不接触真实密钥

前端允许知道：

- 当前产品名
- 是否启用某个功能
- 当前用户可选的模型标识
- 当前环境是否为开发环境

前端绝不能知道：

- Provider API Key
- Provider Secret
- 后端内部签名密钥
- 数据库连接串
- 对象存储 Secret Key

### 2.2 真实密钥只允许存在于服务端

真实密钥只允许保存在：

- 本地服务端 `.env`
- 后续公网环境的系统环境变量 / Secret Manager

不允许保存在：

- 前端代码
- 浏览器 `localStorage`
- 文档 README
- 截图
- 测试账号说明
- 示例请求响应

### 2.3 `.env.example` 只保留占位符

仓库中允许提交：

- `.env.example`

仓库中禁止提交：

- `.env`
- `.env.local`
- 带真实 Key 的文档

---

## 3. 文件约定

## 3.1 当前阶段建议文件

本地开发阶段建议：

- `.env`：本地真实配置，不提交
- `.env.example`：示例配置，可提交
- `cert/README.md`：只保留配置说明，不保留真实 Key

## 3.2 `.gitignore` 必须包含

```gitignore
.env
.env.local
.env.*.local
!.env.example
```

---

## 4. env 变量命名规范

命名原则：

- 统一大写
- 用模块前缀分组
- 一个变量只表达一个含义
- 不要混用同义命名

推荐分组：

- `APP_*`
- `WEB_*`
- `SERVER_*`
- `DATABASE_*`
- `REDIS_*`
- `STORAGE_*`
- `AUTH_*`
- `AI_TEXT_*`
- `AI_IMAGE_*`
- `QUEUE_*`
- `RATE_LIMIT_*`
- `LOG_*`

---

## 5. 第一版建议 env 清单

## 5.1 应用基础

```env
APP_NAME=启创墨域
APP_ENV=development
APP_PORT=3001
APP_WEB_URL=http://localhost:5173
APP_SERVER_URL=http://localhost:3001
APP_TIMEZONE=Asia/Shanghai
```

说明：

- `APP_ENV` 只允许 `development` / `test` / `production`
- 当前测试阶段默认 `development`

## 5.2 Web 前端可暴露变量

前端只允许读 `VITE_` 前缀变量：

```env
VITE_APP_NAME=启创墨域
VITE_API_BASE_URL=http://localhost:3001
VITE_SOCKET_URL=http://localhost:3001
```

注意：

- 前端 `VITE_*` 中绝不能放任何真实密钥

## 5.3 数据库与缓存

```env
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/chevoink
REDIS_URL=redis://localhost:6379
```

## 5.4 对象存储

本地阶段如果使用 MinIO：

```env
STORAGE_PROVIDER=minio
STORAGE_ENDPOINT=http://localhost:9000
STORAGE_BUCKET=chevoink-local
STORAGE_ACCESS_KEY=minioadmin
STORAGE_SECRET_KEY=replace_me
STORAGE_REGION=local
STORAGE_PUBLIC_BASE_URL=http://localhost:9000/chevoink-local
```

如果第一版先用本地文件目录，也要预留：

```env
STORAGE_PROVIDER=local
STORAGE_LOCAL_ROOT=./storage
STORAGE_PUBLIC_BASE_URL=http://localhost:3001/storage
```

## 5.5 鉴权

```env
AUTH_JWT_ACCESS_SECRET=replace_me
AUTH_JWT_REFRESH_SECRET=replace_me
AUTH_ACCESS_TOKEN_EXPIRES_IN=15m
AUTH_REFRESH_TOKEN_EXPIRES_IN=30d
AUTH_COOKIE_DOMAIN=localhost
AUTH_COOKIE_SECURE=false
```

## 5.6 AI 文本服务

当前文本模型为 `deepseek-v4-pro`，建议：

```env
AI_TEXT_PROVIDER=deepseek
AI_TEXT_BASE_URL=https://api.deepseek.com
AI_TEXT_API_KEY=replace_me
AI_TEXT_MODEL=deepseek-v4-pro
AI_TEXT_CONTEXT_MAX_TOKENS=1000000
AI_TEXT_CONTEXT_SOFT_LIMIT=700000
AI_TEXT_CONTEXT_COMPRESS_LEVEL1=850000
AI_TEXT_CONTEXT_COMPRESS_LEVEL2=950000
AI_TEXT_SUMMARY_MODEL=deepseek-chat
AI_TEXT_TIMEOUT_MS=180000
```

## 5.7 AI 生图服务

当前封面模型为 `gpt-image-2`，建议：

```env
AI_IMAGE_PROVIDER=openai-compatible
AI_IMAGE_BASE_URL=https://your-image-provider.example.com/v1/images/generations
AI_IMAGE_API_KEY=replace_me
AI_IMAGE_MODEL=gpt-image-2
AI_IMAGE_DEFAULT_SIZE=1024x1536
AI_IMAGE_DEFAULT_COUNT=1
AI_IMAGE_TIMEOUT_MS=300000
```

## 5.8 队列与异步任务

```env
QUEUE_REDIS_URL=redis://localhost:6379
QUEUE_PREFIX=chevoink
QUEUE_COVER_CONCURRENCY=2
QUEUE_NOTIFICATION_CONCURRENCY=5
```

## 5.9 限流

```env
RATE_LIMIT_WINDOW_MS=60000
RATE_LIMIT_AUTH_MAX=20
RATE_LIMIT_AI_TEXT_MAX=30
RATE_LIMIT_AI_IMAGE_MAX=10
RATE_LIMIT_POST_CREATE_MAX=20
RATE_LIMIT_COMMENT_CREATE_MAX=60
```

## 5.10 日志

```env
LOG_LEVEL=info
LOG_PRETTY=true
LOG_REDACT_KEYS=authorization,cookie,apiKey,password,token
```

---

## 6. 前后端变量边界

## 6.1 允许前端读取

只允许通过 `VITE_*` 暴露：

- 产品名称
- API Base URL
- Socket URL
- 非敏感功能开关

## 6.2 禁止前端读取

以下变量绝不能以任何形式注入前端：

- `DATABASE_URL`
- `REDIS_URL`
- `AUTH_JWT_*`
- `AI_TEXT_API_KEY`
- `AI_IMAGE_API_KEY`
- `STORAGE_SECRET_KEY`

---

## 7. AI 配置读取规则

## 7.1 前端只传模型标识，不传真实 Key

前端请求后端时只允许传：

- 当前业务参数
- 当前用户选择的模型标识
- 当前封面生成参数

前端不允许传：

- Provider API Key
- Provider Secret
- 任意上游 URL

## 7.2 后端统一从 env 读取 Provider 配置

后端 AI 适配层必须统一读取：

- `AI_TEXT_*`
- `AI_IMAGE_*`

由服务端负责：

- URL 白名单校验
- 模型白名单校验
- 请求超时
- 重试
- 脱敏日志

---

## 8. 本地阶段密钥管理要求

### 8.1 当前必须做到

- 真实密钥只在 `.env`
- `.env` 已加入 `.gitignore`
- `cert/README.md` 不再保留真实 Key
- 日志和报错不打印完整 Key
- 所有 AI 调用只走本地后端

### 8.2 `cert` 目录处理建议

`cert/README.md` 仅保留：

- 文本模型名称
- 生图模型名称
- 需要哪些 env 变量
- 配置步骤说明

不保留：

- 真实 API Key
- 完整授权 Header
- 可直接调用的敏感示例

---

## 9. 后续公网阶段扩展位

虽然当前不做公网部署，但 env 命名应兼容后续升级。

未来可以平滑扩展：

```env
APP_ENV=production
AUTH_COOKIE_SECURE=true
STORAGE_PROVIDER=s3
AI_TEXT_PROVIDER=openrouter
AI_IMAGE_PROVIDER=custom
```

但当前阶段先不落地公网逻辑。

---

## 10. 最终结论

正式落代码前，env 变量层面必须先统一三件事：

1. **真实密钥只存在服务端 `.env`**
2. **前端只读 `VITE_*` 非敏感变量**
3. **文本 AI 与生图 AI 的配置统一由后端适配层读取**

只要先把这三件事定死，后续无论是多窗口并行开发，还是未来切公网环境，都不会因为密钥托管和变量混乱而返工。
