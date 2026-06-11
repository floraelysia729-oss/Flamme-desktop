//! Python FastAPI sidecar — "Fire Early" (§4.1-A)
//!
//! 在 Tauri 窗口创建前启动 `python -m src.api.app`，退出时终止子进程。
//! 若 8765 已有健康响应则复用，不重复 spawn。

use std::io::{BufRead, BufReader, Write};
use std::path::{Path, PathBuf};
use std::process::{Child, Command, Stdio};
use std::sync::Mutex;
use std::thread;
use std::time::{Duration, Instant};

const DEFAULT_PORT: u16 = 8765;
const READY_POLL_MS: u64 = 200;
const READY_TIMEOUT_SECS: u64 = 90;

pub struct SidecarState {
    inner: Mutex<SidecarInner>,
}

struct SidecarInner {
    child: Option<Child>,
    spawned_by_us: bool,
    port: u16,
    backend_dir: PathBuf,
}

impl SidecarState {
    pub fn spawn_early() -> Result<Self, String> {
        if std::env::var("FLAMME_SKIP_SIDECAR")
            .map(|v| v == "1" || v.eq_ignore_ascii_case("true"))
            .unwrap_or(false)
        {
            log::info!("FLAMME_SKIP_SIDECAR set — not spawning Python");
            let backend_dir = resolve_backend_dir()?;
            return Ok(Self::idle(backend_dir));
        }

        let port = std::env::var("FLAMME_API_PORT")
            .ok()
            .and_then(|s| s.parse().ok())
            .unwrap_or(DEFAULT_PORT);

        let backend_dir = resolve_backend_dir()?;

        if is_api_up(port) {
            log::info!(
                "Python API already listening on port {} — reusing existing process",
                port
            );
            return Ok(Self {
                inner: Mutex::new(SidecarInner {
                    child: None,
                    spawned_by_us: false,
                    port,
                    backend_dir,
                }),
            });
        }

        let python = resolve_python_exe(&backend_dir)?;
        log::info!(
            "Spawning Python sidecar: {} -m src.api.app (cwd={})",
            python.display(),
            backend_dir.display()
        );

        let log_path = backend_log_file(&backend_dir);
        if let Some(parent) = log_path.parent() {
            let _ = std::fs::create_dir_all(parent);
        }

        let mut cmd = Command::new(&python);
        cmd.args(["-m", "src.api.app"])
            .current_dir(&backend_dir)
            .env("FLAMME_BACKEND_DIR", &backend_dir)
            .env("PYTHONUNBUFFERED", "1")
            .env(
                "FLAMME_LOG_LEVEL",
                if cfg!(debug_assertions) { "DEBUG" } else { "INFO" },
            )
            .env("FLAMME_LOG_FILE", &log_path)
            .stdin(Stdio::null())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped());

        #[cfg(windows)]
        {
            use std::os::windows::process::CommandExt;
            const CREATE_NO_WINDOW: u32 = 0x0800_0000;
            if !cfg!(debug_assertions) {
                cmd.creation_flags(CREATE_NO_WINDOW);
            }
        }

        let mut child = cmd
            .spawn()
            .map_err(|e| format!("failed to spawn Python ({}): {e}", python.display()))?;

        drain_child_stdio(&mut child, &log_path);
        log::info!("Python 日志文件: {}", log_path.display());

        let state = Self {
            inner: Mutex::new(SidecarInner {
                child: Some(child),
                spawned_by_us: true,
                port,
                backend_dir,
            }),
        };

        let port_for_wait = port;
        std::thread::spawn(move || {
            if wait_until_ready(port_for_wait, READY_TIMEOUT_SECS) {
                log::info!("Python sidecar ready on port {}", port_for_wait);
            } else {
                log::warn!(
                    "Python sidecar did not respond on port {} within {}s",
                    port_for_wait,
                    READY_TIMEOUT_SECS
                );
            }
        });

        Ok(state)
    }

    /// 启动失败时仍注册 state，便于 `sidecar_status` 查询。
    pub fn idle(backend_dir: PathBuf) -> Self {
        Self {
            inner: Mutex::new(SidecarInner {
                child: None,
                spawned_by_us: false,
                port: DEFAULT_PORT,
                backend_dir,
            }),
        }
    }

    pub fn port(&self) -> u16 {
        self.inner.lock().map(|g| g.port).unwrap_or(DEFAULT_PORT)
    }

    pub fn is_ready(&self) -> bool {
        let port = self.port();
        is_api_up(port)
    }

    /// 应用退出时显式调用（勿仅依赖 Drop）。
    pub fn shutdown(&self) {
        let mut guard = match self.inner.lock() {
            Ok(g) => g,
            Err(e) => e.into_inner(),
        };
        if !guard.spawned_by_us {
            log::info!("Sidecar shutdown skipped (not spawned by Flamme)");
            return;
        }
        if let Some(mut child) = guard.child.take() {
            let pid = child.id();
            log::info!("Stopping Python sidecar (pid={pid})");
            kill_child_process(&mut child);
        }
    }

    pub fn log_file(&self) -> PathBuf {
        let guard = match self.inner.lock() {
            Ok(g) => g,
            Err(e) => e.into_inner(),
        };
        backend_log_file(&guard.backend_dir)
    }

    pub fn status_line(&self) -> String {
        let guard = match self.inner.lock() {
            Ok(g) => g,
            Err(_) => return "sidecar: lock poisoned".into(),
        };
        let up = is_api_up(guard.port);
        let spawn = if guard.spawned_by_us {
            "spawned"
        } else if up {
            "external"
        } else {
            "none"
        };
        format!(
            "port={} ready={} source={} backend={}",
            guard.port,
            up,
            spawn,
            guard.backend_dir.display()
        )
    }
}

impl Drop for SidecarState {
    fn drop(&mut self) {
        self.shutdown();
    }
}

/// 终止 sidecar 进程（Windows 上杀整棵进程树，避免 uvicorn/python 残留）
fn kill_child_process(child: &mut Child) {
    let pid = child.id();

    #[cfg(windows)]
    {
        let status = Command::new("taskkill")
            .args(["/F", "/T", "/PID", &pid.to_string()])
            .stdin(Stdio::null())
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .status();
        match status {
            Ok(s) if s.success() => log::info!("taskkill exited ok for pid {pid}"),
            Ok(s) => log::warn!("taskkill pid {pid} status: {s}"),
            Err(e) => {
                log::warn!("taskkill failed ({e}), falling back to child.kill()");
                let _ = child.kill();
            }
        }
        let _ = child.wait();
        return;
    }

    #[cfg(not(windows))]
    {
        let _ = child.kill();
        let _ = child.wait();
    }
}

/// 解析 `4.0/flamme-backend`：CARGO_MANIFEST_DIR 的上两级 + flamme-backend，或 `FLAMME_BACKEND_DIR`。
pub fn resolve_backend_dir() -> Result<PathBuf, String> {
    if let Ok(dir) = std::env::var("FLAMME_BACKEND_DIR") {
        let p = PathBuf::from(dir);
        if p.is_dir() {
            return Ok(p);
        }
        return Err(format!("FLAMME_BACKEND_DIR is not a directory: {}", p.display()));
    }

    let manifest = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    let candidate = manifest.join("../../flamme-backend");
    candidate
        .canonicalize()
        .map_err(|e| {
            format!(
                "cannot find flamme-backend at {} ({e}); set FLAMME_BACKEND_DIR",
                candidate.display()
            )
        })
}

fn resolve_python_exe(backend_dir: &Path) -> Result<PathBuf, String> {
    let venv = if cfg!(windows) {
        backend_dir.join(".venv/Scripts/python.exe")
    } else {
        backend_dir.join(".venv/bin/python")
    };
    if venv.is_file() {
        return Ok(venv);
    }

    for name in ["python3", "python"] {
        if let Ok(p) = which_simple(name) {
            return Ok(p);
        }
    }

    Err(format!(
        "no Python found for sidecar (tried {} and PATH python/python3); \
         create .venv in {}",
        venv.display(),
        backend_dir.display()
    ))
}

#[cfg(windows)]
fn which_simple(name: &str) -> Result<PathBuf, ()> {
    let output = Command::new("where").arg(name).output().map_err(|_| ())?;
    if !output.status.success() {
        return Err(());
    }
    let line = std::str::from_utf8(&output.stdout)
        .map_err(|_| ())?
        .lines()
        .next()
        .ok_or(())?
        .trim();
    if line.is_empty() {
        Err(())
    } else {
        Ok(PathBuf::from(line))
    }
}

#[cfg(not(windows))]
fn which_simple(name: &str) -> Result<PathBuf, ()> {
    let output = Command::new("which").arg(name).output().map_err(|_| ())?;
    if !output.status.success() {
        return Err(());
    }
    let line = std::str::from_utf8(&output.stdout)
        .map_err(|_| ())?
        .lines()
        .next()
        .ok_or(())?
        .trim();
    if line.is_empty() {
        Err(())
    } else {
        Ok(PathBuf::from(line))
    }
}

fn api_root_url(port: u16) -> String {
    format!("http://127.0.0.1:{port}/")
}

fn is_api_up(port: u16) -> bool {
    let url = api_root_url(port);
    match ureq::get(&url).call() {
        Ok(res) => res.status() == 200,
        Err(_) => false,
    }
}

fn wait_until_ready(port: u16, timeout_secs: u64) -> bool {
    let deadline = Instant::now() + Duration::from_secs(timeout_secs);
    while Instant::now() < deadline {
        if is_api_up(port) {
            return true;
        }
        std::thread::sleep(Duration::from_millis(READY_POLL_MS));
    }
    false
}

fn backend_log_file(backend_dir: &Path) -> PathBuf {
    backend_dir.join("logs").join("flamme-api.log")
}

/// 将 Python 子进程 stdout/stderr 追加到日志文件（否则 CREATE_NO_WINDOW 下看不到任何输出）
fn drain_child_stdio(child: &mut Child, log_path: &Path) {
    let stderr = child.stderr.take();
    let stdout = child.stdout.take();
    let path = log_path.to_path_buf();
    if let Some(stream) = stderr {
        spawn_stdio_drain(stream, path.clone(), "stderr");
    }
    if let Some(stream) = stdout {
        spawn_stdio_drain(stream, path, "stdout");
    }
}

fn spawn_stdio_drain<R: std::io::Read + Send + 'static>(stream: R, log_path: PathBuf, tag: &'static str) {
    thread::spawn(move || {
        let reader = BufReader::new(stream);
        for line in reader.lines().map_while(Result::ok) {
            if let Ok(mut file) = std::fs::OpenOptions::new()
                .create(true)
                .append(true)
                .open(&log_path)
            {
                let _ = writeln!(file, "[python-{tag}] {line}");
            }
            log::info!("[python-{tag}] {line}");
        }
    });
}

#[tauri::command]
pub fn sidecar_status(state: tauri::State<'_, SidecarState>) -> serde_json::Value {
    serde_json::json!({
        "ready": state.is_ready(),
        "port": state.port(),
        "detail": state.status_line(),
        "log_file": state.log_file().display().to_string(),
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn resolve_backend_dir_from_manifest() {
        let dir = resolve_backend_dir().expect("flamme-backend should exist in repo");
        assert!(dir.join("pyproject.toml").is_file());
        assert!(dir.join("src/api/app.py").is_file());
    }
}
