mod navigation;
mod update;
mod window;
#[cfg(windows)]
mod windows_webview;

use navigation::{is_app_url, is_fallback_url, APP_ORIGIN};
use tauri::{
    menu::{Menu, MenuItem},
    webview::NewWindowResponse,
    Manager, WebviewUrl, WebviewWindowBuilder,
};
use tauri_plugin_opener::OpenerExt;

#[tauri::command]
fn desktop_get_info(window: tauri::WebviewWindow) -> Result<serde_json::Value, String> {
    authorize(&window)?;
    Ok(serde_json::json!({"version": env!("CARGO_PKG_VERSION"), "saveHandshake": 1}))
}

fn authorize(window: &tauri::WebviewWindow) -> Result<(), String> {
    if window.label() != "main" || !window.url().is_ok_and(|url| is_app_url(&url)) {
        return Err("Desktop capability unavailable".into());
    }
    Ok(())
}

#[tauri::command]
fn desktop_report_state(
    window: tauri::WebviewWindow,
    report: window::SaveReport,
) -> Result<(), String> {
    authorize(&window)?;
    window::acknowledge(&window, report)
}

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _, _| {
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.unminimize();
                let _ = window.show();
                let _ = window.set_focus();
            }
        }))
        .plugin(tauri_plugin_window_state::Builder::default().build())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .manage(window::CloseState::default())
        .manage(update::UpdateState::default())
        .invoke_handler(tauri::generate_handler![
            desktop_get_info,
            desktop_report_state
        ])
        .setup(|app| {
            let data = app.path().app_local_data_dir()?.join("WebView2");
            std::fs::create_dir_all(&data)?;
            // Load only the packaged page until native policies and the real-engine UA are installed.
            let window =
                WebviewWindowBuilder::new(app, "main", WebviewUrl::App("index.html".into()))
                    .title(
                        app.config()
                            .product_name
                            .clone()
                            .unwrap_or_else(|| "Chevoink".into()),
                    )
                    .inner_size(1280.0, 800.0)
                    .min_inner_size(640.0, 480.0)
                    .data_directory(data)
                    .disable_drag_drop_handler()
                    .on_navigation(|url| is_app_url(url) || is_fallback_url(url))
                    .on_new_window(|_, _| NewWindowResponse::Deny)
                    .build()?;
            window::install(&window)?;
            #[cfg(windows)]
            windows_webview::install(&window)?;
            let check =
                MenuItem::with_id(app, "check-update", "检查客户端更新", true, None::<&str>)?;
            let browser =
                MenuItem::with_id(app, "browser", "在浏览器打开官网", true, None::<&str>)?;
            let about = MenuItem::with_id(app, "about", "版本信息", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&check, &browser, &about])?;
            app.set_menu(menu)?;
            update::schedule_check(app.handle());
            Ok(())
        })
        .on_menu_event(|app, event| match event.id().as_ref() {
            "check-update" => update::check(app, true),
            "browser" => {
                let _ = app.opener().open_url(APP_ORIGIN, None::<&str>);
            }
            "about" => window::notice(
                "Chevoink",
                &format!(
                    "Windows x64 · {}\n远程同源创作客户端\n应用数据保存在当前 Windows 用户目录。",
                    env!("CARGO_PKG_VERSION")
                ),
            ),
            _ => {}
        })
        .run(tauri::generate_context!())
        .expect("Chevoink desktop host could not start");
}
