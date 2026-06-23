#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    tauri::Builder::default()
        .setup(|_app| {
            // The desktop shell will manage the Go backend sidecar in a later iteration.
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
