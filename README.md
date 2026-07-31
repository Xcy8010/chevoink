# 启创墨域 Chevoink — 安卓壳（Capacitor）

启创墨域的安卓客户端壳工程：基于 Capacitor **远程模式**，WebView 直接加载线上站点 <https://chevoink.chevolink.com>。Web 端部署即全端生效，**只有原生层改动才需要重新打 APK**。

- 主仓库（Web 全栈，`main` 分支）：<https://github.com/Xcy8010/chevoink>
- APK 下载：[GitHub Releases](https://github.com/Xcy8010/chevoink/releases) 或官网直装 <https://chevoink.chevolink.com/download/chevoink.apk>

## 架构说明

| 部分 | 说明 |
| --- | --- |
| `capacitor.config.ts` | 壳配置：远程站点地址、`appendUserAgent`（版本标识）、SplashScreen / StatusBar 插件 |
| `android/` | 原生工程：签名配置、启动图、`ImmersiveModePlugin`（自定义全屏沉浸插件） |
| `assets/` | 图标与启动图源图（经 `@capacitor/assets` 生成各密度资源） |
| 其余 `src/ api/ prisma/ ...` | 与主仓库同步的 Web 代码快照，仅用于本地 `npm run build` 产出 `dist` 供 `cap copy` |

关键原生能力：

- **UA 版本标识**：`appendUserAgent: 'ChevoinkApp/x.y.z'`，前端据此识别壳内环境并做应用内更新比对
- **ImmersiveMode 插件**：Android 15 上官方 `StatusBar.setOverlaysWebView` 已失效，阅读区真全屏沉浸由自定义插件 `android/app/src/main/java/com/chevoink/app/ImmersiveModePlugin.java` 实现
- **应用内更新**：启动时请求线上 `/download/version.json`，比对 UA 版本后展示更新条幅

## 本地构建

```bash
# 1. 安装依赖
npm install

# 2. 构建 Web 产物并同步进原生工程
npm run build
npx cap copy android

# 3. 打开 Android Studio 或命令行打包
npx cap open android
# 或
cd android && ./gradlew assembleRelease
```

产物路径：`android/app/build/outputs/apk/release/app-release.apk`

## 签名配置（不入库）

release 签名从被 gitignore 的 `android/keystore.properties` 读取，模板：

```properties
storeFile=chevoink-release.keystore
storePassword=***
keyAlias=***
keyPassword=***
```

`*.keystore` / `keystore.properties` / `.env` / `plan/` / `cert/` 等敏感与内部文件均已被 `.gitignore` 排除，缺少 `keystore.properties` 时自动回退 debug 签名（仅用于本地验证）。

## 发版流程（版本号必须三处同步）

发布新壳版本时，以下三处**必须一起改**，漏改任意一处会导致新包仍被判定为旧版、更新横幅不消失：

1. `capacitor.config.ts` → `appendUserAgent: 'ChevoinkApp/x.y.z'`
2. `android/app/build.gradle` → `versionCode`（递增）+ `versionName`
3. 线上 `/download/version.json` → `latestVersionName` / `latestVersionCode`

然后 `npm run build && npx cap copy android` 重新同步 Web 产物，再打 release 包、上传服务器 `/download/chevoink.apk` 并附到 GitHub Release。

## License

私有项目，保留所有权利，未经授权不得使用、复制或分发。
