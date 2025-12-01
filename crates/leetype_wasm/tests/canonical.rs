use leetype_wasm::{canonicalize, CanonicalUnit};

fn is_char(u: &CanonicalUnit) -> bool {
    matches!(u, CanonicalUnit::Char { .. })
}

fn is_separator(u: &CanonicalUnit) -> bool {
    matches!(u, CanonicalUnit::Separator { .. })
}

#[test]
fn test_canonicalize_basic_text() {
    let units = canonicalize("hello");

    assert_eq!(
        units,
        vec![
            CanonicalUnit::Char { value: 'h' },
            CanonicalUnit::Char { value: 'e' },
            CanonicalUnit::Char { value: 'l' },
            CanonicalUnit::Char { value: 'l' },
            CanonicalUnit::Char { value: 'o' },
        ]
    );
}

#[test]
fn test_canonicalize_with_spaces() {
    let units = canonicalize("foo bar");

    assert_eq!(
        units,
        vec![
            CanonicalUnit::Char { value: 'f' },
            CanonicalUnit::Char { value: 'o' },
            CanonicalUnit::Char { value: 'o' },
            CanonicalUnit::Separator { value: " ".into() },
            CanonicalUnit::Char { value: 'b' },
            CanonicalUnit::Char { value: 'a' },
            CanonicalUnit::Char { value: 'r' },
        ]
    );
}

#[test]
fn test_canonicalize_multiple_spaces() {
    let units = canonicalize("foo   bar");

    assert_eq!(
        units,
        vec![
            CanonicalUnit::Char { value: 'f' },
            CanonicalUnit::Char { value: 'o' },
            CanonicalUnit::Char { value: 'o' },
            CanonicalUnit::Separator { value: "   ".into() },
            CanonicalUnit::Char { value: 'b' },
            CanonicalUnit::Char { value: 'a' },
            CanonicalUnit::Char { value: 'r' },
        ]
    );
}

#[test]
fn test_canonicalize_trailing_spaces() {
    let units = canonicalize("hello   ");

    assert_eq!(
        units,
        vec![
            CanonicalUnit::Char { value: 'h' },
            CanonicalUnit::Char { value: 'e' },
            CanonicalUnit::Char { value: 'l' },
            CanonicalUnit::Char { value: 'l' },
            CanonicalUnit::Char { value: 'o' },
        ]
    );
}

#[test]
fn test_canonicalize_leading_spaces() {
    let units = canonicalize("   hello");

    // Leading whitespace is ignored (no trailing content)
    assert_eq!(
        units,
        vec![
            CanonicalUnit::Char { value: 'h' },
            CanonicalUnit::Char { value: 'e' },
            CanonicalUnit::Char { value: 'l' },
            CanonicalUnit::Char { value: 'l' },
            CanonicalUnit::Char { value: 'o' },
        ]
    );
}

#[test]
fn test_canonicalize_newlines() {
    let units = canonicalize("foo\nbar");

    assert_eq!(units[3], CanonicalUnit::Separator { value: "\n".into() });
}

#[test]
fn test_canonicalize_tabs() {
    let units = canonicalize("foo\tbar");

    assert_eq!(units[3], CanonicalUnit::Separator { value: "\t".into() });
}

#[test]
fn test_canonicalize_mixed_whitespace() {
    let units = canonicalize("foo \t\n bar");

    assert_eq!(units[3], CanonicalUnit::Separator { value: " \t\n ".into() });
}

#[test]
fn test_canonicalize_special_characters() {
    let units = canonicalize("foo@#$%bar");

    assert_eq!(units[3], CanonicalUnit::Char { value: '@' });
    assert_eq!(units[4], CanonicalUnit::Char { value: '#' });
    assert_eq!(units[5], CanonicalUnit::Char { value: '$' });
    assert_eq!(units[6], CanonicalUnit::Char { value: '%' });
}

#[test]
fn test_canonicalize_unicode() {
    let units = canonicalize("hello 世界");

    assert_eq!(units[6], CanonicalUnit::Char { value: '世' });
    assert_eq!(units[7], CanonicalUnit::Char { value: '界' });
}

#[test]
fn test_canonicalize_emoji() {
    let units = canonicalize("hi 👋 bye");

    assert!(units.iter().any(|u| matches!(u, CanonicalUnit::Char { value: '👋' })));
}

#[test]
fn test_canonicalize_empty_string() {
    let units = canonicalize("");

    assert!(units.is_empty());
}

#[test]
fn test_canonicalize_only_spaces() {
    let units = canonicalize("   ");

    assert!(units.is_empty());
}

#[test]
fn canonicalize_structural_invariants_hold() {
    let inputs = [
        "",
        "hello",
        "   hello",
        "hello   ",
        "hello world",
        "foo   bar",
        " foo \t\n bar ",
        "\n\thello\t\n",
        "👋 hello 🌍",
        "a b  c   d",
    ];

    for input in inputs {
        let units = canonicalize(input);

        // 1️⃣ No leading separator
        if let Some(first) = units.first() {
            assert!(is_char(first), "leading separator found for input: {:?}, units: {:?}", input, units);
        }

        // 2️⃣ No trailing separator
        if let Some(last) = units.last() {
            assert!(is_char(last), "trailing separator found for input: {:?}, units: {:?}", input, units);
        }

        // 3️⃣ Separators are always between characters
        for window in units.windows(3) {
            if is_separator(&window[1]) {
                assert!(
                    is_char(&window[0]) && is_char(&window[2]),
                    "separator not between chars for input: {:?}, window: {:?}",
                    input,
                    window
                );
            }
        }

        // 4️⃣ Every separator is non-empty whitespace
        for u in &units {
            if let CanonicalUnit::Separator { value } = u {
                assert!(!value.is_empty(), "empty separator for input: {:?}", input);
                assert!(
                    value.chars().all(|c| c.is_whitespace()),
                    "separator contains non-whitespace for input: {:?}, value: {:?}",
                    input,
                    value
                );
            }
        }

        // 5️⃣ All non-whitespace chars preserved in order
        let input_chars: Vec<char> = input.chars().filter(|c| !c.is_whitespace()).collect();
        let output_chars: Vec<char> = units
            .iter()
            .filter_map(|u| if let CanonicalUnit::Char { value } = u { Some(*value) } else { None })
            .collect();

        assert_eq!(input_chars, output_chars, "character stream mismatch for input: {:?}", input);
    }
}
