/// Get Korean character to QWERTY key mapping
/// Returns empty string for unmapped characters
pub fn hangul_to_qwerty(hangul: &str) -> String {
    match hangul {
        // Consonants
        "ㄱ" => "r",
        "ㄲ" => "R",
        "ㄴ" => "s",
        "ㄷ" => "e",
        "ㄸ" => "E",
        "ㄹ" => "f",
        "ㅁ" => "a",
        "ㅂ" => "q",
        "ㅃ" => "Q",
        "ㅅ" => "t",
        "ㅆ" => "T",
        "ㅇ" => "d",
        "ㅈ" => "w",
        "ㅉ" => "W",
        "ㅊ" => "c",
        "ㅋ" => "z",
        "ㅌ" => "x",
        "ㅍ" => "v",
        "ㅎ" => "g",
        // Vowels (Simple)
        "ㅏ" => "k",
        "ㅐ" => "o",
        "ㅑ" => "i",
        "ㅒ" => "O",
        "ㅓ" => "j",
        "ㅔ" => "p",
        "ㅕ" => "u",
        "ㅖ" => "P",
        "ㅗ" => "h",
        "ㅛ" => "y",
        "ㅜ" => "n",
        "ㅠ" => "b",
        "ㅡ" => "m",
        "ㅣ" => "l",
        // Vowels (Composite) - these are the ambiguous cases
        "ㅘ" => "hk",
        "ㅙ" => "ho",
        "ㅚ" => "hl",
        "ㅝ" => "nj",
        "ㅞ" => "np",
        "ㅟ" => "nl",
        "ㅢ" => "ml",
        _ => "",
    }
    .to_string()
}
