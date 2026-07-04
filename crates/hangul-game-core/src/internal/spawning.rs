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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn maps_every_consonant_and_vowel_to_its_qwerty_key() {
        let cases = [
            ("ㄱ", "r"),
            ("ㄲ", "R"),
            ("ㄴ", "s"),
            ("ㄷ", "e"),
            ("ㄸ", "E"),
            ("ㄹ", "f"),
            ("ㅁ", "a"),
            ("ㅂ", "q"),
            ("ㅃ", "Q"),
            ("ㅅ", "t"),
            ("ㅆ", "T"),
            ("ㅇ", "d"),
            ("ㅈ", "w"),
            ("ㅉ", "W"),
            ("ㅊ", "c"),
            ("ㅋ", "z"),
            ("ㅌ", "x"),
            ("ㅍ", "v"),
            ("ㅎ", "g"),
            ("ㅏ", "k"),
            ("ㅐ", "o"),
            ("ㅑ", "i"),
            ("ㅒ", "O"),
            ("ㅓ", "j"),
            ("ㅔ", "p"),
            ("ㅕ", "u"),
            ("ㅖ", "P"),
            ("ㅗ", "h"),
            ("ㅛ", "y"),
            ("ㅜ", "n"),
            ("ㅠ", "b"),
            ("ㅡ", "m"),
            ("ㅣ", "l"),
            ("ㅘ", "hk"),
            ("ㅙ", "ho"),
            ("ㅚ", "hl"),
            ("ㅝ", "nj"),
            ("ㅞ", "np"),
            ("ㅟ", "nl"),
            ("ㅢ", "ml"),
        ];

        // 40 jamo total - matches the completion-mode character pool in game_modes.rs.
        assert_eq!(cases.len(), 40);

        for (hangul, expected) in cases {
            assert_eq!(hangul_to_qwerty(hangul), expected, "mismatch for {hangul}");
        }
    }

    #[test]
    fn returns_empty_string_for_unmapped_input() {
        assert_eq!(hangul_to_qwerty("x"), "");
        assert_eq!(hangul_to_qwerty(""), "");
        assert_eq!(hangul_to_qwerty("random"), "");
    }
}
