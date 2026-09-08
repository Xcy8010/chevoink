use std::{
    sync::{
        atomic::{AtomicBool, Ordering},
        Mutex,
    },
    time::{Duration, SystemTime, UNIX_EPOCH},
};
use tauri::{AppHandle, Manager};
use tauri_plugin_updater::{Update, UpdaterExt};

#[derive(Default)]
pub struct UpdateState {
    busy: AtomicBool,
    pending: Mutex<Option<(Update, Vec<u8>)>>,
}
impl UpdateState {
    pub fn clear_pending(&self) {
        if let Ok(mut pending) = self.pending.lock() {
            *pending = None;
        }
    }
}

pub fn schedule_check(app: &AppHandle) {
    let app = app.clone();
    tauri::async_runtime::spawn(async move {
        tokio::time::sleep(Duration::from_secs(30)).await;
        check(&app, false);
    });
}

pub fn check(app: &AppHandle, manual: bool) {
    let state = app.state::<UpdateState>();
    if state.busy.swap(true, Ordering::SeqCst) {
        return;
    }
    let app = app.clone();
    tauri::async_runtime::spawn(async move {
        let result = check_inner(&app, manual).await;
        app.state::<UpdateState>()
            .busy
            .store(false, Ordering::SeqCst);
        if result.is_err() && manual {
            crate::window::notice(
                "暂时无法检查更新",
                "更新服务或签名配置不可用，请稍后重试。现有版本和资料不受影响。",
            );
        }
    });
}

async fn check_inner(
    app: &AppHandle,
    manual: bool,
) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    let pubkey = option_env!("CHEVOINK_UPDATER_PUBLIC_KEY")
        .filter(|value| !value.trim().is_empty())
        .ok_or("Missing updater public key")?;
    let stamp = app.path().app_local_data_dir()?.join("update-check.txt");
    let now = SystemTime::now().duration_since(UNIX_EPOCH)?.as_secs();
    if !manual
        && std::fs::read_to_string(&stamp)
            .ok()
            .and_then(|text| text.parse::<u64>().ok())
            .is_some_and(|last| now.saturating_sub(last) < 86400)
    {
        return Ok(());
    }
    std::fs::write(&stamp, now.to_string())?;
    let update = app
        .updater_builder()
        .pubkey(pubkey)
        .timeout(Duration::from_secs(30))
        .configure_client(|client| client.redirect(reqwest::redirect::Policy::none()))
        .endpoints(vec![
            "https://chevoink.chevolink.com/download/windows/stable/latest.json".parse()?,
        ])?
        .build()?
        .check()
        .await?;
    let Some(update) = update else {
        if manual {
            crate::window::notice("客户端更新", "当前已是最新版本。");
        }
        return Ok(());
    };
    // Stable downloads are served directly by our immutable directory, never by an arbitrary redirect.
    let expected = format!(
        "https://chevoink.chevolink.com/download/windows/{0}/Chevoink_{0}_x64-setup.exe",
        update.version
    );
    if update.download_url.as_str() != expected {
        return Err("Untrusted update asset".into());
    }
    let description = format!(
        "发现 Windows 客户端 {}。是否下载？下载后仍需确认保存并退出，不影响云端任务。",
        update.version
    );
    let accepted = tauri::async_runtime::spawn_blocking(move || {
        rfd::MessageDialog::new()
            .set_title("客户端更新")
            .set_description(description)
            .set_buttons(rfd::MessageButtons::OkCancel)
            .show()
    })
    .await?;
    if accepted != rfd::MessageDialogResult::Ok {
        return Ok(());
    }
    let bytes = update.download(|_, _| {}, || {}).await?;
    // The official updater verifies its signature before returning the payload.
    let install = tauri::async_runtime::spawn_blocking(|| {
        rfd::MessageDialog::new()
            .set_title("安装客户端更新")
            .set_description("安装包已下载并通过更新签名校验。现在保存并退出以安装更新吗？选择取消将继续使用现有版本。")
            .set_buttons(rfd::MessageButtons::OkCancel)
            .show()
    }).await?;
    if install != rfd::MessageDialogResult::Ok {
        return Ok(());
    }
    *app.state::<UpdateState>()
        .pending
        .lock()
        .map_err(|_| "Update state unavailable")? = Some((update, bytes));
    if let Some(window) = app.get_webview_window("main") {
        crate::window::request_close(&window);
    }
    Ok(())
}

pub fn install_pending(app: &AppHandle) -> bool {
    let pending = app
        .state::<UpdateState>()
        .pending
        .lock()
        .ok()
        .and_then(|mut value| value.take());
    if let Some((update, bytes)) = pending {
        std::thread::spawn(move || {
            if update.install(bytes).is_err() {
                crate::window::notice("更新未安装", "已保留现有版本，请稍后重试。");
            }
        });
        return true;
    }
    false
}
