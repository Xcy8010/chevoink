use std::sync::{
    atomic::{AtomicBool, AtomicUsize, Ordering},
    Mutex,
};
use tauri::{Manager, WebviewWindow, WindowEvent};

#[derive(Default)]
pub struct CloseState {
    nonce: Mutex<Option<String>>,
    pub allow: AtomicBool,
    pub downloads: AtomicUsize,
    confirming: AtomicBool,
}

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct SaveReport {
    nonce: String,
    saved: bool,
    recording: bool,
}

pub fn notice(title: &str, message: &str) {
    let title = title.to_owned();
    let message = message.to_owned();
    std::thread::spawn(move || {
        rfd::MessageDialog::new()
            .set_title(title)
            .set_description(message)
            .show();
    });
}

pub fn install(window: &WebviewWindow) -> tauri::Result<()> {
    if let Some(monitor) = window.current_monitor()? {
        let size = monitor.size().to_logical::<f64>(monitor.scale_factor());
        window.set_min_size(Some(tauri::LogicalSize::new(
            640.0_f64.min(size.width),
            480.0_f64.min(size.height),
        )))?;
        let current = window
            .inner_size()?
            .to_logical::<f64>(window.scale_factor()?);
        if current.width > size.width || current.height > size.height {
            window.set_size(tauri::LogicalSize::new(
                current.width.min(size.width),
                current.height.min(size.height),
            ))?;
            window.center()?;
        }
    }
    let owned = window.clone();
    window.on_window_event(move |event| {
        if let WindowEvent::CloseRequested { api, .. } = event {
            if !owned.state::<CloseState>().allow.load(Ordering::SeqCst) {
                api.prevent_close();
                request_close(&owned);
            }
        }
    });
    Ok(())
}

pub fn request_close(window: &WebviewWindow) {
    let state = window.state::<CloseState>();
    let Ok(mut pending) = state.nonce.lock() else {
        return;
    };
    if pending.is_some() {
        return;
    }
    let nonce = uuid::Uuid::new_v4().to_string();
    *pending = Some(nonce.clone());
    drop(pending);
    let script = format!("window.dispatchEvent(new CustomEvent('chevoink:desktop-save', {{detail: {{nonce: {}}}}}));", serde_json::to_string(&nonce).unwrap());
    let _ = window.eval(&script);
    let window = window.clone();
    tauri::async_runtime::spawn(async move {
        tokio::time::sleep(std::time::Duration::from_secs(10)).await;
        let timed_out = window
            .state::<CloseState>()
            .nonce
            .lock()
            .is_ok_and(|pending| pending.as_deref() == Some(&nonce));
        if timed_out {
            confirm_discard(&window, &nonce);
        }
    });
}

pub fn acknowledge(window: &WebviewWindow, report: SaveReport) -> Result<(), String> {
    let state = window.state::<CloseState>();
    if state.confirming.load(Ordering::SeqCst) {
        return Err("Native close confirmation is already open".into());
    }
    let pending = state
        .nonce
        .lock()
        .map_err(|_| "Save acknowledgement unavailable")?;
    if pending.as_deref() != Some(&report.nonce) {
        return Err("Expired save acknowledgement".into());
    }
    drop(pending);
    if report.saved && !report.recording && state.downloads.load(Ordering::SeqCst) == 0 {
        finish(window, &report.nonce);
    } else {
        confirm_discard(window, &report.nonce);
    }
    Ok(())
}

fn confirm_discard(window: &WebviewWindow, nonce: &str) {
    if window
        .state::<CloseState>()
        .confirming
        .swap(true, Ordering::SeqCst)
    {
        return;
    }
    let window = window.clone();
    let nonce = nonce.to_owned();
    std::thread::spawn(move || {
        let answer = rfd::MessageDialog::new().set_title("仍有内容或操作尚未保存完成")
            .set_description("建议留在当前窗口。退出可能丢失本次未保存输入或中断下载/录音；不会接受或拒绝待审查内容，也不会暂停云端任务。")
            .set_buttons(rfd::MessageButtons::OkCancelCustom("留在窗口".into(), "放弃未保存内容并退出".into())).show();
        if answer == rfd::MessageDialogResult::Custom("放弃未保存内容并退出".into()) {
            finish(&window, &nonce);
        } else {
            let state = window.state::<CloseState>();
            if let Ok(mut pending) = state.nonce.lock() {
                if pending.as_deref() == Some(&nonce) {
                    *pending = None;
                }
            }
            window.state::<crate::update::UpdateState>().clear_pending();
        }
        window
            .state::<CloseState>()
            .confirming
            .store(false, Ordering::SeqCst);
    });
}

fn finish(window: &WebviewWindow, nonce: &str) {
    let state = window.state::<CloseState>();
    let Ok(mut pending) = state.nonce.lock() else {
        return;
    };
    if pending.as_deref() != Some(nonce) {
        return;
    }
    *pending = None;
    drop(pending);
    if crate::update::install_pending(window.app_handle()) {
        return;
    }
    state.allow.store(true, Ordering::SeqCst);
    let _ = window.close();
}
