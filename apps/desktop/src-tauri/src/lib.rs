// Prevents additional console window on Windows in release
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use tauri::Manager;
use tauri_plugin_shell::ShellExt;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .setup(|app| {
            let shell = app.shell();
            let sidecar = shell
                .sidecar("server")
                .expect("failed to create sidecar command");

            let (_rx, child) = sidecar.spawn().expect("failed to spawn backend sidecar");

            app.manage(BackendProcess(child));

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

struct BackendProcess(tauri_plugin_shell::process::CommandChild);

impl Drop for BackendProcess {
    fn drop(&mut self) {
        let _ = self.0.kill();
    }
}
