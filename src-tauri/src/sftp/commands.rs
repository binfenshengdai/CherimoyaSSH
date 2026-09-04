use serde::Serialize;
use tauri::State;

use super::manager::SftpManager;

#[derive(Serialize, Clone)]
pub struct SftpFile {
    pub name: String,
    pub path: String,
    pub is_dir: bool,
    pub size: u64,
    pub modified: u64,
}

#[tauri::command]
pub async fn sftp_connect(
    manager: State<'_, SftpManager>,
    host: String,
    port: u16,
    username: String,
    password: String,
) -> Result<String, String> {
    manager.connect(host, port, username, password).await
}

#[tauri::command]
pub async fn sftp_list(
    manager: State<'_, SftpManager>,
    session_id: String,
    path: String,
) -> Result<Vec<SftpFile>, String> {
    let handle = manager.get(&session_id)?;
    handle.list(&path).await
}

#[tauri::command]
pub async fn sftp_read(
    manager: State<'_, SftpManager>,
    session_id: String,
    path: String,
) -> Result<Vec<u8>, String> {
    let handle = manager.get(&session_id)?;
    handle.read(&path).await
}

#[tauri::command]
pub async fn sftp_read_range(
    manager: State<'_, SftpManager>,
    session_id: String,
    path: String,
    offset: u64,
    length: u64,
) -> Result<Vec<u8>, String> {
    let handle = manager.get(&session_id)?;
    handle.read_range(&path, offset, length).await
}

#[tauri::command]
pub async fn sftp_write(
    manager: State<'_, SftpManager>,
    session_id: String,
    path: String,
    data: Vec<u8>,
    append: Option<bool>,
) -> Result<(), String> {
    let handle = manager.get(&session_id)?;
    if append == Some(true) {
        handle.append(&path, &data).await
    } else {
        handle.write(&path, &data).await
    }
}

#[tauri::command]
pub async fn sftp_remove(
    manager: State<'_, SftpManager>,
    session_id: String,
    path: String,
) -> Result<(), String> {
    let handle = manager.get(&session_id)?;
    handle.remove(&path).await
}

#[tauri::command]
pub async fn sftp_rename(
    manager: State<'_, SftpManager>,
    session_id: String,
    old_path: String,
    new_path: String,
) -> Result<(), String> {
    let handle = manager.get(&session_id)?;
    handle.rename(&old_path, &new_path).await
}

#[tauri::command]
pub async fn sftp_mkdir(
    manager: State<'_, SftpManager>,
    session_id: String,
    path: String,
) -> Result<(), String> {
    let handle = manager.get(&session_id)?;
    handle.mkdir(&path).await
}

#[tauri::command]
pub async fn sftp_disconnect(
    manager: State<'_, SftpManager>,
    session_id: String,
) -> Result<(), String> {
    let handle = manager.remove(&session_id)?;
    handle.disconnect().await;
    Ok(())
}
