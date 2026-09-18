mod ssh;
mod sftp;

use ssh::manager::ConnectionManager;
use sftp::manager::SftpManager;

#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_os::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .manage(ConnectionManager::new())
        .manage(SftpManager::new())
        .invoke_handler(tauri::generate_handler![
            greet,
            ssh::commands::ssh_connect,
            ssh::commands::ssh_send,
            ssh::commands::ssh_resize,
            ssh::commands::ssh_disconnect,
            sftp::commands::sftp_connect,
            sftp::commands::sftp_list,
            sftp::commands::sftp_read,
            sftp::commands::sftp_read_range,
            sftp::commands::sftp_write,
            sftp::commands::sftp_remove,
            sftp::commands::sftp_rename,
            sftp::commands::sftp_mkdir,
            sftp::commands::sftp_disconnect,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
