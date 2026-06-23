use std::process::{Child, Command, Stdio};
use std::sync::Mutex;

static BACKEND_CHILD: Mutex<Option<Child>> = Mutex::new(None);

pub fn spawn_backend_sidecar() -> tauri::Result<()> {
    let mut guard = BACKEND_CHILD.lock().expect("backend mutex poisoned");
    if guard.is_some() {
        return Ok(());
    }

    let backend_binary = resolve_backend_binary();
    let child = Command::new(backend_binary)
        .args(["-addr", "127.0.0.1:9477"])
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .spawn()
        .map_err(tauri::Error::Io)?;

    *guard = Some(child);
    Ok(())
}

pub fn stop_backend() {
    let mut guard = BACKEND_CHILD.lock().expect("backend mutex poisoned");
    if let Some(mut child) = guard.take() {
        let _ = child.kill();
    }
}

fn resolve_backend_binary() -> String {
    std::env::var("K8S_IDE_BACKEND_BIN").unwrap_or_else(|_| "k8s-ide-backend".to_string())
}
