//! Xác định **hãng** + **dòng máy (product series)** từ thông tin phần cứng.
//!
//! ## Vì sao cần "dòng máy" thay vì model chính xác?
//!
//! Khi backup driver để dự phòng / cài lại máy, driver của các máy **cùng dòng**
//! gần như giống nhau. Ví dụ:
//!
//! - `Acer Nitro AN515-51`, `Nitro AN515-57`, `Nitro AN517-51` → cùng dòng **Nitro 5**
//! - `ASUS TUF Gaming A15`, `TUF Gaming F15` → cùng dòng **TUF Gaming**
//! - `HP Gaming 17-da1xxx` → dòng **Gaming**
//!
//! Nhờ đó thư viện driver được gom theo `HÃNG/DÒNG` thay vì `HÃNG/MODEL`,
//! và khi cài máy mới phần mềm tự tìm đúng dòng để khôi phục.
//!
//! ## Nguồn dữ liệu
//!
//! Ưu tiên registry `HKLM\HARDWARE\DESCRIPTION\System\BIOS`:
//!
//! | Value            | Ý nghĩa                        | Ví dụ           |
//! |------------------|--------------------------------|-----------------|
//! | `SystemManufacturer` | Hãng (raw)                | `Acer`          |
//! | `SystemProductName`   | Model (raw)                | `Nitro AN515-51`|
//! | `SystemFamily`        | **Dòng sản phẩm** (marketing) | `Acer Nitro 5` |
//! | `SystemSKU`           | SKU / mã máy                | `AN515-51`      |
//!
//! `SystemFamily` chính là nơi OEM khai báo tên dòng (marketing name) → ưu tiên dùng.
//! Khi `SystemFamily` không dùng được (rỗng, hoặc là mã kỹ thuật kiểu `103C`),
//! fallback sang model + bảng rule theo hãng.
//!
//! ## Thuật toán chọn series
//!
//! 1. **Family** — bỏ chữ hãng + bỏ mã model ở cuối (ưu tiên cao nhất).
//! 2. **Model** — bỏ chữ hãng + bỏ mã model ở cuối (vd `ASUS TUF Gaming A15 FA507NR`
//!    → `TUF Gaming`).
//! 3. **Tiền tố model** theo bảng rule của hãng (vd Acer `AN5xx` → `Nitro 5`).
//! 4. **Keyword theo hãng** (vd `omen` → `OMEN Gaming`).
//! 5. Fallback `Khác`.

use winreg::enums::HKEY_LOCAL_MACHINE;
use winreg::RegKey;

// =================================================================
// Kiểu dữ liệu
// =================================================================

/// Hồ sơ nhận diện máy: hãng + dòng sản phẩm.
#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MachineProfile {
    /// Nhà sản xuất gốc (vd "Acer").
    pub manufacturer: String,
    /// Model chính xác (vd "Nitro AN515-51").
    pub model: String,
    /// Họ sản phẩm do OEM khai báo (vd "Acer Nitro 5").
    pub family: String,
    /// SKU / mã máy (vd "AN515-51").
    pub sku: String,
    /// Hãng chuẩn hoá, dùng làm tên folder (vd "ACER").
    pub brand: String,
    /// Dòng sản phẩm chuẩn hoá (vd "Nitro 5").
    pub series: String,
    /// Slug của hãng, an toàn cho tên folder (vd "acer").
    pub brand_key: String,
    /// Slug của dòng, an toàn cho tên folder (vd "nitro-5").
    pub series_key: String,
}

impl MachineProfile {
    /// Đường dẫn tương đối trong thư viện driver: `ACER/Nitro 5`.
    pub fn library_subdir(&self) -> String {
        format!("{}/{}", self.brand, self.series)
    }
}

// =================================================================
// Bảng rule
// =================================================================

/// Chuẩn hoá tên hãng. Thứ tự **quan trọng** — rule cụ thể phải đứng trước.
///
/// Needle nhiều từ được so khớp bằng `contains`; needle 1 từ so khớp theo
/// **ranh giới từ** để tránh `"hp"` khớp nhầm `"nvidia"`.
const BRAND_CANON: &[(&str, &str)] = &[
    ("hewlett packard", "HP"),
    ("hewlett-packard", "HP"),
    ("hewlett", "HP"),
    ("micro star", "MSI"),
    ("micro-star", "MSI"),
    ("microstar", "MSI"),
    ("asustek", "ASUS"),
    ("acer", "ACER"),
    ("asus", "ASUS"),
    ("msi", "MSI"),
    ("hp", "HP"),
    ("dell", "DELL"),
    ("lenovo", "LENOVO"),
    ("gigabyte", "GIGABYTE"),
    ("razer", "RAZER"),
    ("toshiba", "TOSHIBA"),
    ("samsung", "SAMSUNG"),
    ("huawei", "HUAWEI"),
    ("xiaomi", "XIAOMI"),
    ("fujitsu", "FUJITSU"),
    ("nec", "NEC"),
    ("panasonic", "PANASONIC"),
    ("sony", "SONY"),
    ("vaio", "SONY"),
    ("microsoft", "MICROSOFT"),
    ("surface", "MICROSOFT"),
    ("clevo", "CLEVO"),
    ("schenker", "SCHENKER"),
    ("framework", "FRAMEWORK"),
    ("avita", "AVITA"),
    ("lg electronics", "LG"),
];

/// Từ khoá → tên dòng sản phẩm, theo từng hãng.
/// Thứ tự trong mỗi hãng = độ ưu tiên (cao trước).
const SERIES_RULES: &[(&str, &[(&str, &str)])] = &[
    (
        "acer",
        &[
            ("nitro v", "Nitro V"),
            ("predator", "Predator"),
            ("swift", "Swift"),
            ("aspire", "Aspire"),
            ("travelmate", "TravelMate"),
            ("conceptd", "ConceptD"),
            ("chromebook", "Chromebook"),
            ("nitro", "Nitro"),
        ],
    ),
    (
        "asus",
        &[
            ("tuf gaming", "TUF Gaming"),
            ("rog strix", "ROG Strix"),
            ("vivobook", "VivoBook"),
            ("expertbook", "ExpertBook"),
            ("zenbook", "Zenbook"),
            ("proart", "ProArt"),
            ("tuf", "TUF Gaming"),
            ("rog", "ROG"),
            ("prime", "Prime"),
        ],
    ),
    (
        "hp",
        &[
            ("pavilion gaming", "Pavilion Gaming"),
            ("omen", "OMEN Gaming"),
            ("victus", "Victus Gaming"),
            ("elitebook", "EliteBook"),
            ("probook", "ProBook"),
            ("spectre", "Spectre"),
            ("pavilion", "Pavilion"),
            ("deskjet", "DeskJet"),
            ("envy", "Envy"),
            ("gaming", "Gaming"),
        ],
    ),
    (
        "dell",
        &[
            ("alienware", "Alienware"),
            ("optiplex", "OptiPlex"),
            ("inspiron", "Inspiron"),
            ("latitude", "Latitude"),
            ("vostro", "Vostro"),
            ("precision", "Precision"),
            ("xps", "XPS"),
            ("gaming", "Gaming"),
        ],
    ),
    (
        "lenovo",
        &[
            ("legion", "Legion Gaming"),
            ("thinkpad", "ThinkPad"),
            ("thinkbook", "ThinkBook"),
            ("ideapad", "IdeaPad"),
            ("yoga", "Yoga"),
            ("gaming", "Gaming"),
        ],
    ),
    (
        "msi",
        &[
            ("modern", "Modern"),
            ("prestige", "Prestige"),
            ("sword", "Sword"),
            ("tiger", "Tiger"),
            ("raider", "Raider"),
            ("thunder", "Thunder"),
            ("gaming", "Gaming"),
        ],
    ),
    (
        "gigabyte",
        &[("aero", "Aero"), ("gaming", "Gaming")],
    ),
    ("razer", &[("blade", "Blade")]),
    ("samsung", &[("galaxy", "Galaxy"), ("notebook", "Notebook")]),
    ("lg", &[("gram", "Gram")]),
];

/// Rule theo tiền tố model → tên dòng (dùng khi `SystemFamily` không dùng được).
///
/// Tiền tố **dài được ưu tiên trước** (vd `AN7` trước `AN5`).
const MODEL_PREFIX_RULES: &[(&str, &[(&str, &str)])] = &[
    (
        "acer",
        &[
            ("ANV", "Nitro V"),
            ("AN7", "Nitro 7"),
            ("AN5", "Nitro 5"),
        ],
    ),
    (
        "asus",
        &[
            ("G15", "TUF Gaming"),
            ("G17", "TUF Gaming"),
            ("FX", "TUF Gaming"),
            ("FA", "TUF Gaming"),
        ],
    ),
];

/// Viết tắt giữ nguyên chữ hoa (không Title-case).
const KEEP_UPPERCASE: &[&str] = &["OMEN", "IDEAPAD", "ENVY", "VICTUS"];

// =================================================================
// Helpers chuẩn hoá
// =================================================================

/// Từ khoá "rỗng" cần loại bỏ khi so khớp hãng.
const BRAND_NOISE: &[&str] = &[
    "inc",
    "incorporated",
    "corp",
    "corporation",
    "co",
    "ltd",
    "limited",
    "company",
    "the",
    "computer",
    "computers",
    "systems",
    "system",
    "technology",
    "technologies",
    "electronics",
    "international",
    "pc",
    "r",
];

/// Tách chuỗi thành các "từ" alphanum (bỏ `. , - _ ( )`).
pub fn words_of(text: &str) -> Vec<String> {
    text.split(|c: char| !c.is_alphanumeric())
        .filter(|w| !w.is_empty())
        .map(|w| w.to_lowercase())
        .collect()
}

/// Kiểm tra `text` có chứa `word` như một từ độc lập.
fn contains_word(text: &str, word: &str) -> bool {
    words_of(text).iter().any(|w| w == word)
}

/// Chuẩn hoá chuỗi thô của OEM về dạng "sạch" (bỏ dấu chấm, ký hiệu doanh nghiệp).
fn clean_raw(raw: &str) -> String {
    let lowered = raw.to_lowercase();
    let replaced: String = lowered
        .chars()
        .map(|c| {
            if c == '.' || c == ',' || c == '-' || c == '_' || c == '(' || c == ')' {
                ' '
            } else {
                c
            }
        })
        .collect();
    replaced
        .split_whitespace()
        .filter(|w| !BRAND_NOISE.contains(w))
        .collect::<Vec<_>>()
        .join(" ")
}

/// Kiểm tra `token` có phải "mã model" không? (vd `AN515`, `A15`, `103C`, `9520`).
///
/// - Có phần gồm cả chữ + số → mã model (`AN515-51`, `A15`)
/// - Toàn số ≥ 3 chữ số → mã model (`9520`)
///
/// **Không** coi là mã model: token chỉ có số ngắn (`5`, `15`) — vì đó có thể là
/// tên dòng (vd "Nitro 5", "XPS 15").
fn is_model_code(token: &str) -> bool {
    let t = token.trim_matches(|c: char| !c.is_alphanumeric() && c != '-');
    if t.is_empty() {
        return false;
    }
    let parts: Vec<&str> = t.split('-').filter(|p| !p.is_empty()).collect();
    if parts.iter().any(|p| {
        p.chars().any(|c| c.is_ascii_alphabetic()) && p.chars().any(|c| c.is_ascii_digit())
    }) {
        return true;
    }
    // Toàn số ≥ 3 chữ số (vd "9520")
    t.chars().all(|c| c.is_ascii_digit()) && t.len() >= 3
}

/// Bỏ các mã model ở **cuối** danh sách token.
fn strip_trailing_codes(tokens: &mut Vec<String>) {
    while let Some(last) = tokens.last() {
        if is_model_code(last) {
            tokens.pop();
        } else {
            break;
        }
    }
}

/// Bỏ chữ hãng (và biến thể viết tắt) ra khỏi chuỗi.
fn strip_brand_words(text: &str, brand_words: &[String]) -> String {
    text.split_whitespace()
        .filter(|w| {
            let lw = w.to_lowercase();
            !brand_words.iter().any(|b| *b == lw)
        })
        .collect::<Vec<_>>()
        .join(" ")
}

/// Chuẩn hoá hãng → tên hiển thị (vd "ASUSTeK COMPUTER INC." → "ASUS").
fn normalize_brand(raw: &str) -> (String, String) {
    let cleaned = clean_raw(raw);
    let mut matched: Option<&str> = None;
    for (needle, canon) in BRAND_CANON {
        let hit = if needle.contains(' ') || needle.contains('-') {
            cleaned.contains(needle)
        } else {
            contains_word(&cleaned, needle)
        };
        if hit {
            matched = Some(canon);
            break;
        }
    }
    let brand = matched.map(|c| c.to_string()).unwrap_or_else(|| {
        // Hãng lạ → dùng chính tên đã làm sạch, viết hoa, tối đa 2 từ.
        cleaned
            .split_whitespace()
            .take(2)
            .map(|w| {
                let mut ch = w.chars();
                match ch.next() {
                    Some(f) => f.to_uppercase().collect::<String>() + ch.as_str(),
                    None => String::new(),
                }
            })
            .collect::<Vec<_>>()
            .join(" ")
    });

    let brand_key = slugify(&brand);
    (brand, brand_key)
}

/// Tạo slug an toàn cho tên folder: chỉ `a-z0-9-`.
pub fn slugify(text: &str) -> String {
    let mut out = String::new();
    let mut last_dash = true;
    for ch in text.chars() {
        if ch.is_ascii_alphanumeric() {
            out.push(ch.to_ascii_lowercase());
            last_dash = false;
        } else if !last_dash {
            out.push('-');
            last_dash = true;
        }
    }
    while out.ends_with('-') {
        out.pop();
    }
    out
}

/// Làm sạch tên để dùng làm tên folder trên Windows.
///
/// Bỏ ký tự cấm `<>:"/\|?*` và ký tự điều khiển.
pub fn sanitize_folder_name(name: &str) -> String {
    let mut out: String = name
        .chars()
        .map(|c| {
            if c.is_control() || matches!(c, '<' | '>' | ':' | '"' | '/' | '\\' | '|' | '?' | '*') {
                '-'
            } else {
                c
            }
        })
        .collect();
    out = out.trim().trim_matches('.').to_string();
    if out.is_empty() {
        out.push_str("Unknown");
    }
    // Windows giới hạn 255 ký tự cho tên folder.
    if out.chars().count() > 120 {
        out = out.chars().take(120).collect();
    }
    out
}

/// Title-case 1 token: `nitro` → `Nitro`, `LEGION` → `Legion`.
/// Giữ nguyên chữ hoa cho viết tắt trong `KEEP_UPPERCASE` và token ≤ 3 ký tự
/// (vd `TUF`, `ROG`, `XPS`).
fn title_case_token(tok: &str) -> String {
    let upper = tok.to_uppercase();
    if tok.len() <= 3 || KEEP_UPPERCASE.contains(&upper.as_str()) {
        return tok.to_string();
    }
    if tok.chars().all(|c| c.is_ascii_uppercase()) {
        let mut ch = tok.chars();
        let first = ch.next().unwrap_or(' ');
        return first.to_uppercase().collect::<String>() + &ch.as_str().to_lowercase();
    }
    tok.to_string()
}

// =================================================================
// Suy luận series
// =================================================================

/// Ứng viên series lấy từ `SystemFamily` hoặc tên model.
///
/// Bỏ chữ hãng, bỏ mã model ở cuối, rồi kiểm tra tính hợp lệ.
fn series_candidate(source: &str, brand_words: &[String]) -> Option<String> {
    let without_brand = strip_brand_words(source, brand_words);
    if without_brand.trim().is_empty() {
        return None;
    }
    let mut tokens: Vec<String> = without_brand
        .split_whitespace()
        .map(|t| t.trim_matches(|c: char| !c.is_alphanumeric() && c != '-').to_string())
        .filter(|t| !t.is_empty())
        .collect();
    strip_trailing_codes(&mut tokens);
    if tokens.is_empty() {
        return None;
    }
    let letters = tokens.iter().map(|t| t.chars().filter(|c| c.is_alphabetic()).count()).sum::<usize>();
    // Cần ≥ 2 chữ cái, ≤ 4 từ, và không được còn sót mã model.
    if letters < 2 || tokens.len() > 4 || tokens.iter().any(|t| is_model_code(t)) {
        return None;
    }
    let rendered = tokens
        .iter()
        .map(|t| title_case_token(t))
        .collect::<Vec<_>>()
        .join(" ");
    Some(rendered)
}

/// Series từ `SystemFamily` — nguồn đáng tin cậy nhất.
///
/// Ứng viên 1 từ và không có số → quá chung chung (vd "Gaming") → không dùng,
/// để rule theo model/keyword có cơ hội cho kết quả chính xác hơn.
fn series_from_family(family: &str, brand_words: &[String]) -> Option<String> {
    let cand = series_candidate(family, brand_words)?;
    let has_digit = cand.chars().any(|c| c.is_ascii_digit());
    let word_count = cand.split_whitespace().count();
    if word_count < 2 && !has_digit {
        return None;
    }
    Some(cand)
}

/// Series từ tiền tố model (vd Acer `AN515` → `Nitro 5`).
///
/// Mã model có thể nằm **giữa** tên (vd `Nitro AN515-51`) → ta quét mọi token
/// trong model, không chỉ token đầu.
fn series_from_model_prefix(brand_key: &str, model: &str) -> Option<String> {
    for (rule_brand, rules) in MODEL_PREFIX_RULES {
        if *rule_brand != brand_key {
            continue;
        }
        // Tiền tố dài được ưu tiên (vd "AN16" trước "AN5").
        let mut sorted: Vec<&(&str, &str)> = rules.iter().collect();
        sorted.sort_by_key(|(p, _)| std::cmp::Reverse(p.len()));
        for token in model.split_whitespace() {
            let token = token.trim_matches(|c: char| !c.is_alphanumeric() && c != '-');
            if token.is_empty() || !is_model_code(token) {
                continue;
            }
            let upper = token.to_ascii_uppercase();
            for (prefix, series) in &sorted {
                if upper.starts_with(prefix) {
                    return Some((*series).to_string());
                }
            }
        }
    }
    None
}

/// Series từ bảng keyword theo hãng.
fn series_from_keywords(brand_key: &str, haystack_lower: &str) -> Option<String> {
    for (rule_brand, rules) in SERIES_RULES {
        if *rule_brand != brand_key {
            continue;
        }
        for (keyword, series) in *rules {
            if haystack_lower.contains(keyword) {
                return Some((*series).to_string());
            }
        }
    }
    None
}

/// Suy luận tên dòng sản phẩm từ toàn bộ thông tin thô.
fn resolve_series(brand_key: &str, brand_words: &[String], model: &str, family: &str) -> String {
    // 1. Family — marketing name của OEM, ưu tiên cao nhất.
    if let Some(s) = series_from_family(family, brand_words) {
        return s;
    }
    // 2. Model — bỏ chữ hãng + mã model (vd "ASUS TUF Gaming A15 FA507NR" → "TUF Gaming").
    if let Some(s) = series_candidate(model, brand_words) {
        if s.split_whitespace().count() >= 2 {
            return s;
        }
    }
    // 3. Tiền tố model (vd Acer "AN515-51" → "Nitro 5").
    if let Some(s) = series_from_model_prefix(brand_key, model) {
        return s;
    }
    // 4. Keyword theo hãng — model trước, family sau.
    let model_lower = model.to_lowercase();
    let family_lower = family.to_lowercase();
    if let Some(s) = series_from_keywords(brand_key, &model_lower) {
        return s;
    }
    if let Some(s) = series_from_keywords(brand_key, &family_lower) {
        return s;
    }
    // 5. Fallback.
    "Khác".to_string()
}

// =================================================================
// API công khai
// =================================================================

/// Suy luận hồ sơ máy từ các giá trị thô.
pub fn resolve(
    manufacturer: &str,
    model: &str,
    family: &str,
    sku: &str,
) -> MachineProfile {
    let (brand, brand_key) = normalize_brand(manufacturer);

    // Danh sách từ cần bỏ khi suy luận series: tên hãng chuẩn hoá + biến thể raw.
    let mut brand_words: Vec<String> = brand
        .to_lowercase()
        .split_whitespace()
        .map(|s| s.to_string())
        .collect();
    for w in clean_raw(manufacturer).split_whitespace() {
        if !brand_words.iter().any(|b| b == w) {
            brand_words.push(w.to_string());
        }
    }
    // Với hãng viết tắt cũng bỏ dạng đầy đủ.
    match brand_key.as_str() {
        "hp" => {
            brand_words.push("hewlett".into());
            brand_words.push("packard".into());
        }
        "asus" => brand_words.push("asustek".into()),
        "msi" => {
            brand_words.push("micro".into());
            brand_words.push("star".into());
        }
        _ => {}
    }

    let series = resolve_series(&brand_key, &brand_words, model, family);
    let series_key = slugify(&series);

    MachineProfile {
        manufacturer: manufacturer.trim().to_string(),
        model: model.trim().to_string(),
        family: family.trim().to_string(),
        sku: sku.trim().to_string(),
        brand,
        series,
        brand_key,
        series_key,
    }
}

/// Đọc thông tin nhận diện máy từ registry.
pub fn detect() -> MachineProfile {
    let (manufacturer, model, family, sku) = read_bios_registry();
    resolve(&manufacturer, &model, &family, &sku)
}

/// Đọc `HKLM\HARDWARE\DESCRIPTION\System\BIOS`.
///
/// Key này được firmware ghi lúc boot → có sẵn ở mọi máy Windows, không cần admin.
fn read_bios_registry() -> (String, String, String, String) {
    let hklm = RegKey::predef(HKEY_LOCAL_MACHINE);
    let Ok(key) = hklm.open_subkey(r"HARDWARE\DESCRIPTION\System\BIOS") else {
        return (String::new(), String::new(), String::new(), String::new());
    };
    let read = |name: &str| -> String {
        key.get_value::<String, _>(name)
            .unwrap_or_default()
            .trim()
            .to_string()
    };
    (
        read("SystemManufacturer"),
        read("SystemProductName"),
        read("SystemFamily"),
        read("SystemSKU"),
    )
}

// =================================================================
// Test
// =================================================================

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn acer_nitro_51_duoc_nhan_dien_vao_dong_nitro_5() {
        let p = resolve("Acer", "Nitro AN515-51", "Acer Nitro 5", "AN515-51");
        assert_eq!(p.brand, "ACER");
        assert_eq!(p.series, "Nitro 5");
        assert_eq!(p.series_key, "nitro-5");
        assert_eq!(p.library_subdir(), "ACER/Nitro 5");
    }

    #[test]
    fn acer_nitro_family_khong_co_so_5_fallback_sang_model_prefix() {
        // Family chỉ nói "Acer Nitro" → quá chung chung → dùng prefix model AN5xx.
        let p = resolve("Acer", "Nitro AN517-51", "Acer Nitro", "AN517-51");
        assert_eq!(p.series, "Nitro 5");
    }

    #[test]
    fn asus_tuf_gaming_duoc_nhan_dien() {
        let p = resolve(
            "ASUSTeK COMPUTER INC.",
            "ASUS TUF Gaming A15 FA507NR",
            "ASUS TUF Gaming A15",
            "",
        );
        assert_eq!(p.brand, "ASUS");
        assert_eq!(p.series, "TUF Gaming");
    }

    #[test]
    fn hp_gaming_dung_va_omen_rieng_biet() {
        let hp_gaming = resolve("HP", "HP Gaming 17-da1xxx", "HP Gaming", "");
        assert_eq!(hp_gaming.brand, "HP");
        assert_eq!(hp_gaming.series, "Gaming");

        let omen = resolve("HP", "OMEN 16-bk0xxx", "103C", "");
        assert_eq!(omen.series, "OMEN Gaming");
    }

    #[test]
    fn lenovo_legion_dung_chu_hoa() {
        let p = resolve("LENOVO", "82B6", "LEGION 5 15", "");
        assert_eq!(p.brand, "LENOVO");
        assert_eq!(p.series, "Legion 5 15");
    }

    #[test]
    fn dell_xps_bo_ma_model() {
        let p = resolve("Dell Inc.", "XPS 15 9520", "XPS", "");
        assert_eq!(p.brand, "DELL");
        assert_eq!(p.series, "XPS 15");
    }

    #[test]
    fn brand_la_va_dung_thu_tu() {
        assert_eq!(normalize_brand("ASUSTeK COMPUTER INC.").0, "ASUS");
        assert_eq!(normalize_brand("Hewlett-Packard").0, "HP");
        assert_eq!(normalize_brand("Micro-Star International Co., Ltd.").0, "MSI");
        assert_eq!(normalize_brand("Dell Inc.").0, "DELL");
        assert_eq!(normalize_brand("LENOVO").0, "LENOVO");
        // Microsoft không được khớp "MSI".
        assert_eq!(normalize_brand("Microsoft Corporation").0, "MICROSOFT");
    }

    #[test]
    fn slug_va_sanitize_an_toan_cho_ten_folder() {
        assert_eq!(slugify("Nitro 5"), "nitro-5");
        assert_eq!(slugify("TUF Gaming"), "tuf-gaming");
        assert_eq!(sanitize_folder_name("A/B:C*D"), "A-B-C-D");
        assert_eq!(sanitize_folder_name("   "), "Unknown");
    }

    #[test]
    fn ma_model_duoc_nhan_dien() {
        assert!(is_model_code("AN515"));
        assert!(is_model_code("AN515-51"));
        assert!(is_model_code("A15"));
        assert!(is_model_code("9520"));
        // Số ngắn là tên dòng, không phải mã model.
        assert!(!is_model_code("5"));
        assert!(!is_model_code("15"));
        assert!(!is_model_code("Gaming"));
    }

    #[test]
    fn tieu_chuan_hoa_giu_viet_tat() {
        assert_eq!(title_case_token("TUF"), "TUF");
        assert_eq!(title_case_token("ROG"), "ROG");
        assert_eq!(title_case_token("OMEN"), "OMEN");
        assert_eq!(title_case_token("LEGION"), "Legion");
        assert_eq!(title_case_token("Nitro"), "Nitro");
    }
}
