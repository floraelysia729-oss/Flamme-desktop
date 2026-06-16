//! Python FastAPI sidecar — "Fire Early" (§4.1-A)
//!
//! Dev: `python -m src.api.app` in repo `flamme-backend/`.
//! Release: bundled `flamme-api/flamme-api.exe` next to the app (PyInstaller onedir).

use std::io::{BufRead, BufReader, Write};
use std::path::{Path, PathBuf};
use std::process::{Child, Command, Stdio};
use std::sync::Mutex;
use std::thread;
use std::time::{Duration, Instant};

const DEFAULT_PORT: u16 = 8765;
const READY_POLL_MS: u64 = 200;
const READY_TIMEOUT_SECS: u64 = 90;
const APP_DATA_DIR_NAME: &str = "com.llmwiki.flamme4";

pub struct SidecarState {
    inner: Mutex<SidecarInner>,
}

struct SidecarInner {
    child: Option<Child>,
    spawned_by_us: bool,
    /// Release 安装包使用 flamme-api.exe；退出时需清理（含复用/孤儿进程）。
    uses_bundled_api: bool,
    port: u16,
    backend_dir: PathBuf,
    data_dir: PathBuf,
    /// 启动失败原因（供前端快速提示，避免空等 90s）
    spawn_error: Option<String>,
}

enum SidecarLaunch {
    Python {
        python: PathBuf,
        backend_dir: PathBuf,
    },
    Bundled {
        exe: PathBuf,
        backend_dir: PathBuf,
    },
}

impl SidecarState {
    pub fn spawn_early() -> Result<Self, String> {
        if std::env::var("FLAMME_SKIP_SIDECAR")
            .map(|v| v == "1" || v.eq_ignore_ascii_case("true"))
            .unwrap_or(false)
        {
            log::info!("FLAMME_SKIP_SIDECAR set — not spawning Python");
            let backend_dir = resolve_dev_backend_dir()?;
            let data_dir = app_data_dir();
            return Ok(Self::idle(backend_dir, data_dir, None));
        }

        let port = std::env::var("FLAMME_API_PORT")
            .ok()
            .and_then(|s| s.parse().ok())
            .unwrap_or(DEFAULT_PORT);

        let data_dir = app_data_dir();
        let launch = resolve_sidecar_launch()?;
        let backend_dir = match &launch {
            SidecarLaunch::Python { backend_dir, .. } | SidecarLaunch::Bundled { backend_dir, .. } => {
                backend_dir.clone()
            }
        };

        ensure_app_data(&data_dir, bundled_env_example())?;

        let uses_bundled = matches!(&launch, SidecarLaunch::Bundled { .. });

        if uses_bundled && is_api_up(port) {
            log::info!(
                "Port {} in use — cleaning up stale bundled flamme-api before start",
                port
            );
            kill_bundled_sidecar_processes();
            if !wait_until_port_free(port, 5) {
                log::warn!(
                    "Port {} still busy after sidecar cleanup; will try reuse or spawn",
                    port
                );
            }
        }

        if is_api_up(port) {
            if uses_bundled {
                log::info!(
                    "Bundled API still listening on port {} — reusing (will stop on app exit)",
                    port
                );
            } else {
                log::info!(
                    "Python API already listening on port {} — reusing existing process",
                    port
                );
            }
            return Ok(Self {
                inner: Mutex::new(SidecarInner {
                    child: None,
                    spawned_by_us: false,
                    uses_bundled_api: uses_bundled,
                    port,
                    backend_dir,
                    data_dir,
                    spawn_error: None,
                }),
            });
        }

        let log_path = backend_log_file(&data_dir);
        if let Some(parent) = log_path.parent() {
            let _ = std::fs::create_dir_all(parent);
        }

        let mut cmd = match &launch {
            SidecarLaunch::Python { python, backend_dir } => {
                log::info!(
                    "Spawning Python sidecar: {} -m src.api.app (cwd={})",
                    python.display(),
                    backend_dir.display()
                );
                let mut c = Command::new(python);
                c.args(["-m", "src.api.app"]).current_dir(backend_dir);
                c
            }
            SidecarLaunch::Bundled { exe, backend_dir } => {
                log::info!(
                    "Spawning bundled sidecar: {} (cwd={})",
                    exe.display(),
                    backend_dir.display()
                );
                let mut c = Command::new(exe);
                c.current_dir(backend_dir);
                c
            }
        };

        cmd.env("FLAMME_BACKEND_DIR", &backend_dir)
            .env("FLAMME_DATA_DIR", &data_dir)
            .env("PYTHONUNBUFFERED", "1")
            .env(
                "FLAMME_LOG_LEVEL",
                if cfg!(debug_assertions) {
                    "DEBUG"
                } else {
                    "INFO"
                },
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
            .map_err(|e| format!("failed to spawn sidecar: {e}"))?;

        drain_child_stdio(&mut child, &log_path);
        log::info!("Python 日志文件: {}", log_path.display());

        let state = Self {
            inner: Mutex::new(SidecarInner {
                child: Some(child),
                spawned_by_us: true,
                uses_bundled_api: uses_bundled,
                port,
                backend_dir,
                data_dir,
                spawn_error: None,
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

    pub fn idle(backend_dir: PathBuf, data_dir: PathBuf, spawn_error: Option<String>) -> Self {
        Self {
            inner: Mutex::new(SidecarInner {
                child: None,
                spawned_by_us: false,
                uses_bundled_api: false,
                port: DEFAULT_PORT,
                backend_dir,
                data_dir,
                spawn_error,
            }),
        }
    }

    pub fn spawn_error(&self) -> Option<String> {
        self.inner
            .lock()
            .ok()
            .and_then(|g| g.spawn_error.clone())
    }

    pub fn port(&self) -> u16 {
        self.inner.lock().map(|g| g.port).unwrap_or(DEFAULT_PORT)
    }

    pub fn is_ready(&self) -> bool {
        let port = self.port();
        is_api_up(port)
    }

    pub fn shutdown(&self) {
        let mut guard = match self.inner.lock() {
            Ok(g) => g,
            Err(e) => e.into_inner(),
        };

        if let Some(mut child) = guard.child.take() {
            let pid = child.id();
            log::info!("Stopping Python sidecar (pid={pid})");
            kill_child_process(&mut child);
        }

        if guard.uses_bundled_api {
            log::info!("Ensuring bundled flamme-api processes are stopped");
            kill_bundled_sidecar_processes();
        } else if !guard.spawned_by_us {
            log::info!("Sidecar shutdown skipped (external dev API, not bundled)");
        }
    }

    pub fn log_file(&self) -> PathBuf {
        let guard = match self.inner.lock() {
            Ok(g) => g,
            Err(e) => e.into_inner(),
        };
        backend_log_file(&guard.data_dir)
    }

    pub fn status_line(&self) -> String {
        let guard = match self.inner.lock() {
            Ok(g) => g,
            Err(_) => return "sidecar: lock poisoned".into(),
        };
        let up = is_api_up(guard.port);
        let spawn = if guard.spawned_by_us {
            "spawned"
        } else if up && guard.uses_bundled_api {
            "bundled-reused"
        } else if up {
            "external"
        } else {
            "none"
        };
        format!(
            "port={} ready={} source={} backend={} data={}",
            guard.port,
            up,
            spawn,
            guard.backend_dir.display(),
            guard.data_dir.display()
        )
    }
}

impl Drop for SidecarState {
    fn drop(&mut self) {
        self.shutdown();
    }
}

/// 结束 PyInstaller 打包的 flamme-api.exe（含子进程树）。
fn kill_bundled_sidecar_processes() {
    #[cfg(windows)]
    {
        let status = Command::new("taskkill")
            .args(["/F", "/IM", "flamme-api.exe", "/T"])
            .stdin(Stdio::null())
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .status();
        match status {
            Ok(s) if s.success() => log::info!("taskkill flamme-api.exe ok"),
            Ok(s) => log::info!("taskkill flamme-api.exe: no process or already stopped ({s})"),
            Err(e) => log::warn!("taskkill flamme-api.exe failed: {e}"),
        }
    }

    #[cfg(not(windows))]
    {
        let _ = Command::new("pkill")
            .args(["-f", "flamme-api"])
            .stdin(Stdio::null())
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .status();
    }
}

fn wait_until_port_free(port: u16, timeout_secs: u64) -> bool {
    let deadline = Instant::now() + Duration::from_secs(timeout_secs);
    while Instant::now() < deadline {
        if !is_api_up(port) {
            return true;
        }
        thread::sleep(Duration::from_millis(READY_POLL_MS));
    }
    false
}

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

fn resolve_sidecar_launch() -> Result<SidecarLaunch, String> {
    if cfg!(debug_assertions) {
        let backend_dir = resolve_dev_backend_dir()?;
        let python = resolve_python_exe(&backend_dir)?;
        return Ok(SidecarLaunch::Python {
            python,
            backend_dir,
        });
    }

    if let Some((exe, backend_dir)) = resolve_bundled_api() {
        return Ok(SidecarLaunch::Bundled { exe, backend_dir });
    }

    Err(
        "bundled flamme-api.exe not found; run npm run build:sidecar before tauri build".into(),
    )
}

/// Dev: `4.0/flamme-backend` relative to CARGO_MANIFEST_DIR, or `FLAMME_BACKEND_DIR`.
pub fn resolve_backend_dir() -> Result<PathBuf, String> {
    if cfg!(debug_assertions) {
        return resolve_dev_backend_dir();
    }
    resolve_bundled_api()
        .map(|(_, dir)| dir)
        .ok_or_else(|| "bundled backend not found".into())
}

fn resolve_dev_backend_dir() -> Result<PathBuf, String> {
    if let Ok(dir) = std::env::var("FLAMME_BACKEND_DIR") {
        let p = PathBuf::from(dir);
        if p.is_dir() {
            return Ok(p);
        }
        return Err(format!("FLAMME_BACKEND_DIR is not a directory: {}", p.display()));
    }

    let manifest = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    let candidate = manifest.join("../../flamme-backend");
    candidate.canonicalize().map_err(|e| {
        format!(
            "cannot find flamme-backend at {} ({e}); set FLAMME_BACKEND_DIR",
            candidate.display()
        )
    })
}

/// Candidate backend dirs for the PyInstaller onedir (Tauri `bundle.resources`).
fn bundled_backend_dirs() -> Vec<PathBuf> {
    let Some(exe_dir) = std::env::current_exe().ok().and_then(|p| p.parent().map(|d| d.to_path_buf())) else {
        return Vec::new();
    };
    vec![
        // Tauri 2 NSIS / per-user install: `<install>/flamme-api/`
        exe_dir.join("flamme-api"),
        // Unpacked / legacy layout: `<exe>/resources/flamme-api/`
        exe_dir.join("resources").join("flamme-api"),
    ]
}

fn resolve_bundled_api() -> Option<(PathBuf, PathBuf)> {
    for backend_dir in bundled_backend_dirs() {
        let exe = backend_dir.join("flamme-api.exe");
        if exe.is_file() {
            return Some((exe, backend_dir));
        }
    }
    None
}

fn bundled_env_example() -> Option<PathBuf> {
    if cfg!(debug_assertions) {
        return None;
    }
    for backend_dir in bundled_backend_dirs() {
        let example = backend_dir.join(".env.example");
        if example.is_file() {
            return Some(example);
        }
    }
    None
}

fn app_data_dir() -> PathBuf {
    if let Ok(dir) = std::env::var("FLAMME_DATA_DIR") {
        let p = PathBuf::from(dir);
        if !p.as_os_str().is_empty() {
            return p;
        }
    }

    #[cfg(windows)]
    {
        if let Some(appdata) = std::env::var_os("APPDATA") {
            return PathBuf::from(appdata).join(APP_DATA_DIR_NAME);
        }
    }

    if let Some(home) = std::env::var_os("HOME") {
        return PathBuf::from(home)
            .join(".local")
            .join("share")
            .join(APP_DATA_DIR_NAME);
    }

    PathBuf::from(".").join(APP_DATA_DIR_NAME)
}

fn ensure_app_data(data_dir: &Path, env_example: Option<PathBuf>) -> Result<(), String> {
    std::fs::create_dir_all(data_dir)
        .map_err(|e| format!("cannot create app data dir {}: {e}", data_dir.display()))?;

    let env_file = data_dir.join(".env");
    if env_file.exists() {
        return Ok(());
    }

    if let Some(example) = env_example {
        if example.is_file() {
            std::fs::copy(&example, &env_file).map_err(|e| {
                format!(
                    "cannot copy {} -> {}: {e}",
                    example.display(),
                    env_file.display()
                )
            })?;
            log::info!("Created default .env at {}", env_file.display());
        }
    }

    Ok(())
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

fn backend_log_file(data_dir: &Path) -> PathBuf {
    data_dir.join("logs").join("flamme-api.log")
}

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
        "spawn_error": state.spawn_error(),
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn resolve_dev_backend_dir_from_manifest() {
        let dir = resolve_dev_backend_dir().expect("flamme-backend should exist in repo");
        assert!(dir.join("pyproject.toml").is_file());
        assert!(dir.join("src/api/app.py").is_file());
    }

    #[test]
    fn app_data_dir_is_nonempty() {
        let dir = app_data_dir();
        assert!(!dir.as_os_str().is_empty());
    }
}
