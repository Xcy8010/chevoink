# Chevoink Windows 客户端

当前为 **1.0.0 开发候选版**，不是已完成正式签名与真机验收的稳定版。内部 CI 安装包不能替代公开 Release。发布状态与验收边界见 [Windows 工程说明](../../docs/WINDOWS_DESKTOP.md)。

## 架构

Tauri 2 / WebView2 Evergreen 加载 `https://chevoink.chevolink.com`。不复制创作业务，不在本地运行后端、数据库或 Agent。标准标题栏之外继续使用网站界面；关闭客户端不暂停云端任务，重新打开不自动发送“继续”。

Windows 保存握手通过根项目 `src/lib/desktop-lifecycle.ts` 接入原编辑保存与草稿逻辑。网页适配未部署时，宿主不会把无回执认定为已保存；会提示保留窗口或明确放弃未保存内容。

## 开发和构建

需要根仓库固定的 Node 22.23.2 / npm 10.9.8、`rust-toolchain.toml` 指定的 Rust 1.94.0，以及 MSVC C++ Build Tools、Windows SDK 和 WebView2。不得通过关闭系统防护解决安装问题。

在本目录执行：

```sh
npm ci
npm run dev
cargo fmt --all --manifest-path src-tauri/Cargo.toml -- --check
cargo clippy --locked --manifest-path src-tauri/Cargo.toml --all-targets -- -D warnings
cargo test --locked --manifest-path src-tauri/Cargo.toml
npm run build -- --ci
```

开发启动使用 `com.chevoink.desktop.dev`，正式配置使用 `com.chevoink.desktop`。二者 WebView2 数据目录独立；开发配置禁止使用正式更新通道。即使数据隔离，开发壳仍连接官网，不得用真实作品做破坏性测试。

安装包生成在 `src-tauri/target/release/bundle/nsis/`。当前未配置正式签名时仅供内部测试。增强版离线 WebView2 安装包、正式发布流水线与更新实包验证尚未验收。

## 安全与退出

- 页面仅有版本查询和带一次性 nonce 的保存回执能力；没有任意 shell、文件路径或安装指令桥接。
- 主站 origin 精确校验。外部 HTTPS 用户点击交给浏览器；其他协议拒绝。
- 导出用系统保存对话框。WebView2 下载 deferral 留在 UI apartment，选择文件的对话框不阻塞下载事件回调；完成、取消、失败分别处理。
- 正常退出等待原保存链路。保存失败、录音/下载未结束或用户在等待期间继续输入，不自动关闭。不会自动接受/拒绝审查。
- 不记录账号凭据或正文。Windows 停止 localStorage Bearer 兜底，Cookie 会话仍由原服务管理。

## 发布约束

Windows 标签为 `windows-v<version>`，安装包为 `Chevoink_<version>_x64-setup.exe`。Windows Release 必须设置 `latest=false`，不得抢占 Android 使用的全仓 Latest。

正式分发必须先完成 Authenticode 签名，再对最终安装包生成 Tauri updater 签名与 SHA256。编译时的 `CHEVOINK_UPDATER_PUBLIC_KEY` 仅放公钥；私钥不得进入仓库、普通构建或日志。未配置公钥时不安装更新。

版本目录：`/download/windows/<version>/`；稳定清单：`/download/windows/stable/latest.json`。先发布并核验不可变安装包，最后更新稳定清单。电脑网页设置仅在合法 Windows 稳定清单可读取时显示入口；手机 APK 通道不变。

SignPath Foundation 目前只是申请候选渠道，未获批、未配置，不能标注“已提供免费签名”。仓库的商业授权安排是否符合其条件，需先得到对方确认。
