use std::path::Path;

fn main() {
    let icons = Path::new("icons");
    if icons.is_dir() {
        if let Ok(entries) = std::fs::read_dir(icons) {
            for entry in entries.flatten() {
                println!("cargo:rerun-if-changed={}", entry.path().display());
            }
        }
    }
    tauri_build::build()
}
