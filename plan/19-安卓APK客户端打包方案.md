# 19-安卓 APK 客户端打包方案（Capacitor 壳工程）

> 目标：在**完全不动现有网页版**的前提下，产出一个安装即用的安卓 APK，解决目前「不同浏览器/机型适配不一致」的核心痛点。
> 铁律：现有项目（`c:\Users\Xcy24\Desktop\ai写作`）一行代码不改；所有需要修改/删除代码的动作，都在**新复制的项目副本**中进行。

---

## 1. 为什么选 Capacitor（方案选型结论）

| 方案 | 做法 | 工作量 | 适配一致性 | 结论 |
| --- | --- | --- | --- | --- |
| **Capacitor 壳工程（推荐）** | 现有 React SPA 原样装进原生 WebView 壳，可调用原生能力（状态栏/返回键/键盘/启动屏） | 1~2 天出首版 | ★★★★★ 全机型统一 Chromium 内核 | ✅ 采用 |
| TWA / PWA | 把网站声明成可信 Web 活动打包 | 半天 | ★★★ 仍依赖手机上的 Chrome | ❌ 没解决浏览器差异，且部分国产机阉割 Chrome |
| React Native / Flutter 重写 | 全部界面用原生技术重做 | 2~3 个月 | ★★★★★ | ❌ 成本完全不成比例 |
| uni-app 迁移 | 代码迁到 uni-app 体系 | 1 个月+ | ★★★★ | ❌ 等于半重写，React 代码不能直接复用 |

**核心原理**：目前的适配问题来自「每个用户的浏览器内核、版本、厂商魔改都不一样」。Capacitor 把页面装进 APP 自带的 Android System WebView（全机型统一为 Chromium 内核，Android 5+ 由 Google Play/厂商静默升级），渲染环境从「不可控的 N 种」收敛为「可控的 1 种」，再叠加原生层能力（沉浸式状态栏、软键盘模式、实体返回键），体验接近原生 APP。

已确认的项目事实（方案据此设计，无需猜测）：

- 前端 `src/app/api-base.ts` 已支持 `VITE_API_BASE_URL` 绝对 API 基址，是现成的改造钩子；
- 会话认证是 HttpOnly Cookie（`chevoink_session`，`SameSite=Lax`，`AUTH_COOKIE_DOMAIN`/`AUTH_COOKIE_SECURE` 可配）；
- 后端 `api/app.ts` 的 CORS 只放行 `env.webUrl` 单一 origin（`credentials: true`）；
- 创作区 Agent 走 SSE 流式接口、阅读区听书走 TTS 音频，这两条链路对请求方式最敏感；
- 前端已有 `keyboard-inset.ts` / `safe-area.ts` / `immersive-fullscreen.ts` 三件套，APK 内继续生效。

---

## 2. 总体架构：两阶段路线

### 阶段一：远程加载模式（先上线，强烈推荐从这里开始）

```
┌─────────── APK ───────────┐
│ 原生壳（状态栏/返回键/启动屏）│
│   └─ WebView ── 直接加载 ──┼──→ https://线上域名（现有网站原样）
└───────────────────────────┘                │
                                             └─→ /api →现有后端（零改动）
```

- `capacitor.config.ts` 里设 `server.url = 'https://线上域名'`，WebView 直接加载线上站点；
- **Cookie 同域**：会话、CORS、SSE、TTS 全部照常工作，后端一行不改；
- **网站发版即 APP 更新**：不需要重新发 APK；
- 唯一改动面 = 一个新增的壳工程，网页版代码零修改 → 完美满足「旧的不变」。

缺点（可接受）：首屏依赖网络；断网时需要一个原生兜底页。这两点在阶段一用「启动屏 + 断网重试页」缓解，追求极致再进阶段二。

### 阶段二：本地资源包模式（可选进阶，秒开+弱网可用）

```
┌────────────── APK ──────────────┐
│ 原生壳                           │
│   └─ WebView ── 加载打进包里的 dist│──→ fetch 绝对地址 https://线上域名/api
└─────────────────────────────────┘
```

- 前端 `dist` 打进 APK，秒开、弱网可浏览已缓存内容；
- 代价：页面 origin 变成 `https://localhost`（Capacitor 内部 scheme），产生跨域三件事，全部在**副本项目**中解决：
  1. 前端构建时注入 `VITE_API_BASE_URL=https://线上域名`（现有钩子，前端零代码修改）；
  2. 后端 CORS 追加放行 `https://localhost`（`origin` 从单值改数组，属**新增**不影响网页版）；
  3. 会话 Cookie 需 `SameSite=None; Secure` 才能跨站携带（`serializeSessionCookie` 增加环境开关，网页版默认值不变）。
- SSE/文件上传在 WebView 标准 fetch 下可用，但需上述 CORS 生效；
- 前端更新必须重新发 APK（或后续引入 Capgo 热更新）。

**结论：先做阶段一拿到可分发 APK，验证真机体验；阶段二视需求再启动。** 下文步骤默认阶段一，阶段二差异单独标注。

---

## 3. 项目副本创建（铁律执行）

新壳工程放在独立目录，与网页版彻底隔离：

```powershell
# 在桌面创建副本（排除依赖与产物，git 历史不带走）
robocopy "c:\Users\Xcy24\Desktop\ai写作" "c:\Users\Xcy24\Desktop\chevoink-android" /E /XD node_modules dist .git android prisma\node_modules /XF *.tar.gz *.tgz cookies.txt .tmp-ai-cookie.txt
cd c:\Users\Xcy24\Desktop\chevoink-android
git init; git add -A; git commit -m "chore: init android shell from web copy"
npm install
```

说明：

- 副本保留完整前端源码：阶段一虽然不打包 dist，但保留源码便于阶段二切换与本地调试；
- 副本中**允许**任意修改/删除；原项目 `ai写作` 目录从此与 APK 无关；
- `.env` 不复制敏感生产密钥，壳工程只需要 `VITE_API_BASE_URL`（阶段二用）。

---

## 4. 环境准备（一次性）

| 工具 | 版本要求 | 说明 |
| --- | --- | --- |
| JDK | 17（Temurin/Oracle 均可） | Capacitor 6 + AGP 8 要求 |
| Android Studio | 最新稳定版（含 SDK Platform 34+、Build-Tools、Platform-Tools） | 首次打开 android 工程自动补齐 |
| 环境变量 | `JAVA_HOME`、`ANDROID_HOME` | Android Studio 安装向导会设置 SDK 路径 |
| 真机/模拟器 | 开启 USB 调试的安卓手机（推荐真机） | 验证适配是本项目的核心目的 |

国内网络注意：Gradle 首次同步较慢，可在 `android/build.gradle` 配置阿里云镜像仓库（`maven { url 'https://maven.aliyun.com/repository/public' }`）加速。

---

## 5. Capacitor 集成步骤（副本内执行）

### 5.1 安装与初始化

```powershell
cd c:\Users\Xcy24\Desktop\chevoink-android
npm install @capacitor/core @capacitor/cli @capacitor/android
npm install @capacitor/app @capacitor/status-bar @capacitor/splash-screen @capacitor/keyboard @capacitor/network
npx cap init "启创墨域" "com.chevoink.app" --web-dir dist
npx cap add android
```

### 5.2 capacitor.config.ts（阶段一核心配置）

```ts
import type { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  appId: 'com.chevoink.app',
  appName: '启创墨域',
  webDir: 'dist',
  server: {
    // 阶段一：直接加载线上站点，Cookie 同域、网站发版即 APP 更新
    url: 'https://线上域名',
    cleartext: false,
  },
  android: {
    allowMixedContent: false,
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 800,
      backgroundColor: '#0f1115', // 与站点深色主题底色一致，避免白闪
    },
  },
}

export default config
```

> 阶段二切换：删掉 `server.url`，构建时 `npm run build`（注入 `VITE_API_BASE_URL`）→ `npx cap sync android`。

### 5.3 原生壳必做的 4 个适配

1. **实体返回键**（不做的话按返回直接退出 APP）：在壳工程入口注入一段桥接脚本（阶段一站点不动，用 `@capacitor/app` 的 `backButton` 监听 → `window.history.back()`，历史栈为空时 `App.exitApp()`）。阶段二则直接写进副本前端 `main.tsx`。
2. **状态栏沉浸**：`@capacitor/status-bar` 设置透明+深浅色图标跟随主题；配合站点现有 `safe-area.ts`（`viewport-fit=cover` 的 env(safe-area-inset-*) 在 WebView 内同样生效）。
3. **软键盘模式**：`AndroidManifest.xml` 的 activity 设 `android:windowSoftInputMode="adjustResize"`，与站点现有 `keyboard-inset.ts` 的 visualViewport 方案兼容（真机回归发帖框、聊天输入、Agent 输入三处）。
4. **断网兜底页**：`@capacitor/network` 监听离线状态，展示原生风格的「网络未连接，点按重试」页（阶段一必备，因为页面本体在远端）。

### 5.4 图标与启动屏

- 准备 1024×1024 图标源图（可用现有 favicon 升级重绘）放 `resources/icon.png`；
- `npm install -D @capacitor/assets`，执行 `npx capacitor-assets generate --android` 自动生成全尺寸 mipmap 与自适应图标；
- 启动屏底色与站点主题底色一致，杜绝启动白闪。

---

## 6. 构建、签名与分发

### 6.1 生成签名密钥（一次性，务必备份）

```powershell
keytool -genkeypair -v -keystore chevoink-release.keystore -alias chevoink -keyalg RSA -keysize 2048 -validity 36500
```

> keystore 文件与密码**绝不入库**（遵守现有密钥托管规范 08 号文档），本地保存 + 异地备份。丢失 = 以后无法覆盖安装升级。

### 6.2 配置签名并出包

`android/app/build.gradle` 增加 `signingConfigs.release`（storeFile/storePassword/keyAlias/keyPassword 从 `android/keystore.properties` 读取，该文件加入 `.gitignore`），然后：

```powershell
npx cap sync android
cd android
.\gradlew assembleRelease
# 产物：android\app\build\outputs\apk\release\app-release.apk
```

日常调试直接 `npx cap run android` 装真机热调。

### 6.3 版本与分发

- `versionCode`（整数递增）+ `versionName`（对用户显示，如 1.0.0）在 `android/app/build.gradle` 维护；
- 分发方式：官网挂 APK 下载链接（在现有 nginx 上加一个 `/download/chevoink.apk` 静态路径即可，属服务器配置**新增**，不动网页代码）；后续需要再考虑上架应用宝/小米/华为等商店（需软著，周期另计）；
- 阶段一模式下，**日常功能更新走网站发版，无需重发 APK**；只有壳能力变化（图标/插件/原生行为）才需要出新包提示用户更新。

---

## 7. 测试清单（真机回归）

| # | 场景 | 验收点 |
| --- | --- | --- |
| 1 | 登录/注册 | 短信验证码、密码登录成功；杀进程重开会话仍在（Cookie 持久化） |
| 2 | 实体返回键 | 页面内逐级返回；首页再按提示「再按一次退出」或直接退出 |
| 3 | 阅读器 | 沉浸式翻页、亮暗主题切换、状态栏颜色跟随 |
| 4 | 听书 TTS | 播放、切章连播；**锁屏/切后台是否被系统暂停**（WebView 音频后台播放受厂商省电策略影响，列为已知风险观察项） |
| 5 | 创作区 Agent | SSE 流式输出完整不断流；软键盘弹起输入框不被遮挡 |
| 6 | 发帖 | 选图上传（WebView fileChooser 调起系统相册）、#话题、发布成功 |
| 7 | 断网 | 兜底页出现，恢复网络后重试可进 |
| 8 | 多机型 | 至少覆盖：小米/华为/OPPO·vivo 各一台 + 一台低端机（验证核心痛点是否消除） |
| 9 | 深链 | 外部浏览器打开的分享链接行为正常（APP 内复制链接分享出去可被网页版打开） |

---

## 8. 风险与已知边界

1. **WebView 版本下限**：Android System WebView 可静默升级，但极老设备（Android 7 以下）内核可能偏旧；`minSdkVersion` 建议设 26（Android 8.0），覆盖 98%+ 存量设备并砍掉最差的兼容长尾。
2. **音频后台播放**：网页 Audio 在部分厂商后台会被冻结。听书若要「熄屏听」，需引入原生前台服务播放（`@capacitor-community/media` 或自写插件），归入阶段二之后的专项，不阻塞首版。
3. **Google Play 政策**：纯远程加载壳在 Google Play 可能被认定「Webview spam」拒审；国内商店与自分发无此限制。若未来要上 Play，届时切换阶段二本地包模式即可规避。
4. **阶段二 Cookie 跨站**：`SameSite=None; Secure` 全局生效会同时影响网页版 Cookie 属性（虽然功能不受影响），实施时用「按 origin 判断」或独立 header 通道方案，在副本联调充分后再动生产后端，且改动全部为增量。

---

## 9. 执行清单（里程碑）

- **M1 壳工程就绪（1 天）**：项目副本创建 → 环境安装 → Capacitor 初始化 → 远程模式配置 → 真机跑通线上站点
- **M2 原生体验四件套（1 天）**：返回键桥接 → 状态栏沉浸 → 软键盘模式 → 断网兜底页 → 图标/启动屏
- **M3 签名出包与分发（0.5 天）**：keystore 生成 → release 签名配置 → assembleRelease 出 APK → nginx 挂下载链接
- **M4 真机回归（0.5 天）**：按第 7 节清单过一遍，多机型覆盖，记录厂商差异问题
- **M5（可选，另立项）**：本地资源包模式切换 / 听书后台播放原生化 / 应用商店上架

> 工作流铁律沿用：每个里程碑完成 → 真机验证 → 交付验收；涉及后端/服务器的任何改动（阶段二 CORS、nginx 下载路径）都是**增量新增**，网页版现有行为保持不变。
