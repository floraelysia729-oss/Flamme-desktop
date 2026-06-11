use serde::Serialize;
use std::path::{Component, Path, PathBuf};
use std::sync::Mutex;
use tauri::{AppHandle, State};

use crate::vault_watcher::VaultWatcher;

pub struct VaultState {
    pub root: Mutex<Option<PathBuf>>,
}

impl VaultState {
    pub fn new() -> Self {
        Self {
            root: Mutex::new(None),
        }
    }
}

#[derive(Clone, Serialize)]
pub struct VaultEntry {
    pub path: String,
    pub name: String,
    pub is_dir: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub children: Option<Vec<VaultEntry>>,
}

fn normalize_rel(path: &str) -> Result<PathBuf, String> {
    let p = Path::new(path);
    for c in p.components() {
        if matches!(c, Component::ParentDir | Component::RootDir | Component::Prefix(_)) {
            return Err("非法路径".into());
        }
    }
    Ok(p.to_path_buf())
}

fn vault_root(state: &VaultState) -> Result<PathBuf, String> {
    let guard = state.root.lock().map_err(|e| e.to_string())?;
    guard
        .clone()
        .ok_or_else(|| "请先设置 Vault 路径".into())
}

fn resolve_under_vault(state: &VaultState, rel: &str) -> Result<PathBuf, String> {
    resolve_vault_path(state, rel, true)
}

/// 写入用：允许目标文件尚不存在（父目录可一并创建），仍校验路径在 Vault 内
fn resolve_vault_path_for_write(state: &VaultState, rel: &str) -> Result<PathBuf, String> {
    resolve_vault_path(state, rel, false)
}

fn resolve_vault_path(state: &VaultState, rel: &str, must_exist: bool) -> Result<PathBuf, String> {
    let root = vault_root(state)?;
    let rel_norm = if rel.is_empty() || rel == "." {
        PathBuf::new()
    } else {
        normalize_rel(rel)?
    };
    let joined = root.join(&rel_norm);
    let root_canon = root
        .canonicalize()
        .map_err(|e| format!("Vault 根目录无效: {e}"))?;

    if must_exist {
        if !joined.exists() {
            return Err(format!("路径不存在: {rel}"));
        }
        let canonical = joined
            .canonicalize()
            .map_err(|e| format!("无法解析路径: {e}"))?;
        if !canonical.starts_with(&root_canon) {
            return Err("路径越界".into());
        }
        return Ok(canonical);
    }

    // 写入：逐段校验已存在的前缀，防止 .. 等越界
    let mut accum = PathBuf::new();
    for comp in rel_norm.components() {
        if let Component::Normal(name) = comp {
            accum.push(name);
            let partial = root.join(&accum);
            if partial.exists() {
                let canon = partial
                    .canonicalize()
                    .map_err(|e| format!("无法解析路径: {e}"))?;
                if !canon.starts_with(&root_canon) {
                    return Err("路径越界".into());
                }
            }
        }
    }
    if !joined.starts_with(&root) {
        return Err("路径越界".into());
    }
    Ok(joined)
}

fn rel_path_from_root(root: &Path, abs: &Path) -> String {
    abs.strip_prefix(root)
        .unwrap_or(abs)
        .to_string_lossy()
        .replace('\\', "/")
}

fn is_markdown(path: &Path) -> bool {
    path.extension()
        .and_then(|e| e.to_str())
        .map(|e| matches!(e.to_ascii_lowercase().as_str(), "md" | "markdown"))
        .unwrap_or(false)
}

fn is_pdf(path: &Path) -> bool {
    path.extension()
        .and_then(|e| e.to_str())
        .map(|e| e.eq_ignore_ascii_case("pdf"))
        .unwrap_or(false)
}

fn is_viewable_file(path: &Path) -> bool {
    is_markdown(path) || is_pdf(path)
}

fn should_skip_dir(name: &str) -> bool {
    name.starts_with('.') || name == "node_modules"
}

fn build_tree(root: &Path, dir: &Path, rel: &str) -> Result<Option<VaultEntry>, String> {
    let mut child_entries: Vec<VaultEntry> = Vec::new();
    let mut dirs: Vec<_> = Vec::new();
    let mut files: Vec<_> = Vec::new();

    let read_dir = std::fs::read_dir(dir).map_err(|e| format!("读取目录失败: {e}"))?;
    for entry in read_dir {
        let entry = entry.map_err(|e| e.to_string())?;
        let path = entry.path();
        let name = entry.file_name().to_string_lossy().to_string();
        if path.is_dir() {
            if !should_skip_dir(&name) {
                dirs.push((name, path));
            }
        } else if is_viewable_file(&path) {
            files.push((name, path));
        }
    }

    dirs.sort_by(|a, b| a.0.cmp(&b.0));
    files.sort_by(|a, b| a.0.cmp(&b.0));

    for (name, path) in dirs {
        let child_rel = if rel.is_empty() {
            name.clone()
        } else {
            format!("{rel}/{name}")
        };
        if let Some(node) = build_tree(root, &path, &child_rel)? {
            child_entries.push(node);
        }
    }

    for (name, path) in files {
        let file_rel = if rel.is_empty() {
            name.clone()
        } else {
            format!("{rel}/{name}")
        };
        child_entries.push(VaultEntry {
            path: file_rel,
            name,
            is_dir: false,
            children: None,
        });
        let _ = path;
    }

    if rel.is_empty() {
        let name = root
            .file_name()
            .and_then(|n| n.to_str())
            .unwrap_or("Vault")
            .to_string();
        return Ok(Some(VaultEntry {
            path: String::new(),
            name,
            is_dir: true,
            children: Some(child_entries),
        }));
    }

    let name = dir
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("folder")
        .to_string();

    Ok(Some(VaultEntry {
        path: rel.to_string(),
        name,
        is_dir: true,
        children: Some(child_entries),
    }))
}

#[tauri::command]
pub fn set_vault_root(
    path: String,
    app: AppHandle,
    state: State<'_, VaultState>,
    watcher: State<'_, VaultWatcher>,
) -> Result<(), String> {
    let p = PathBuf::from(path.trim());
    if !p.is_dir() {
        return Err("Vault 路径必须是已存在的目录".into());
    }
    let canonical = p.canonicalize().map_err(|e| format!("无效路径: {e}"))?;
    *state.root.lock().map_err(|e| e.to_string())? = Some(canonical.clone());
    watcher.watch(&app, canonical)?;
    Ok(())
}

#[tauri::command]
pub fn get_vault_root(state: State<'_, VaultState>) -> Result<Option<String>, String> {
    let guard = state.root.lock().map_err(|e| e.to_string())?;
    Ok(guard.as_ref().map(|p| p.to_string_lossy().to_string()))
}

#[tauri::command]
pub fn list_vault_tree(state: State<'_, VaultState>) -> Result<VaultEntry, String> {
    let root = vault_root(&state)?;
    build_tree(&root, &root, "")?
        .ok_or_else(|| "Vault 为空".into())
}

#[tauri::command]
pub fn get_vault_file_absolute_path(path: String, state: State<'_, VaultState>) -> Result<String, String> {
    let abs = resolve_under_vault(&state, &path)?;
    Ok(abs.to_string_lossy().to_string())
}

#[tauri::command]
pub fn read_vault_file(path: String, state: State<'_, VaultState>) -> Result<String, String> {
    let abs = resolve_under_vault(&state, &path)?;
    if abs.is_dir() {
        return Err("不能读取目录".into());
    }
    std::fs::read_to_string(&abs).map_err(|e| format!("读取失败: {e}"))
}

#[tauri::command]
pub fn write_vault_file(path: String, content: String, state: State<'_, VaultState>) -> Result<(), String> {
    let root = vault_root(&state)?;
    let abs = resolve_vault_path_for_write(&state, &path)?;
    if abs.is_dir() {
        return Err("不能写入目录".into());
    }
    if let Some(parent) = abs.parent() {
        std::fs::create_dir_all(parent).map_err(|e| format!("创建父目录失败: {e}"))?;
    }
    let tmp = root.join(format!(".flamme-write-{}.tmp", std::process::id()));
    std::fs::write(&tmp, &content).map_err(|e| format!("写入临时文件失败: {e}"))?;
    std::fs::rename(&tmp, &abs).map_err(|e| {
        let _ = std::fs::remove_file(&tmp);
        format!("保存失败: {e}")
    })
}

#[tauri::command]
pub fn read_external_file(path: String) -> Result<(String, String), String> {
    let p = PathBuf::from(path.trim());
    if !p.is_file() {
        return Err("请选择有效的文件".into());
    }
    if !is_viewable_file(&p) {
        return Err("仅支持 Markdown / PDF 文件".into());
    }
    let name = p
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("document.md")
        .to_string();
    let content = std::fs::read_to_string(&p).map_err(|e| format!("读取失败: {e}"))?;
    Ok((name, content))
}

#[tauri::command]
pub fn create_vault_file(
    parent: String,
    name: String,
    content: Option<String>,
    state: State<'_, VaultState>,
) -> Result<String, String> {
    let root = vault_root(&state)?;
    let parent_abs = if parent.is_empty() {
        root.clone()
    } else {
        resolve_under_vault(&state, &parent)?
    };
    if !parent_abs.is_dir() {
        return Err("父路径必须是目录".into());
    }
    let file_name = name.trim();
    if file_name.is_empty() || file_name.contains('/') || file_name.contains('\\') {
        return Err("无效文件名".into());
    }
    let mut final_name = file_name.to_string();
    if !is_markdown(Path::new(&final_name)) {
        final_name.push_str(".md");
    }
    let abs = parent_abs.join(&final_name);
    if abs.exists() {
        return Err("文件已存在".into());
    }
    let body = content.unwrap_or_default();
    std::fs::write(&abs, body).map_err(|e| format!("创建文件失败: {e}"))?;
    Ok(rel_path_from_root(&root, &abs))
}

#[tauri::command]
pub fn create_vault_folder(parent: String, name: String, state: State<'_, VaultState>) -> Result<String, String> {
    let root = vault_root(&state)?;
    let parent_abs = if parent.is_empty() {
        root.clone()
    } else {
        resolve_under_vault(&state, &parent)?
    };
    if !parent_abs.is_dir() {
        return Err("父路径必须是目录".into());
    }
    let folder_name = name.trim();
    if folder_name.is_empty() || folder_name.contains('/') || folder_name.contains('\\') {
        return Err("无效文件夹名".into());
    }
    let abs = parent_abs.join(folder_name);
    if abs.exists() {
        return Err("文件夹已存在".into());
    }
    std::fs::create_dir_all(&abs).map_err(|e| format!("创建文件夹失败: {e}"))?;
    Ok(rel_path_from_root(&root, &abs))
}

#[tauri::command]
pub fn delete_vault_entry(path: String, state: State<'_, VaultState>) -> Result<(), String> {
    if path.is_empty() {
        return Err("不能删除 Vault 根目录".into());
    }
    let abs = resolve_under_vault(&state, &path)?;
    if abs.is_dir() {
        let mut entries = std::fs::read_dir(&abs).map_err(|e| e.to_string())?;
        if entries.next().is_some() {
            return Err("文件夹非空，无法删除".into());
        }
        std::fs::remove_dir(&abs).map_err(|e| format!("删除文件夹失败: {e}"))?;
    } else {
        std::fs::remove_file(&abs).map_err(|e| format!("删除文件失败: {e}"))?;
    }
    Ok(())
}

#[tauri::command]
pub fn rename_vault_entry(path: String, new_name: String, state: State<'_, VaultState>) -> Result<String, String> {
    if path.is_empty() {
        return Err("不能重命名 Vault 根目录".into());
    }
    let root = vault_root(&state)?;
    let abs = resolve_under_vault(&state, &path)?;
    let new_name = new_name.trim();
    if new_name.is_empty() || new_name.contains('/') || new_name.contains('\\') {
        return Err("无效名称".into());
    }
    let dest = abs
        .parent()
        .ok_or_else(|| "无父目录".to_string())?
        .join(new_name);
    if dest.exists() {
        return Err("目标名称已存在".into());
    }
    std::fs::rename(&abs, &dest).map_err(|e| format!("重命名失败: {e}"))?;
    Ok(rel_path_from_root(&root, &dest))
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    #[test]
    fn path_escape_rejected() {
        let state = VaultState::new();
        let tmp = std::env::temp_dir().join("flamme_vault_test");
        let _ = fs::remove_dir_all(&tmp);
        fs::create_dir_all(&tmp).unwrap();
        *state.root.lock().unwrap() = Some(tmp.clone());
        assert!(resolve_under_vault(&state, "../etc/passwd").is_err());
        let _ = fs::remove_dir_all(&tmp);
    }
}
