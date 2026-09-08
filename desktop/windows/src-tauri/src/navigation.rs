use url::Url;

pub const APP_ORIGIN: &str = "https://chevoink.chevolink.com";

pub fn is_app_url(url: &Url) -> bool {
    url.origin().ascii_serialization() == APP_ORIGIN
        && url.username().is_empty()
        && url.password().is_none()
}

pub fn is_external_url(url: &Url) -> bool {
    url.scheme() == "https"
        && url.host_str().is_some()
        && url.username().is_empty()
        && url.password().is_none()
}

pub fn is_download_url(url: &Url) -> bool {
    is_app_url(url)
        || (url.scheme() == "blob" && Url::parse(url.path()).is_ok_and(|inner| is_app_url(&inner)))
}

pub fn safe_filename(name: &str) -> String {
    let clean: String = name
        .chars()
        .filter(|c| !c.is_control() && !"<>:\"/\\|?*".contains(*c))
        .take(160)
        .collect();
    let clean = clean.trim().trim_end_matches(['.', ' ']);
    let stem = clean.split('.').next().unwrap_or("").to_ascii_uppercase();
    let reserved = matches!(stem.as_str(), "CON" | "PRN" | "AUX" | "NUL")
        || (stem.len() == 4
            && (stem.starts_with("COM") || stem.starts_with("LPT"))
            && matches!(stem.as_bytes()[3], b'1'..=b'9'));
    if clean.is_empty() || reserved {
        "Chevoink-export.txt".into()
    } else {
        clean.into()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn origin_is_exact_and_never_a_prefix() {
        assert!(is_app_url(
            &Url::parse(&format!("{APP_ORIGIN}/studio?x=1")).unwrap()
        ));
        for value in [
            "https://chevoink.chevolink.com.evil.test",
            "http://chevoink.chevolink.com",
            "https://chevoink.chevolink.com:444",
            "https://user@chevoink.chevolink.com",
            "file:///C:/test",
            "javascript:alert(1)",
        ] {
            assert!(!is_app_url(&Url::parse(value).unwrap()), "{value}");
        }
    }
    #[test]
    fn blob_download_is_bound_to_app_origin() {
        assert!(is_download_url(
            &Url::parse("blob:https://chevoink.chevolink.com/123").unwrap()
        ));
        assert!(!is_download_url(
            &Url::parse("blob:https://evil.test/123").unwrap()
        ));
    }
    #[test]
    fn filenames_cannot_escape_or_use_devices() {
        assert_eq!(safe_filename("CON.txt"), "Chevoink-export.txt");
        assert_eq!(safe_filename("LPT1"), "Chevoink-export.txt");
        assert_eq!(safe_filename("第25章.txt"), "第25章.txt");
        assert!(!safe_filename("../../evil.exe").contains('/'));
        assert_eq!(safe_filename("  ... "), "Chevoink-export.txt");
    }
}
