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
    if let Some(monitor) = window.current_monitor()?.or(window.primary_monitor()?) {
        let work = monitor.work_area();
        let scale = window.scale_factor()?;
        let inner = window.inner_size()?;
        let outer = window.outer_size()?;
        let frame_width = outer.width.saturating_sub(inner.width);
        let frame_height = outer.height.saturating_sub(inner.height);
        let available = tauri::PhysicalSize::new(
            work.size.width.saturating_sub(frame_width).max(1),
            work.size.height.saturating_sub(frame_height).max(1),
        );
        let size = available.to_logical::<f64>(scale);
        window.set_min_size(Some(tauri::LogicalSize::new(
            640.0_f64.min(size.width),
            480.0_f64.min(size.height),
        )))?;
        if !window.is_maximized()? && !window.is_fullscreen()? {
            window.set_size(tauri::PhysicalSize::new(
                inner.width.min(available.width),
                inner.height.min(available.height),
            ))?;
            let position = window.outer_position()?;
            window.set_position(tauri::PhysicalPosition::new(
                visible_coordinate(
                    position.x,
                    work.position.x,
                    work.size.width,
                    outer.width.min(work.size.width),
                ),
                visible_coordinate(
                    position.y,
                    work.position.y,
                    work.size.height,
                    outer.height.min(work.size.height),
                ),
            ))?;
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

fn visible_coordinate(position: i32, origin: i32, available: u32, extent: u32) -> i32 {
    let start = i64::from(origin);
    let end = start + i64::from(available.saturating_sub(extent));
    i64::from(position)
        .clamp(start, end)
        .clamp(i64::from(i32::MIN), i64::from(i32::MAX)) as i32
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
    // The packaged loading/error page cannot contain editor drafts or recordings.
    if window
        .url()
        .is_ok_and(|url| crate::navigation::is_fallback_url(&url))
        && state.downloads.load(Ordering::SeqCst) == 0
    {
        finish(window, &nonce);
        return;
    }
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
            confirm_discard(&window, &nonce, true);
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
        confirm_discard(window, &report.nonce, false);
    }
    Ok(())
}

fn confirm_discard(window: &WebviewWindow, nonce: &str, unconfirmed: bool) {
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
        let description = if unconfirmed {
            "网页未及时回复保存状态，无法确认是否有未保存输入。这不代表正在下载。是否仍要退出？选择“是”退出，选择“否”留在窗口。云端任务不受影响。"
        } else {
            "尚有未保存输入、录音或下载未完成。是否放弃本次未完成操作并退出？选择“是”退出，选择“否”留在窗口。不会处理待审查内容，也不会暂停云端任务。"
        };
        let answer = rfd::MessageDialog::new()
            .set_title("确认退出 Chevoink")
            .set_description(description)
            .set_buttons(rfd::MessageButtons::YesNo)
            .show();
        if should_exit(answer) {
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

fn should_exit(answer: rfd::MessageDialogResult) -> bool {
    answer == rfd::MessageDialogResult::Yes
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

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn native_close_buttons_use_portable_result_values() {
        assert!(should_exit(rfd::MessageDialogResult::Yes));
        assert!(!should_exit(rfd::MessageDialogResult::No));
        assert!(!should_exit(rfd::MessageDialogResult::Cancel));
    }
    #[test]
    fn restore_stays_inside_work_area_including_negative_monitor_coordinates() {
        assert_eq!(visible_coordinate(4000, 0, 1920, 1280), 640);
        assert_eq!(visible_coordinate(-5000, -1920, 1920, 1280), -1920);
        assert_eq!(visible_coordinate(-1800, -1920, 1920, 1280), -1800);
        assert_eq!(visible_coordinate(100, 0, 640, 1280), 0);
        assert_eq!(visible_coordinate(0, 40, 1040, 800), 40);
    }
}
