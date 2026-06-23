#[tauri::command]
fn get_backend_url() -> String {
    std::env::var("K8S_IDE_BACKEND_URL").unwrap_or_else(|_| "http://127.0.0.1:3010".to_string())
}

fn main() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![get_backend_url])
        .run(tauri::generate_context!())
        .expect("failed to run Kubernetes IDE desktop shell");
}
