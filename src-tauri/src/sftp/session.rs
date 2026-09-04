use russh::*;
use russh_sftp::client::SftpSession;
use std::sync::Arc;
use tokio::io::{AsyncRead, AsyncWrite};
use tokio::sync::Mutex;

#[derive(Clone)]
pub struct SftpHandle {
    pub session: Arc<Mutex<SftpSession>>,
}

impl SftpHandle {
    pub async fn send_data<T: AsyncRead + AsyncWrite + Unpin + Send + 'static>(
        stream: T,
    ) -> Result<Self, String> {
        let session = SftpSession::new(stream)
            .await
            .map_err(|e| format!("SFTP 初始化失败: {}", e))?;
        Ok(Self {
            session: Arc::new(Mutex::new(session)),
        })
    }

    pub async fn list(&self, path: &str) -> Result<Vec<super::commands::SftpFile>, String> {
        let session = self.session.lock().await;
        let read_dir = session
            .read_dir(path)
            .await
            .map_err(|e| e.to_string())?;

        let mut files = Vec::new();
        for entry in read_dir {
            let meta = entry.metadata();
            files.push(super::commands::SftpFile {
                name: entry.file_name(),
                path: entry.path(),
                is_dir: meta.file_type().is_dir(),
                size: meta.len(),
                modified: meta.modified()
                    .ok()
                    .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
                    .map(|d| d.as_secs())
                    .unwrap_or(0),
            });
        }
        Ok(files)
    }

    pub async fn read(&self, path: &str) -> Result<Vec<u8>, String> {
        let session = self.session.lock().await;
        session.read(path).await.map_err(|e| e.to_string())
    }

    /// 分块读取：打开文件后 seek 到 offset，读取至多 length 字节
    pub async fn read_range(&self, path: &str, offset: u64, length: u64) -> Result<Vec<u8>, String> {
        use tokio::io::{AsyncReadExt, AsyncSeekExt};
        let session = self.session.lock().await;
        let mut file = session.open(path).await.map_err(|e| e.to_string())?;
        file.seek(std::io::SeekFrom::Start(offset))
            .await
            .map_err(|e| e.to_string())?;
        let mut buf = vec![0u8; length as usize];
        let n = file.read(&mut buf).await.map_err(|e| e.to_string())?;
        buf.truncate(n);
        Ok(buf)
    }

    pub async fn write(&self, path: &str, data: &[u8]) -> Result<(), String> {
        use tokio::io::AsyncWriteExt;
        let session = self.session.lock().await;
        // create() 使用 CREATE | TRUNCATE | WRITE，保证新文件能创建、旧文件被截断覆盖
        let mut file = session
            .create(path)
            .await
            .map_err(|e| e.to_string())?;
        file.write_all(data)
            .await
            .map_err(|e| e.to_string())?;
        file.close().await.map_err(|e| e.to_string())?;
        Ok(())
    }

    /// 追加写入：用 CREATE | WRITE | APPEND 打开，支持分块上传
    pub async fn append(&self, path: &str, data: &[u8]) -> Result<(), String> {
        use russh_sftp::protocol::OpenFlags;
        use tokio::io::AsyncWriteExt;
        let session = self.session.lock().await;
        let mut file = session
            .open_with_flags(path, OpenFlags::CREATE | OpenFlags::WRITE | OpenFlags::APPEND)
            .await
            .map_err(|e| e.to_string())?;
        file.write_all(data)
            .await
            .map_err(|e| e.to_string())?;
        file.shutdown().await.map_err(|e| e.to_string())?;
        Ok(())
    }

    pub async fn remove(&self, path: &str) -> Result<(), String> {
        let session = self.session.lock().await;
        session.remove_file(path).await.map_err(|e| e.to_string())
    }

    pub async fn rename(&self, old: &str, new: &str) -> Result<(), String> {
        let session = self.session.lock().await;
        session.rename(old, new).await.map_err(|e| e.to_string())
    }

    pub async fn mkdir(&self, path: &str) -> Result<(), String> {
        let session = self.session.lock().await;
        session.create_dir(path).await.map_err(|e| e.to_string())
    }

    pub async fn disconnect(self) {
        let session = self.session.lock().await;
        let _ = session.close().await;
    }
}

/// 建立 SSH 连接并返回 SFTP 用的 stream
pub async fn connect_sftp(
    host: &str,
    port: u16,
    username: &str,
    password: &str,
) -> Result<SftpHandle, String> {
    let config = client::Config::default();
    let config = Arc::new(config);
    let mut handle = client::connect(config, (host, port), SftpClientHandler)
        .await
        .map_err(|e| format!("连接失败: {}", e))?;

    let auth_res = handle
        .authenticate_password(username, password)
        .await
        .map_err(|e| format!("认证失败: {}", e))?;

    if !auth_res {
        return Err("用户名或密码错误".to_string());
    }

    let channel = handle
        .channel_open_session()
        .await
        .map_err(|e| format!("打开会话通道失败: {}", e))?;

    channel
        .request_subsystem(true, "sftp")
        .await
        .map_err(|e| format!("打开 SFTP 子系统失败: {}", e))?;

    SftpHandle::send_data(channel.into_stream()).await
}

struct SftpClientHandler;

#[async_trait::async_trait]
impl client::Handler for SftpClientHandler {
    type Error = russh::Error;

    async fn check_server_key(
        &mut self,
        _server_public_key: &keys::key::PublicKey,
    ) -> Result<bool, Self::Error> {
        Ok(true) // v1 接受所有密钥（TODO: 验证 known_hosts）
    }
}
