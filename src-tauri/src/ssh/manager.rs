use std::collections::HashMap;
use std::sync::{Arc, Mutex};
use tokio::sync::mpsc;
use uuid::Uuid;

use super::session::SessionHandle;

pub struct ConnectionManager {
    sessions: Arc<Mutex<HashMap<String, SessionHandle>>>,
}

impl ConnectionManager {
    pub fn new() -> Self {
        Self {
            sessions: Arc::new(Mutex::new(HashMap::new())),
        }
    }

    pub async fn connect(
        &self,
        host: String,
        port: u16,
        username: String,
        password: String,
    ) -> Result<(String, mpsc::Receiver<String>), String> {
        let id = Uuid::new_v4().to_string();
        let (handle, output_rx) = super::session::connect_ssh(&host, port, &username, &password)
            .await
            .map_err(|e| e.to_string())?;

        self.sessions.lock().unwrap().insert(id.clone(), handle);
        Ok((id, output_rx))
    }

    pub fn send(&self, id: &str, data: &str) -> Result<(), String> {
        let sessions = self.sessions.lock().unwrap();
        match sessions.get(id) {
            Some(handle) => {
                handle.send_data(data.to_string());
                Ok(())
            }
            None => Err("Connection not found".to_string()),
        }
    }

    pub fn resize(&self, id: &str, cols: u32, rows: u32) -> Result<(), String> {
        let sessions = self.sessions.lock().unwrap();
        match sessions.get(id) {
            Some(handle) => {
                handle.resize(cols, rows);
                Ok(())
            }
            None => Err("Connection not found".to_string()),
        }
    }

    pub fn disconnect(&self, id: &str) -> Result<(), String> {
        let mut sessions = self.sessions.lock().unwrap();
        match sessions.remove(id) {
            Some(handle) => {
                handle.disconnect();
                Ok(())
            }
            None => Err("Connection not found".to_string()),
        }
    }
}

impl Default for ConnectionManager {
    fn default() -> Self {
        Self::new()
    }
}
