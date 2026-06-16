mod icon;
mod sidecar;
mod vault;
mod vault_watcher;

use sidecar::SidecarState;
use tauri::{Manager, RunEvent, WindowEvent};
use vault::VaultState;
use vault_watcher::VaultWatcher;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let sidecar = match SidecarState::spawn_early() {
        Ok(s) => s,
        Err(e) => {
            log::error!("Python sidecar failed to start: {e}");
            log::error!("Start manually: cd flamme-backend && python -m src.api.app");
            let backend_dir = sidecar::resolve_backend_dir().unwrap_or_else(|_| {
                std::path::PathBuf::from(".")
            });
            let data_dir = std::env::var_os("APPDATA")
                .map(std::path::PathBuf::from)
                .map(|p| p.join("com.llmwiki.flamme4"))
                .unwrap_or_else(|| std::path::PathBuf::from("."));
            SidecarState::idle(backend_dir, data_dir, Some(e))
        }
    };

    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .manage(VaultState::new())
        .manage(VaultWatcher::new())
        .manage(sidecar)
        .invoke_handler(tauri::generate_handler![
            sidecar::sidecar_status,
            vault::set_vault_root,
            vault::get_vault_root,
            vault::read_external_file,
            vault::get_vault_file_absolute_path,
            vault::list_vault_tree,
            vault::read_vault_file,
            vault::write_vault_file,
            vault::create_vault_file,
            vault::create_vault_folder,
            vault::delete_vault_entry,
            vault::rename_vault_entry,
        ])
        .setup(|app| {
            icon::apply_main_window_icon(app);
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }

            // 正式版关窗即停 sidecar，避免 flamme-api.exe 残留导致无法覆盖安装
            if !cfg!(debug_assertions) {
                let handle = app.handle().clone();
                if let Some(window) = app.get_webview_window("main") {
                    window.on_window_event(move |event| {
                        if matches!(event, WindowEvent::CloseRequested { .. }) {
                            if let Some(sidecar) = handle.try_state::<SidecarState>() {
                                sidecar.shutdown();
                            }
                        }
                    });
                }
            }

            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|app_handle, event| {
            // 开发版仅在进程退出时杀 sidecar，避免关窗打断 ingest 长任务
            if matches!(event, RunEvent::Exit) {
                if let Some(sidecar) = app_handle.try_state::<SidecarState>() {
                    sidecar.shutdown();
                }
            } else if !cfg!(debug_assertions) {
                if let RunEvent::ExitRequested { .. } = event {
                    if let Some(sidecar) = app_handle.try_state::<SidecarState>() {
                        sidecar.shutdown();
                    }
                }
            }
        });
}
