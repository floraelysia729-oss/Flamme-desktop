use std::path::{Path, PathBuf};

use tauri::Manager;

fn load_icon_png(path: &Path) -> Option<tauri::image::Image<'static>> {
    let img = image::open(path).ok()?.into_rgba8();
    let (w, h) = img.dimensions();
    Some(tauri::image::Image::new_owned(img.into_raw(), w, h))
}

pub fn apply_main_window_icon(app: &tauri::App) {
    let path = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("icons/icon.png");
    let icon = load_icon_png(&path).or_else(|| app.default_window_icon().cloned());
    let Some(icon) = icon else {
        log::warn!("No window icon (missing icons/icon.png?)");
        return;
    };
    if let Some(window) = app.get_webview_window("main") {
        if let Err(e) = window.set_icon(icon) {
            log::warn!("set_icon failed: {e}");
        } else {
            log::info!("Window icon applied from {}", path.display());
        }
    }
}
