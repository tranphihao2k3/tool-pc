/**
 * useRealtimeStats - subscribe event `realtime-stats` từ Tauri.
 *
 * - Trong Tauri: listen event, cập nhật state mỗi tick
 * - Ngoài Tauri (browser mock): setInterval 1s với data random
 * - Cleanup listener khi unmount
 */
import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen, UnlistenFn } from "@tauri-apps/api/event";
import type { RealtimeStats } from "@/shared/types/system";

const isTauri =
  typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

const initialStats: RealtimeStats = {
  cpuPercent: 0,
  ramPercent: 0,
  ramUsedBytes: 0,
  ramTotalBytes: 0,
  gpuPercent: null,
  netRxBps: 0,
  netTxBps: 0,
  diskReadBps: 0,
  diskWriteBps: 0,
  cpuTempC: null,
  timestampMs: 0,
  diskPercent: 0,
  diskUsedBytes: 0,
  diskTotalBytes: 0,
  diskSystemDrive: "C:",
  cpuFreqMhz: 0,
  perCoreLoad: [],
  gpuName: null,
  gpuTempC: null,
  gpuVramUsedBytes: null,
  gpuVramTotalBytes: null,
};

export function useRealtimeStats(): RealtimeStats {
  const [stats, setStats] = useState<RealtimeStats>(initialStats);

  useEffect(() => {
    let unlisten: UnlistenFn | null = null;
    let cancelled = false;

    if (isTauri) {
      // Lấy 1 sample ngay để initial state
      invoke<RealtimeStats>("get_realtime_stats")
        .then((s) => {
          if (!cancelled) setStats(s);
        })
        .catch(() => {
          // ignore initial fetch error; event sẽ tới sau
        });

      // Subscribe event stream
      listen<RealtimeStats>("realtime-stats", (event) => {
        if (!cancelled) setStats(event.payload);
      })
        .then((u) => {
          unlisten = u;
        })
        .catch((err) => {
          console.error("listen realtime-stats failed", err);
        });
    } else {
      // Browser mock: 1s interval
      const t = setInterval(() => {
        const now = Date.now();
        const s = now / 1000;
        setStats({
          cpuPercent: Math.max(0, Math.min(100, 15 + Math.sin(s / 3) * 10 + Math.random() * 8)),
          ramPercent: Math.max(0, Math.min(100, 45 + Math.sin(s / 5) * 5 + Math.random() * 3)),
          ramUsedBytes: 8.2 * 1024 ** 3,
          ramTotalBytes: 16 * 1024 ** 3,
          gpuPercent: null,
          netRxBps: Math.random() * 5e6,
          netTxBps: Math.random() * 2e6,
          diskReadBps: Math.random() * 1e6,
          diskWriteBps: Math.random() * 5e5,
          cpuTempC: null,
          timestampMs: now,
          diskPercent: 42 + Math.sin(s / 7) * 3,
          diskUsedBytes: 210 * 1024 ** 3,
          diskTotalBytes: 500 * 1024 ** 3,
          diskSystemDrive: "C:",
          cpuFreqMhz: 4200,
          perCoreLoad: Array.from({ length: 8 }, () => Math.random() * 40),
          gpuName: null,
          gpuTempC: null,
          gpuVramUsedBytes: null,
          gpuVramTotalBytes: null,
        });
      }, 1000);
      unlisten = () => clearInterval(t);
    }

    return () => {
      cancelled = true;
      if (unlisten) unlisten();
    };
  }, []);

  return stats;
}
