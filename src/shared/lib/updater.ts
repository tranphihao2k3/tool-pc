// Tauri auto-update API wrapper (Task 11 - Build & Auto-update).
//
// Uses the 3 Rust commands added in `commands/updater.rs`:
//   - get_current_version          → đọc version hiện tại
//   - check_for_update             → kiểm tra bản mới từ GitHub Releases
//   - download_and_install_update  → tải + cài (phát event `update-progress`)
//
// Progress events được Rust emit với payload `UpdateProgressReport`:
//   { stage, percent, downloadedBytes, totalBytes, message }

import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";

export interface UpdateInfo {
  available: boolean;
  currentVersion: string;
  latestVersion: string;
  notes: string | null;
  pubDate: string | null;
  downloadUrl: string | null;
  signatureValid: boolean;
}

export type UpdateStage = "downloading" | "installing" | "finished" | "failed";

export interface UpdateProgressReport {
  stage: UpdateStage;
  percent: number;
  downloadedBytes: number;
  totalBytes: number;
  message: string;
}

/** Đọc version hiện tại của app. */
export async function getCurrentVersion(): Promise<string> {
  return invoke<string>("get_current_version");
}

/** Kiểm tra xem có bản cập nhật mới không. Trả về info (không throw). */
export async function checkForUpdate(): Promise<UpdateInfo> {
  return invoke<UpdateInfo>("check_for_update");
}

/** Tải về và cài bản cập nhật. Trả về true nếu có bản mới và cài thành công. */
export async function downloadAndInstallUpdate(): Promise<boolean> {
  return invoke<boolean>("download_and_install_update");
}

/** Lắng nghe event `update-progress` từ Rust. Trả về hàm unlisten. */
export async function onUpdateProgress(
  callback: (progress: UpdateProgressReport) => void
): Promise<UnlistenFn> {
  return listen<UpdateProgressReport>("update-progress", (event) => {
    callback(event.payload);
  });
}
