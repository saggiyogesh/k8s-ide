use serde::Serialize;

#[derive(Serialize)]
struct BackendStatus {
    mode: &'static str,
    endpoint: &'static str,
    status: &'static str,
}

#[tauri::command]
fn backend_status() -> BackendStatus {
    BackendStatus {
        mode: "sidecar-scaffold",
        endpoint: "http://127.0.0.1:9845",
        status: "backend lifecycle wiring will be added here",
    }
}

fn main() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![backend_status])
        .run(tauri::generate_context!())
        .expect("failed to run tauri desktop shell");
}
