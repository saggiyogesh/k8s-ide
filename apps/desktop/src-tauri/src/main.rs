#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::{
    path::PathBuf,
    process::{Child, Command, Stdio},
    sync::Mutex,
};

use tauri::State;

struct BackendState {
    child: Mutex<Option<Child>>,
}

#[tauri::command]
fn start_backend(state: State<'_, BackendState>) -> Result<String, String> {
    let mut child = state
        .child
        .lock()
        .map_err(|_| String::from("failed to lock backend state"))?;

    if child.is_none() {
        let backend_path = std::env::var("K8S_IDE_BACKEND_PATH")
            .map(PathBuf::from)
            .unwrap_or_else(|_| PathBuf::from("../backend/bin/k8s-ide-backend"));

        let spawned = Command::new(backend_path)
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .spawn()
            .map_err(|error| format!("failed to launch backend: {error}"))?;

        *child = Some(spawned);
    }

    Ok(String::from("http://127.0.0.1:7447"))
}

#[tauri::command]
fn stop_backend(state: State<'_, BackendState>) -> Result<(), String> {
    let mut child = state
        .child
        .lock()
        .map_err(|_| String::from("failed to lock backend state"))?;

    if let Some(process) = child.as_mut() {
        process
            .kill()
            .map_err(|error| format!("failed to stop backend: {error}"))?;
    }

    *child = None;
    Ok(())
}

#[tauri::command]
fn backend_status(state: State<'_, BackendState>) -> Result<String, String> {
    let child = state
        .child
        .lock()
        .map_err(|_| String::from("failed to lock backend state"))?;

    if child.is_some() {
        Ok(String::from("running"))
    } else {
        Ok(String::from("stopped"))
    }
}

fn main() {
    tauri::Builder::default()
        .manage(BackendState {
            child: Mutex::new(None),
        })
        .invoke_handler(tauri::generate_handler![
            start_backend,
            stop_backend,
            backend_status
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
