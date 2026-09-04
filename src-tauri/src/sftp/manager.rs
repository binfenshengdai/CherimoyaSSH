use std::collections::HashMap;
use std::sync::{Arc, Mutex};
use uuid::Uuid;

use super::session::{connect_sftp, SftpHandle};

pub struct SftpManager {
    sessions: Arc<Mutex<HashMap<String, SftpHandle>>>,
}

impl SftpManager {
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
    ) -> Result<String, String> {
        let id = Uuid::new_v4().to_string();
        let handle = connect_sftp(&host, port, &username, &password).await?;
        self.sessions.lock().unwrap().insert(id.clone(), handle);
        Ok(id)
    }

    pub fn get(&self, id: &str) -> Result<SftpHandle, String> {
        let sessions = self.sessions.lock().unwrap();
        sessions
            .get(id)
            .cloned()
            .ok_or_else(|| "SFTP 会话不存在".to_string())
    }

    pub fn remove(&self, id: &str) -> Result<SftpHandle, String> {
        let mut sessions = self.sessions.lock().unwrap();
        sessions
            .remove(id)
            .ok_or_else(|| "SFTP 会话不存在".to_string())
    }
}

impl Clone for SftpManager {
    fn clone(&self) -> Self {
        Self {
            sessions: self.sessions.clone(),
        }
    }
}

impl Default for SftpManager {
    fn default() -> Self {
        Self::new()
    }
}
