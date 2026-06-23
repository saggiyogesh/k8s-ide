#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod backend;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .setup(|_app| {
            backend::spawn_backend_sidecar()?;
            Ok(())
        })
        .on_event(|_app, event| {
            if let tauri::RunEvent::Exit = event {
                backend::stop_backend();
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
