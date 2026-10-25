//! Background realtime monitor.
//!
//! Mục tiêu: 1 task duy nhất poll mỗi 1s, emit event `realtime-stats` cho
//! toàn bộ frontend subscribe. Singleton (chỉ 1 instance).
//!
//! ## Kiến trúc (Task 13)
//!
//! - `StatsCollector` giữ state giữa các tick để tính delta chính xác
//!   (CPU %, network bytes/sec).
//! - **Fast lane (1s)**: CPU, RAM, Disk usage, Network — tất cả từ `sysinfo`
//!   (rất nhẹ, < 5ms).
//! - **Slow lane (3s)**: Disk I/O, GPU usage/temp/VRAM, CPU temperature —
//!   qua WMI perf counters & `nvidia-smi` (100-300ms, không poll mỗi giây).
//! - Slow lane được cache, nên UI vẫn hiển thị liên tục giữa 2 lần refresh.
//!
//! ## Vì sao dùng `std::thread` chứ không phải async task?
//!
//! `collect()` gọi WMI (COM) và `nvidia-smi` — blocking I/O. Chạy trong
//! `tokio::spawn` sẽ chặn worker thread của runtime. `spawn_blocking` thì
//! yêu cầu closure `'static`, không capture được `&mut collector`.
//! → Dùng 1 OS thread riêng: đơn giản, cô lập, và không ảnh hưởng runtime.
//!
//! ## Vì sao `get_realtime_stats` đọc cache thay vì tạo collector mới?
//!
//! `StatsCollector::new()` có warm-up ~300ms, và `collect()` lần đầu sẽ chạy
//! WMI (100-300ms). Nếu mỗi lần frontend gọi command đều tạo collector riêng:
//! - Tốn ~500ms mỗi lần gọi.
//! - Chạy WMI dư thừa, cạnh tranh với monitor thread.
//! - Tách state delta → tính sai network bytes/sec (2 collector đều refresh
//!   cùng 1 NIC → mỗi cái chỉ nhận 1/2 delta).
//!
//! → Monitor thread publish mẫu mới nhất vào `LAST_STATS`; command chỉ đọc.

use crate::domain::RealtimeStats;
use crate::stats::StatsCollector;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, OnceLock, RwLock};
use std::thread;
use std::time::Duration;
use tauri::{AppHandle, Emitter};

/// Đánh dấu monitor đã spawn rồi (idempotent).
static STARTED: AtomicBool = AtomicBool::new(false);

/// Mẫu stats mới nhất do monitor thread publish.
static LAST_STATS: OnceLock<Arc<RwLock<Option<RealtimeStats>>>> = OnceLock::new();

fn last_stats_slot() -> &'static Arc<RwLock<Option<RealtimeStats>>> {
    LAST_STATS.get_or_init(|| Arc::new(RwLock::new(None)))
}

/// Spawn background task emit event `realtime-stats` mỗi 1 giây.
///
/// Idempotent: nếu gọi 2 lần, lần 2 bị ignore (chỉ chạy 1 background task).
pub fn spawn_realtime_monitor(app: AppHandle) {
    if STARTED.swap(true, Ordering::SeqCst) {
        log::info!("realtime monitor đã chạy rồi, bỏ qua");
        return;
    }

    let slot = last_stats_slot().clone();

    thread::Builder::new()
        .name("realtime-monitor".into())
        .spawn(move || {
            // `StatsCollector::new()` có warm-up ~300ms để lấy mẫu CPU delta đầu.
            let mut collector = StatsCollector::new();

            log::info!("realtime monitor started");

            loop {
                thread::sleep(Duration::from_millis(1000));

                let stats = collector.collect();

                // Publish để command `get_realtime_stats` đọc được.
                if let Ok(mut slot) = slot.write() {
                    *slot = Some(stats.clone());
                }

                if let Err(e) = app.emit("realtime-stats", &stats) {
                    log::warn!("emit realtime-stats failed: {e}");
                }
            }
        })
        .ok();
}

/// Lấy 1 sample realtime (cho initial state khi Dashboard mở).
///
/// Trả về mẫu mới nhất do monitor thread publish. Chỉ khi monitor chưa kịp
/// chạy tick đầu tiên (app vừa mở) mới fallback sang 1 sample độc lập.
#[tauri::command]
pub async fn get_realtime_stats() -> RealtimeStats {
    if let Some(stats) = last_stats_slot()
        .read()
        .ok()
        .and_then(|s| s.clone())
    {
        return stats;
    }

    // Fallback: monitor chưa có mẫu nào. Chạy 1 sample độc lập (blocking).
    tauri::async_runtime::spawn_blocking(sample_once)
        .await
        .unwrap_or_default()
}

fn sample_once() -> RealtimeStats {
    let mut collector = StatsCollector::new();
    collector.collect()
}
