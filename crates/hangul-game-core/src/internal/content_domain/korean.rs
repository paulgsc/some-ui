use super::ContentDomain;

/// All Korean jamo the engine knows how to spawn and match. This is the single pool backing both
/// `CompletionMode`'s mastery set and `EndlessMode`'s random draws (Cor. 2.2.1 in the progression
/// canon).
const ALL_JAMO: &[&str] = &[
    "ㄱ", "ㄲ", "ㄴ", "ㄷ", "ㄸ", "ㄹ", "ㅁ", "ㅂ", "ㅃ", "ㅅ", "ㅆ", "ㅇ", "ㅈ", "ㅉ", "ㅊ", "ㅋ", "ㅌ", "ㅍ", "ㅎ", "ㅏ", "ㅐ", "ㅑ", "ㅒ", "ㅓ", "ㅔ", "ㅕ", "ㅖ", "ㅗ",
    "ㅘ", "ㅙ", "ㅚ", "ㅛ", "ㅜ", "ㅝ", "ㅞ", "ㅟ", "ㅠ", "ㅡ", "ㅢ", "ㅣ",
];

/// The engine's sole production-wired `ContentDomain` (canon Def. 11.1): Korean jamo, QWERTY keys,
/// and the 40-entry completion alphabet that `hangul_to_qwerty` and `create_game_mode`'s literal
/// list used to close over directly, before this trait existed.
pub struct Korean;

impl ContentDomain for Korean {
    fn key_for(token: &str) -> String {
        match token {
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

    fn completion_alphabet() -> Vec<String> {
        ALL_JAMO.iter().copied().map(String::from).collect()
    }
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

        // 40 jamo total - matches the completion-mode character pool.
        assert_eq!(cases.len(), 40);

        for (hangul, expected) in cases {
            assert_eq!(Korean::key_for(hangul), expected, "mismatch for {hangul}");
        }
    }

    #[test]
    fn returns_empty_string_for_unmapped_input() {
        assert_eq!(Korean::key_for("x"), "");
        assert_eq!(Korean::key_for(""), "");
        assert_eq!(Korean::key_for("random"), "");
    }

    #[test]
    fn completion_alphabet_is_the_forty_entry_jamo_pool_with_no_duplicates() {
        let alphabet = Korean::completion_alphabet();
        assert_eq!(alphabet.len(), 40);

        let unique: std::collections::HashSet<_> = alphabet.iter().collect();
        assert_eq!(unique.len(), 40);
    }
}
