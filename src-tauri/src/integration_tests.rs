//! Test tích hợp (bỏ qua mặc định) — chạy trên máy thật.
//!
//! ```powershell
//! cargo test --lib integration -- --ignored --nocapture
//! ```
//!
//! Test này export driver thật của máy đang chạy vào thư viện tạm,
//! kiểm tra cấu trúc `HÃNG/DÒNG` được tạo đúng.

#![cfg(test)]

use crate::driver_library;
use crate::machine_profile;

#[test]
#[ignore = "cần chạy trên máy thật, ghi file vào %TEMP%"]
fn machine_profile_detect_returns_brand_and_series() {
    let p = machine_profile::detect();
    println!(
        "brand={:?} series={:?} model={:?} family={:?} subdir={:?}",
        p.brand, p.series, p.model, p.family, p.library_subdir()
    );
    assert!(!p.brand.is_empty(), "brand phải có giá trị");
    assert!(!p.series.is_empty(), "series phải có giá trị");
    assert!(!p.brand_key.is_empty());
    assert!(!p.series_key.is_empty());
    // Subdir phải an toàn cho tên folder Windows.
    assert!(!p.library_subdir().contains('<'));
    assert!(!p.library_subdir().contains('>'));
    assert!(!p.library_subdir().contains(':'));
}

#[test]
#[ignore = "cần chạy trên máy thật, ghi file vào %TEMP%"]
fn enum_store_drivers_finds_drivers() {
    let drivers = driver_library::enum_store_drivers().expect("phải đọc được danh sách driver");
    assert!(!drivers.is_empty());
    for d in drivers.iter().take(5) {
        println!(
            "{} | {} | {} | {}",
            d.published_name, d.provider, d.class_name, d.device_name
        );
    }
}

#[test]
#[ignore = "cần chạy trên máy thật, ghi file vào %TEMP%"]
fn restore_from_library_group_reinstalls_drivers() {
    let profile = machine_profile::detect();
    let mut drivers = driver_library::enum_store_drivers().expect("enum drivers");
    driver_library::attach_device_names(&mut drivers);
    let grouped = driver_library::group_drivers(&drivers, &profile);

    let lib = std::env::temp_dir().join("pcmanager_drvlib_restore");
    let _ = std::fs::remove_dir_all(&lib);
    let lib_str = lib.to_string_lossy().to_string();

    let stats =
        driver_library::export_grouped(&grouped, &lib_str, &mut |_| {}).expect("export thành công");
    assert_eq!(stats.failed_count, 0);

    // Thử khôi phục nhóm của dòng máy hiện tại.
    let current = profile.library_subdir();
    let group_dir = lib.join(&current);
    if group_dir.is_dir() {
        let r = driver_library::restore_group(&group_dir.to_string_lossy())
            .expect("restore phải chạy được (driver đã có sẵn → Already exists)");
        println!("added={} already={}", r.added_count, r.already_present_count);
        assert!(r.added_count + r.already_present_count > 0);
    } else {
        println!("(Máy này không có nhóm OEM riêng — bỏ qua restore)");
    }

    let _ = std::fs::remove_dir_all(&lib);
}

#[test]
#[ignore = "cần chạy trên máy thật, ghi file vào %TEMP%"]
fn export_grouped_creates_brand_series_structure() {
    let profile = machine_profile::detect();
    let mut drivers = driver_library::enum_store_drivers().expect("enum drivers");
    driver_library::attach_device_names(&mut drivers);

    let grouped = driver_library::group_drivers(&drivers, &profile);
    println!("=== Nhóm phân loại ===");
    for (k, v) in &grouped.groups {
        println!("  {k} → {} driver", v.len());
    }

    // Nhóm của dòng máy hiện tại phải tồn tại nếu có driver OEM.
    let current = profile.library_subdir();
    println!("Nhóm hiện tại: {current}");

    let lib = std::env::temp_dir().join("pcmanager_drvlib_it");
    let _ = std::fs::remove_dir_all(&lib);
    let lib_str = lib.to_string_lossy().to_string();

    let mut last = String::new();
    let stats = driver_library::export_grouped(&grouped, &lib_str, &mut |m| {
        last = m.to_string();
    })
    .expect("export phải thành công");

    println!("exported={} failed={} size={}", stats.exported_count, stats.failed_count, stats.total_size_bytes);
    println!("progress cuối: {last}");
    assert_eq!(stats.failed_count, 0, "không nên có driver lỗi: {:?}", stats.failures);
    assert!(stats.exported_count > 0);

    // Kiểm tra cấu trúc thư mục.
    let scanned = driver_library::scan_library(&lib_str, &current);
    assert!(!scanned.is_empty());
    for g in &scanned {
        println!("  {} — {} driver, {} bytes", g.path, g.driver_count, g.size_bytes);
    }

    // Nhóm của máy hiện tại phải được đánh dấu.
    let current_group = scanned.iter().find(|g| g.matches_current);
    if let Some(g) = current_group {
        println!("✓ Nhóm máy này: {}", g.path);
    } else {
        println!("(Máy này không có driver OEM riêng — chỉ có driver chung)");
    }

    let _ = std::fs::remove_dir_all(&lib);
}
