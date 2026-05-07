// No console window in Windows release builds
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::fs;
use std::io::Write;
use std::net::TcpStream;
use std::path::PathBuf;
use std::process::{Child, Command, Stdio};
use std::sync::Mutex;
use std::time::{Duration, Instant};
use std::thread;
use tauri::{Manager, State};

struct BackendProcess(Mutex<Option<Child>>);

/// Append a line to ~/FinPilot/tauri.log so we can inspect path resolution.
fn log(msg: &str) {
    let path = dirs_path();
    if let Ok(mut f) = fs::OpenOptions::new().create(true).append(true).open(&path) {
        let _ = writeln!(f, "{msg}");
    }
}

fn dirs_path() -> PathBuf {
    let home = std::env::var("USERPROFILE")
        .or_else(|_| std::env::var("HOME"))
        .unwrap_or_else(|_| ".".into());
    let dir = PathBuf::from(home).join("FinPilot");
    let _ = fs::create_dir_all(&dir);
    dir.join("tauri.log")
}

/// Poll 127.0.0.1:8001 until a TCP connection succeeds or we time out.
fn wait_for_backend(timeout_secs: u64) -> bool {
    let deadline = Instant::now() + Duration::from_secs(timeout_secs);
    while Instant::now() < deadline {
        if TcpStream::connect("127.0.0.1:8001").is_ok() {
            return true;
        }
        thread::sleep(Duration::from_millis(300));
    }
    false
}

fn main() {
    // Clear old log on each launch
    let _ = fs::remove_file(dirs_path());

    tauri::Builder::default()
        .manage(BackendProcess(Mutex::new(None)))
        .setup(|app| {
            let resource_dir = app
                .path_resolver()
                .resource_dir()
                .expect("Cannot resolve resource directory");

            log(&format!("resource_dir = {}", resource_dir.display()));

            // Tauri v1 on Windows: resource_dir() = install root (e.g. C:\Program Files\FinPilot AI\)
            // NSIS places bundled resources under <install_root>\resources\
            // Try the resources\ sub-path first, fall back to resource_dir directly.
            let resources_sub = resource_dir.join("resources");
            let base = if resources_sub.exists() { resources_sub } else { resource_dir.clone() };

            log(&format!("resolved base = {}", base.display()));

            // ── Strategy 1: PyInstaller-compiled backend.exe ────────────────
            let pyinstaller_exe = base.join("backend").join("backend.exe");
            log(&format!("strategy1 path = {}", pyinstaller_exe.display()));
            log(&format!("strategy1 exists = {}", pyinstaller_exe.exists()));

            // ── Strategy 2: Embedded Python + source files ──────────────────
            let embedded_python = base.join("python").join("python.exe");
            let backend_src_dir = base.join("backend");

            let child: Option<Child> = if pyinstaller_exe.exists() {
                log("launching strategy1: PyInstaller backend.exe");
                Some(
                    Command::new(&pyinstaller_exe)
                        .current_dir(base.join("backend"))
                        .stdout(Stdio::null())
                        .stderr(Stdio::null())
                        .spawn()
                        .expect("Failed to start compiled backend"),
                )
            } else if embedded_python.exists() {
                log("launching strategy2: embedded Python");
                Some(
                    Command::new(&embedded_python)
                        .args(&[
                            "-m", "uvicorn", "main:app",
                            "--host", "127.0.0.1",
                            "--port", "8001",
                            "--log-level", "warning",
                        ])
                        .current_dir(&backend_src_dir)
                        .stdout(Stdio::null())
                        .stderr(Stdio::null())
                        .spawn()
                        .expect("Failed to start embedded-Python backend"),
                )
            } else {
                log("strategy3: system Python fallback (dev mode)");
                let _ = Command::new("python")
                    .args(&[
                        "-m", "uvicorn", "main:app",
                        "--host", "127.0.0.1", "--port", "8001",
                        "--log-level", "warning",
                    ])
                    .current_dir(
                        std::env::current_exe()
                            .ok()
                            .and_then(|p| p.parent().map(|p| p.join("..").join("backend")))
                            .unwrap_or_default(),
                    )
                    .stdout(Stdio::null())
                    .stderr(Stdio::null())
                    .spawn();
                None
            };

            if let Some(c) = child {
                *app.state::<BackendProcess>().0.lock().unwrap() = Some(c);
            }

            // Wait up to 30 s for FastAPI to accept connections
            let ok = wait_for_backend(30);
            log(&format!("backend ready = {ok}"));

            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("Error while building FinPilot AI")
        .run(|app_handle, event| {
            if let tauri::RunEvent::Exit = event {
                let state: State<BackendProcess> = app_handle.state();
                let child_opt = {
                    let mut guard = state.0.lock().unwrap();
                    guard.take()
                };
                if let Some(mut child) = child_opt {
                    let _ = child.kill();
                    let _ = child.wait();
                }
            }
        });
}
