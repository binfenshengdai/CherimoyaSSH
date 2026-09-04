export interface Host {
  id: string;
  name: string;
  host: string;
  port: number;
  username: string;
  password: string;
  categoryId: string;
  createdAt: number;
}

export interface Category {
  id: string;
  name: string;
}

export interface Tab {
  id: string;
  hostId: string;
  title: string;
  connectionId: string;
  kind: "terminal" | "sftp";
  sftpPath?: string;
}

export type ConnectionState = "connecting" | "connected" | "disconnected" | "error";

export interface SftpFile {
  name: string;
  path: string;
  is_dir: boolean;
  size: number;
  modified: number;
}

export type UploadStatus = "uploading" | "completed" | "error" | "cancelled";

export interface UploadItem {
  id: string;
  fileName: string;
  targetPath: string;
  totalBytes: number;
  uploadedBytes: number;
  status: UploadStatus;
  error?: string;
}

export interface HostInput {
  name: string;
  host: string;
  port: number;
  username: string;
  password: string;
  categoryId: string;
}
