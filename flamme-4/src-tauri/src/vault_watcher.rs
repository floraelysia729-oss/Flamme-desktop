//! Vault 目录文件变更监听 — 防抖后向前端发送 vault-fs-changed 事件

use std::path::PathBuf;
use std::sync::mpsc::{self, Receiver, Sender};
use std::sync::Mutex;
use std::time::Duration;

use notify::{Event, EventKind, RecommendedWatcher, RecursiveMode, Watcher};
use tauri::{AppHandle, Emitter};

const DEBOUNCE_MS: u64 = 500;

struct WatchHandle {
    _watcher: RecommendedWatcher,
    stop_tx: Sender<()>,
}

pub struct VaultWatcher {
    inner: Mutex<Option<WatchHandle>>,
}

impl VaultWatcher {
    pub fn new() -> Self {
        Self {
            inner: Mutex::new(None),
        }
    }

    pub fn watch(&self, app: &AppHandle, root: PathBuf) -> Result<(), String> {
        self.stop();

        let (event_tx, event_rx) = mpsc::channel();
        let (stop_tx, stop_rx) = mpsc::channel();

        let mut watcher = RecommendedWatcher::new(
            move |res: notify::Result<Event>| {
                if let Ok(event) = res {
                    if is_relevant_event(&event.kind) {
                        let _ = event_tx.send(());
                    }
                }
            },
            notify::Config::default(),
        )
        .map_err(|e| format!("无法创建文件监听: {e}"))?;

        watcher
            .watch(&root, RecursiveMode::Recursive)
            .map_err(|e| format!("无法监听 Vault: {e}"))?;

        let app_handle = app.clone();
        std::thread::spawn(move || debounce_loop(app_handle, event_rx, stop_rx));

        *self.inner.lock().map_err(|e| e.to_string())? = Some(WatchHandle {
            _watcher: watcher,
            stop_tx,
        });

        log::info!("Vault watcher started: {}", root.display());
        Ok(())
    }

    pub fn stop(&self) {
        if let Ok(mut guard) = self.inner.lock() {
            if let Some(handle) = guard.take() {
                let _ = handle.stop_tx.send(());
            }
        }
    }
}

fn is_relevant_event(kind: &EventKind) -> bool {
    matches!(
        kind,
        EventKind::Create(_)
            | EventKind::Modify(_)
            | EventKind::Remove(_)
            | EventKind::Any
    )
}

fn debounce_loop(app: AppHandle, event_rx: Receiver<()>, stop_rx: Receiver<()>) {
    loop {
        match event_rx.recv_timeout(Duration::from_millis(200)) {
            Ok(()) => {}
            Err(mpsc::RecvTimeoutError::Disconnected) => break,
            Err(mpsc::RecvTimeoutError::Timeout) => {
                if stop_rx.try_recv().is_ok() {
                    break;
                }
                continue;
            }
        }

        std::thread::sleep(Duration::from_millis(DEBOUNCE_MS));
        while event_rx.try_recv().is_ok() {}

        if stop_rx.try_recv().is_ok() {
            break;
        }

        let _ = app.emit("vault-fs-changed", ());
    }
}
