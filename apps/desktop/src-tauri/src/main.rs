#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use serde::Serialize;
use std::{
    env,
    path::PathBuf,
    process::{Child, Command, Stdio},
    sync::Mutex,
};
use tauri::{Manager, State};

#[derive(Default)]
struct BackendState {
    child: Mutex<Option<Child>>,
}

#[derive(Serialize)]
struct BackendStatus {
    port: u16,
}

#[tauri::command]
fn start_backend(state: State<BackendState>, preferred_port: Option<u16>) -> Result<BackendStatus, String> {
    let mut child = state.child.lock().map_err(|_| "backend state poisoned".to_string())?;
    if child.is_some() {
        return Ok(BackendStatus {
            port: preferred_port.unwrap_or(43210),
        });
    }

    let port = preferred_port.unwrap_or(43210);
    let binary = backend_binary_path()?;

    let process = Command::new(binary)
        .arg("--listen")
        .arg(format!("127.0.0.1:{port}"))
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .spawn()
        .map_err(|error| format!("failed to start backend: {error}"))?;

    *child = Some(process);

    Ok(BackendStatus { port })
}

#[tauri::command]
fn stop_backend(state: State<BackendState>) -> Result<(), String> {
    let mut child = state.child.lock().map_err(|_| "backend state poisoned".to_string())?;
    if let Some(process) = child.as_mut() {
        process
            .kill()
            .map_err(|error| format!("failed to stop backend: {error}"))?;
    }
    *child = None;
    Ok(())
}

fn backend_binary_path() -> Result<PathBuf, String> {
    if let Ok(path) = env::var("K8S_IDE_BACKEND_BINARY") {
        return Ok(PathBuf::from(path));
    }

    let current_dir = env::current_dir().map_err(|error| error.to_string())?;
    Ok(current_dir.join("../backend/bin/k8s-ide-backend"))
}

fn main() {
    tauri::Builder::default()
        .manage(BackendState::default())
        .invoke_handler(tauri::generate_handler![start_backend, stop_backend])
        .setup(|app| {
            let main_window = app.get_webview_window("main");
            if main_window.is_none() {
                return Err("main window was not created".into());
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
