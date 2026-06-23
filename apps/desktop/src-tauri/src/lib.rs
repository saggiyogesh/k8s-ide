use std::process::{Child, Command, Stdio};
use std::sync::Mutex;
use tauri::Manager;

struct BackendProcess(Mutex<Option<Child>>);

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .manage(BackendProcess(Mutex::new(None)))
        .setup(|app| {
            start_backend(app.handle())?;
            Ok(())
        })
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::Destroyed = event {
                if let Some(state) = window.app_handle().try_state::<BackendProcess>() {
                    if let Ok(mut guard) = state.0.lock() {
                        if let Some(mut child) = guard.take() {
                            let _ = child.kill();
                        }
                    }
                }
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

fn start_backend(app: &tauri::AppHandle) -> Result<(), Box<dyn std::error::Error>> {
    let resource_dir = app.path().resource_dir()?;
    let backend_name = if cfg!(target_os = "windows") {
        "k8s-ide-backend-x86_64-pc-windows-msvc.exe"
    } else if cfg!(target_os = "macos") {
        "k8s-ide-backend-x86_64-apple-darwin"
    } else {
        "k8s-ide-backend-x86_64-unknown-linux-gnu"
    };

    let bundled = resource_dir.join("binaries").join(backend_name);
    let dev_backend = std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("../../../backend/bin/server");

    let backend_path = if bundled.exists() {
        bundled
    } else if dev_backend.exists() {
        dev_backend
    } else {
        // Fall back to go run in development when binary is not built yet
        let child = Command::new("go")
            .args(["run", "./cmd/server", "-addr", "127.0.0.1:9475"])
            .current_dir(
                std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../../backend"),
            )
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .spawn()?;
        if let Some(state) = app.try_state::<BackendProcess>() {
            *state.0.lock().unwrap() = Some(child);
        }
        return Ok(());
    };

    let child = Command::new(backend_path)
        .args(["-addr", "127.0.0.1:9475"])
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .spawn()?;

    if let Some(state) = app.try_state::<BackendProcess>() {
        *state.0.lock().unwrap() = Some(child);
    }

    Ok(())
}
