use russh::*;
use std::sync::Arc;
use tokio::sync::mpsc;

pub struct SessionHandle {
    pub sender: mpsc::Sender<String>,
    resize_sender: mpsc::Sender<(u32, u32)>,
    client_handle: client::Handle<HandlerImpl>,
}

impl SessionHandle {
    pub fn send_data(&self, data: String) {
        let _ = self.sender.try_send(data);
    }

    pub fn resize(&self, cols: u32, rows: u32) {
        let _ = self.resize_sender.try_send((cols, rows));
    }

    pub fn disconnect(self) {
        drop(self.sender);
        drop(self.resize_sender);
        // client_handle dropped here, ending the session
    }
}

pub async fn connect_ssh(
    host: &str,
    port: u16,
    username: &str,
    password: &str,
) -> Result<(SessionHandle, mpsc::Receiver<String>), Box<dyn std::error::Error>> {
    let config = client::Config {
        ..Default::default()
    };
    let config = Arc::new(config);
    let mut handle = client::connect(config, (host, port), HandlerImpl).await?;

    let auth_res = handle.authenticate_password(username, password).await?;
    if !auth_res {
        return Err("Authentication failed".into());
    }

    let channel = handle.channel_open_session().await?;
    channel
        .request_pty(false, "xterm", 80, 24, 0, 0, &[])
        .await?;
    channel.request_shell(false).await?;

    let (tx, input_rx) = mpsc::channel::<String>(256);
    let (output_tx, output_rx) = mpsc::channel::<String>(256);
    let (resize_tx, mut resize_rx) = mpsc::channel::<(u32, u32)>(16);

    let client_handle = handle;

    // I/O task
    tokio::spawn(async move {
        let mut channel = channel;
        let mut input_rx = input_rx;
        let output_tx = output_tx;

        loop {
            tokio::select! {
                Some(data) = input_rx.recv() => {
                    if channel.data(data.as_bytes()).await.is_err() {
                        break;
                    }
                }
                Some((cols, rows)) = resize_rx.recv() => {
                    if channel.window_change(cols, rows, 0, 0).await.is_err() {
                        break;
                    }
                }
                result = channel.wait() => {
                    match result {
                        Some(ChannelMsg::Data { ref data }) => {
                            let text = String::from_utf8_lossy(data).to_string();
                            if output_tx.send(text).await.is_err() {
                                break;
                            }
                        }
                        Some(ChannelMsg::ExitStatus { .. }) | None => break,
                        _ => {}
                    }
                }
            }
        }
    });

    Ok((
        SessionHandle {
            sender: tx,
            resize_sender: resize_tx,
            client_handle,
        },
        output_rx,
    ))
}

struct HandlerImpl;

#[async_trait::async_trait]
impl client::Handler for HandlerImpl {
    type Error = russh::Error;

    async fn check_server_key(
        &mut self,
        _server_public_key: &keys::key::PublicKey,
    ) -> Result<bool, Self::Error> {
        Ok(true) // v1 accept all keys (TODO: verify known_hosts)
    }
}
