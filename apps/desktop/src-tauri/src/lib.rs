use std::process::{Child, Command};
use std::sync::Mutex;
use tauri::{AppHandle, Manager, State};

/// Holds the backend sidecar child process while the app is running.
pub struct BackendProcess(Mutex<Option<Child>>);

/// Start the bundled Go backend sidecar.
#[tauri::command]
fn start_backend(state: State<'_, BackendProcess>, app: AppHandle) -> Result<String, String> {
    let mut guard = state.0.lock().map_err(|e| e.to_string())?;
    if guard.is_some() {
        return Ok("already running".into());
    }

    // In development, look for the binary next to the executable.
    // In production, Tauri bundles the sidecar via `tauri.conf.json`.
    let sidecar_path = app
        .path()
        .resource_dir()
        .map_err(|e| e.to_string())?
        .join("binaries")
        .join("k8s-ide-server");

    let child = Command::new(&sidecar_path)
        .spawn()
        .map_err(|e| format!("failed to start backend: {e}"))?;

    *guard = Some(child);
    Ok("started".into())
}

/// Stop the backend sidecar.
#[tauri::command]
fn stop_backend(state: State<'_, BackendProcess>) -> Result<(), String> {
    let mut guard = state.0.lock().map_err(|e| e.to_string())?;
    if let Some(mut child) = guard.take() {
        child.kill().ok();
    }
    Ok(())
}

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_shell::init())
        .manage(BackendProcess(Mutex::new(None)))
        .invoke_handler(tauri::generate_handler![start_backend, stop_backend])
        .setup(|app| {
            // Automatically start the backend on launch.
            let handle = app.handle().clone();
            let state = app.state::<BackendProcess>();
            let _ = start_backend(state, handle.into());
            Ok(())
        })
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::Destroyed = event {
                // Clean up sidecar on window close.
                let state = window.state::<BackendProcess>();
                let _ = stop_backend(state);
            }
        })
        .run(tauri::generate_context!())
        .expect("error running tauri application");
}
