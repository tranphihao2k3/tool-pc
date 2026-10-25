// React hook cho auto-update (Task 11 - Build & Auto-update).
//
// Usage:
//   const { info, progress, isChecking, error, check, install } = useUpdater();
//
//   useEffect(() => { check(); }, []);  // auto-check on mount
//
//   <Button onClick={install} disabled={!info?.available || progress.stage === "downloading"}>
//     {progress.stage === "downloading" ? "Đang tải…" : "Cập nhật"}
//   </Button>

import { useCallback, useEffect, useRef, useState } from "react";
import {
  checkForUpdate,
  downloadAndInstallUpdate,
  getCurrentVersion,
  onUpdateProgress,
  type UpdateInfo,
  type UpdateProgressReport,
} from "./updater";

export interface UseUpdaterState {
  currentVersion: string | null;
  info: UpdateInfo | null;
  progress: UpdateProgressReport;
  isChecking: boolean;
  isInstalling: boolean;
  error: string | null;
  check: () => Promise<void>;
  install: () => Promise<void>;
  reset: () => void;
}

const INITIAL_PROGRESS: UpdateProgressReport = {
  stage: "downloading",
  percent: 0,
  downloadedBytes: 0,
  totalBytes: 0,
  message: "",
};

export function useUpdater(): UseUpdaterState {
  const [currentVersion, setCurrentVersion] = useState<string | null>(null);
  const [info, setInfo] = useState<UpdateInfo | null>(null);
  const [progress, setProgress] = useState<UpdateProgressReport>(INITIAL_PROGRESS);
  const [isChecking, setIsChecking] = useState(false);
  const [isInstalling, setIsInstalling] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Lưu unlisten function để cleanup
  const unlistenRef = useRef<(() => void) | null>(null);

  // Subscribe progress events 1 lần khi mount
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const unlisten = await onUpdateProgress((p) => {
          if (!cancelled) {
            setProgress(p);
            if (p.stage === "finished" || p.stage === "failed") {
              setIsInstalling(false);
            }
          }
        });
        if (cancelled) {
          unlisten();
        } else {
          unlistenRef.current = unlisten;
        }
      } catch (e) {
        console.warn("[useUpdater] Could not subscribe to update-progress:", e);
      }
    })();
    return () => {
      cancelled = true;
      if (unlistenRef.current) {
        unlistenRef.current();
        unlistenRef.current = null;
      }
    };
  }, []);

  // Load version hiện tại 1 lần
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const v = await getCurrentVersion();
        if (!cancelled) setCurrentVersion(v);
      } catch (e) {
        console.warn("[useUpdater] getCurrentVersion failed:", e);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const check = useCallback(async () => {
    setIsChecking(true);
    setError(null);
    try {
      const result = await checkForUpdate();
      setInfo(result);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setIsChecking(false);
    }
  }, []);

  const install = useCallback(async () => {
    if (isInstalling) return;
    setIsInstalling(true);
    setError(null);
    setProgress({ ...INITIAL_PROGRESS, message: "Đang bắt đầu cập nhật…" });
    try {
      await downloadAndInstallUpdate();
      // Sau khi cài xong, refresh info
      const refreshed = await checkForUpdate();
      setInfo(refreshed);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setIsInstalling(false);
    }
  }, [isInstalling]);

  const reset = useCallback(() => {
    setProgress(INITIAL_PROGRESS);
    setError(null);
  }, []);

  return {
    currentVersion,
    info,
    progress,
    isChecking,
    isInstalling,
    error,
    check,
    install,
    reset,
  };
}
