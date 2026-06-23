use std::{
    env,
    path::PathBuf,
    process::{Child, Command, Stdio},
    sync::Mutex,
};

struct BackendState(Mutex<Option<Child>>);

#[tauri::command]
fn start_backend(state: tauri::State<'_, BackendState>) -> Result<String, String> {
    let mut guard = state.0.lock().map_err(|_| "failed to lock backend state".to_string())?;
    if guard.is_some() {
        return Ok("backend already running".to_string());
    }

    let binary = resolve_backend_binary()?;
    let mut child = Command::new(&binary)
        .arg("--addr")
        .arg("127.0.0.1:7319")
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .spawn()
        .map_err(|error| format!("failed to spawn backend {:?}: {error}", binary))?;

    let pid = child.id();
    *guard = Some(child);
    Ok(format!("backend started with pid {pid}"))
}

#[tauri::command]
fn stop_backend(state: tauri::State<'_, BackendState>) -> Result<String, String> {
    let mut guard = state.0.lock().map_err(|_| "failed to lock backend state".to_string())?;
    let Some(child) = guard.as_mut() else {
        return Ok("backend not running".to_string());
    };

    child
        .kill()
        .map_err(|error| format!("failed to stop backend: {error}"))?;
    let _ = child.wait();
    *guard = None;

    Ok("backend stopped".to_string())
}

fn resolve_backend_binary() -> Result<PathBuf, String> {
    if let Ok(path) = env::var("K8S_IDE_BACKEND_BIN") {
        return Ok(PathBuf::from(path));
    }

    let cwd = env::current_dir().map_err(|error| format!("failed to resolve current dir: {error}"))?;
    Ok(cwd.join("../backend/bin/k8s-ide-backend"))
}

fn main() {
    tauri::Builder::default()
        .manage(BackendState(Mutex::new(None)))
        .invoke_handler(tauri::generate_handler![start_backend, stop_backend])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
