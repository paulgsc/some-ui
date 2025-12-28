use leetype_wasm::{canonicalize, CanonicalUnit};

fn char_unit(c: char) -> CanonicalUnit {
    CanonicalUnit::Char { value: c }
}

fn sep_unit(s: &str) -> CanonicalUnit {
    CanonicalUnit::Separator { value: s.to_string() }
}

// ============================================================================
// BASIC FUNCTIONALITY TESTS
// ============================================================================

#[test]
fn test_simple_word() {
    assert_eq!(canonicalize("hello"), vec![char_unit('h'), char_unit('e'), char_unit('l'), char_unit('l'), char_unit('o')]);
}

#[test]
fn test_two_words_single_space() {
    assert_eq!(
        canonicalize("foo bar"),
        vec![
            char_unit('f'),
            char_unit('o'),
            char_unit('o'),
            sep_unit(" "),
            char_unit('b'),
            char_unit('a'),
            char_unit('r')
        ]
    );
}

#[test]
fn test_multiple_words() {
    let result = canonicalize("the quick fox");
    // Should have: t h e <sep> q u i c k <sep> f o x
    assert_eq!(result.len(), 13); // 11 chars + 2 separators
    assert!(result[3] == sep_unit(" "));
    assert!(result[9] == sep_unit(" "));
}

// ============================================================================
// WHITESPACE HANDLING TESTS
// ============================================================================

#[test]
fn test_multiple_spaces_preserved() {
    assert_eq!(
        canonicalize("foo   bar"),
        vec![
            char_unit('f'),
            char_unit('o'),
            char_unit('o'),
            sep_unit("   "),
            char_unit('b'),
            char_unit('a'),
            char_unit('r')
        ]
    );
}

#[test]
fn test_tabs_as_separator() {
    let result = canonicalize("foo\tbar");
    assert_eq!(result[3], sep_unit("\t"));
}

#[test]
fn test_newlines_as_separator() {
    let result = canonicalize("foo\nbar");
    assert_eq!(result[3], sep_unit("\n"));
}

#[test]
fn test_mixed_whitespace_preserved() {
    let result = canonicalize("foo \t\n bar");
    assert_eq!(result[3], sep_unit(" \t\n "));
}

#[test]
fn test_leading_whitespace_ignored() {
    assert_eq!(
        canonicalize("   hello"),
        vec![char_unit('h'), char_unit('e'), char_unit('l'), char_unit('l'), char_unit('o')]
    );
}

#[test]
fn test_trailing_whitespace_ignored() {
    assert_eq!(
        canonicalize("hello   "),
        vec![char_unit('h'), char_unit('e'), char_unit('l'), char_unit('l'), char_unit('o')]
    );
}

#[test]
fn test_only_whitespace() {
    assert_eq!(canonicalize("   \t\n  "), vec![]);
}

// ============================================================================
// SPECIAL CHARACTER TESTS
// ============================================================================

#[test]
fn test_punctuation() {
    let result = canonicalize("hello, world!");
    assert_eq!(result[5], char_unit(','));
    assert_eq!(result[12], char_unit('!'));
}

#[test]
fn test_symbols() {
    let result = canonicalize("foo@bar#baz");
    assert_eq!(result[3], char_unit('@'));
    assert_eq!(result[7], char_unit('#'));
}

#[test]
fn test_unicode_chars() {
    let result = canonicalize("hello 世界");
    assert_eq!(result[6], char_unit('世'));
    assert_eq!(result[7], char_unit('界'));
}

#[test]
fn test_emoji() {
    let result = canonicalize("hi 👋 bye");
    assert_eq!(result[3], char_unit('👋'));
}

// ============================================================================
// EDGE CASES
// ============================================================================

#[test]
fn test_empty_string() {
    assert_eq!(canonicalize(""), vec![]);
}

#[test]
fn test_single_char() {
    assert_eq!(canonicalize("a"), vec![char_unit('a')]);
}

// ============================================================================
// STRUCTURAL INVARIANTS
// ============================================================================

#[test]
fn test_structural_invariants() {
    let test_cases = vec![
        "",
        "a",
        "hello",
        "hello world",
        "   hello",
        "hello   ",
        "foo   bar",
        "foo\n\tbar",
        "a b c d",
        "hello 世界 👋",
    ];

    for input in test_cases {
        let units = canonicalize(input);

        // No leading separator
        if let Some(first) = units.first() {
            assert!(first.is_char(), "Leading separator in: {:?}", input);
        }

        // No trailing separator
        if let Some(last) = units.last() {
            assert!(last.is_char(), "Trailing separator in: {:?}", input);
        }

        // No consecutive separators
        for window in units.windows(2) {
            let both_sep = matches!(window[0], CanonicalUnit::Separator { .. }) && matches!(window[1], CanonicalUnit::Separator { .. });
            assert!(!both_sep, "Consecutive separators in: {:?}", input);
        }

        // All separators are non-empty whitespace
        for unit in &units {
            if let CanonicalUnit::Separator { value } = unit {
                assert!(!value.is_empty(), "Empty separator in: {:?}", input);
                assert!(value.chars().all(|c| c.is_whitespace()), "Non-whitespace in separator: {:?}", value);
            }
        }

        // Character order preserved
        let input_chars: Vec<char> = input.chars().filter(|c| !c.is_whitespace()).collect();
        let output_chars: Vec<char> = units.iter().filter_map(|u| u.char_value()).collect();
        assert_eq!(input_chars, output_chars, "Char order mismatch for: {:?}", input);
    }
}
