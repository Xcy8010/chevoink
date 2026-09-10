fn main() {
    tauri_build::try_build(tauri_build::Attributes::new().app_manifest(
        tauri_build::AppManifest::new().commands(&[
            "desktop_get_info",
            "desktop_report_state",
            "desktop_settings_action",
        ]),
    ))
    .expect("failed to build explicit desktop permissions");
}
