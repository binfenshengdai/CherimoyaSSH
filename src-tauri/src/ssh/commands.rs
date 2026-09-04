use tauri::{AppHandle, Emitter, State};

use super::manager::ConnectionManager;

#[tauri::command]
pub async fn ssh_connect(
    app: AppHandle,
    manager: State<'_, ConnectionManager>,
    host: String,
    port: u16,
    username: String,
    password: String,
) -> Result<String, String> {
    let (id, mut output_rx) = manager.connect(host, port, username, password).await?;
    let app_clone = app.clone();
    let event_id = id.clone();

    tokio::spawn(async move {
        while let Some(text) = output_rx.recv().await {
            let _ = app_clone.emit(&format!("ssh_output_{}", event_id), text);
        }
        let _ = app_clone.emit(&format!("ssh_closed_{}", event_id), "");
    });

    Ok(id)
}

#[tauri::command]
pub fn ssh_send(
    manager: State<'_, ConnectionManager>,
    id: String,
    data: String,
) -> Result<(), String> {
    manager.send(&id, &data)
}

#[tauri::command]
pub fn ssh_resize(
    manager: State<'_, ConnectionManager>,
    id: String,
    cols: u32,
    rows: u32,
) -> Result<(), String> {
    manager.resize(&id, cols, rows)
}

#[tauri::command]
pub fn ssh_disconnect(
    manager: State<'_, ConnectionManager>,
    id: String,
) -> Result<(), String> {
    manager.disconnect(&id)
}
