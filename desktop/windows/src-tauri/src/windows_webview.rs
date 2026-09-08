use crate::navigation::{is_app_url, is_external_url, APP_ORIGIN};
use std::sync::{
    atomic::{AtomicBool, AtomicUsize, Ordering},
    Arc,
};
use tauri::{Manager, WebviewWindow};
use tauri_plugin_opener::OpenerExt;
use webview2_com::{
    take_pwstr, Microsoft::Web::WebView2::Win32::*, NavigationCompletedEventHandler,
    NewWindowRequestedEventHandler, PermissionRequestedEventHandler, ProcessFailedEventHandler,
};
use windows::core::{Interface, BOOL, HSTRING, PWSTR};

/// Windows-specific permission/navigation/crash hooks are kept here, not in the web UI.
pub fn install(window: &WebviewWindow) -> tauri::Result<()> {
    let owned = window.clone();
    window.with_webview(move |platform| {
        // SAFETY: all COM interfaces and handlers are created/used on the WebView UI thread.
        // Strings returned by WebView2 are consumed with take_pwstr (CoTaskMemFree).
        let install = || -> windows::core::Result<()> { unsafe {
            let webview = platform.controller().CoreWebView2()?;
            let settings: ICoreWebView2Settings2 = webview.Settings()?.cast()?;
            let mut ua = PWSTR::null();
            settings.UserAgent(&mut ua)?;
            let ua = format!("{} ChevoinkDesktop/{}", take_pwstr(ua), env!("CARGO_PKG_VERSION"));
            settings.SetUserAgent(&HSTRING::from(ua))?;
            let permission_window = owned.clone();
            let mut token = 0;
            webview.add_PermissionRequested(&PermissionRequestedEventHandler::create(Box::new(move |_, args| {
                let Some(args) = args else { return Ok(()); };
                let mut uri = PWSTR::null(); args.Uri(&mut uri)?;
                let origin = url::Url::parse(&take_pwstr(uri)).is_ok_and(|url| is_app_url(&url));
                let mut kind = COREWEBVIEW2_PERMISSION_KIND::default(); args.PermissionKind(&mut kind)?;
                let mut gesture = BOOL::default(); args.IsUserInitiated(&mut gesture)?;
                let allow_prompt = origin && gesture.as_bool() && permission_window.is_focused().unwrap_or(false)
                    && kind == COREWEBVIEW2_PERMISSION_KIND_MICROPHONE;
                args.SetState(if allow_prompt { COREWEBVIEW2_PERMISSION_STATE_DEFAULT } else { COREWEBVIEW2_PERMISSION_STATE_DENY })?;
                Ok(())
            })), &mut token)?;
            let popup_window = owned.clone();
            webview.add_NewWindowRequested(&NewWindowRequestedEventHandler::create(Box::new(move |_, args| {
                let Some(args) = args else { return Ok(()); };
                args.SetHandled(true)?;
                let mut gesture = BOOL::default(); args.IsUserInitiated(&mut gesture)?;
                let mut uri = PWSTR::null(); args.Uri(&mut uri)?;
                let uri = take_pwstr(uri);
                if gesture.as_bool() && popup_window.url().is_ok_and(|url| is_app_url(&url)) {
                    if let Ok(url) = url::Url::parse(&uri) {
                        if is_app_url(&url) { let _ = popup_window.navigate(url); }
                        else if is_external_url(&url) { let _ = popup_window.app_handle().opener().open_url(uri, None::<&str>); }
                    }
                }
                Ok(())
            })), &mut token)?;
            let loaded = Arc::new(AtomicBool::new(false));
            let load_window = owned.clone();
            webview.add_NavigationCompleted(&NavigationCompletedEventHandler::create(Box::new(move |sender, args| {
                let (Some(sender), Some(args)) = (sender, args) else { return Ok(()); };
                let mut uri = PWSTR::null(); sender.Source(&mut uri)?;
                let remote = url::Url::parse(&take_pwstr(uri)).is_ok_and(|url| is_app_url(&url));
                let mut success = BOOL::default(); args.IsSuccess(&mut success)?;
                if remote && success.as_bool() { loaded.store(true, Ordering::SeqCst); }
                else if !success.as_bool() && !loaded.load(Ordering::SeqCst) {
                    let _ = load_window.navigate("http://tauri.localhost/".parse().unwrap());
                }
                Ok(())
            })), &mut token)?;
            let crashes = Arc::new(AtomicUsize::new(0));
            let crash_window = owned.clone();
            webview.add_ProcessFailed(&ProcessFailedEventHandler::create(Box::new(move |_, _| {
                if crashes.fetch_add(1, Ordering::SeqCst) == 0 { let _ = crash_window.reload(); }
                else {
                    crate::window::notice("页面进程异常", "已停止自动重载。请重新打开客户端；已保存资料保留，不会重新发送任务。");
                }
                Ok(())
            })), &mut token)?;
            webview.Navigate(&HSTRING::from(APP_ORIGIN))?;
            Ok(())
        }};
        if install().is_err() {
            // Fail closed: no remote page is loaded without the complete permission policy.
            crate::window::notice("Windows 内核初始化失败", "无法建立安全的浏览器环境，请更新 WebView2 后重试。未连接创作任务。");
        }
    })
}
