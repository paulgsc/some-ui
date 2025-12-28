use leetype_wasm::TypingGameCore;

#[test]
fn test_extra_spaces_normalized() {
    let mut game = TypingGameCore::new("foo bar", Some(3));
    game.start(1000.0);

    // Multiple spaces should match single space separator
    let r = game.handle_input("foo     bar");
    assert_eq!(r.consecutive_errors, 0);

    let stats = game.get_stats(2000.0);
    assert!(stats.is_complete);
}

#[test]
fn test_tabs_and_newlines_work() {
    let mut game = TypingGameCore::new("foo bar", Some(3));
    game.start(1000.0);

    // Tab should work as separator
    let r = game.handle_input("foo\tbar");
    assert_eq!(r.consecutive_errors, 0);

    let stats = game.get_stats(2000.0);
    assert!(stats.is_complete);
}

#[test]
fn test_trailing_whitespace_ignored() {
    let mut game = TypingGameCore::new("hello", Some(3));
    game.start(1000.0);

    let r = game.handle_input("hello     ");
    assert_eq!(r.consecutive_errors, 0);

    let stats = game.get_stats(2000.0);
    assert!(stats.is_complete);
}

#[test]
fn test_leading_whitespace_ignored() {
    let mut game = TypingGameCore::new("hello", Some(3));
    game.start(1000.0);

    let r = game.handle_input("   hello");
    assert_eq!(r.consecutive_errors, 0);
}

#[test]
fn test_missing_space_is_error() {
    let mut game = TypingGameCore::new("hello world", Some(10));
    game.start(1000.0);

    // Type without space
    let r = game.handle_input("hellow");

    // 'w' should be a space, so this is an error
    assert!(r.consecutive_errors > 0);
}

// ============================================================================
// SPECIAL SCENARIOS
// ============================================================================

#[test]
fn test_correct_char_after_backspace_resets_errors() {
    let mut game = TypingGameCore::new("hello", Some(3));
    game.start(1000.0);

    // Make errors
    game.handle_input("h");
    game.handle_input("hx");
    game.handle_input("hxy");

    // Backspace to correct position
    game.handle_input("h");

    // Type correctly
    let r = game.handle_input("he");
    assert_eq!(r.consecutive_errors, 0);
}

#[test]
fn test_wrong_then_wrong_accumulates() {
    let mut game = TypingGameCore::new("abcd", Some(10));
    game.start(1000.0);

    // First wrong
    game.handle_input("x");

    // Second wrong (not 'b')
    let r = game.handle_input("xy");
    assert_eq!(r.consecutive_errors, 2);

    // Third wrong (not 'c')
    let r = game.handle_input("xyz");
    assert_eq!(r.consecutive_errors, 3);
}

#[test]
fn test_correct_sequence_after_correct_beginning() {
    let mut game = TypingGameCore::new("the quick brown", Some(3));
    game.start(1000.0);

    // Type first word correctly
    game.handle_input("the");

    // Add space
    game.handle_input("the ");

    // Continue with second word
    let r = game.handle_input("the q");
    assert_eq!(r.consecutive_errors, 0);

    let r = game.handle_input("the qu");
    assert_eq!(r.consecutive_errors, 0);
}

// ============================================================================
// REALISTIC TYPING SCENARIOS
// ============================================================================

#[test]
fn test_realistic_typo_and_correction() {
    let mut game = TypingGameCore::new("function main", Some(3));
    game.start(1000.0);

    // Type "func" correctly
    let r = game.handle_input("func");
    assert_eq!(r.consecutive_errors, 0);

    // Typo: "functi" -> "functi"
    let r = game.handle_input("functi");
    assert_eq!(r.consecutive_errors, 0);

    // Continue: "functio" - all still correct
    let r = game.handle_input("functio");
    assert_eq!(r.consecutive_errors, 0);

    // Type "functiom" (wrong 'm' instead of 'n')
    let r = game.handle_input("functiom");
    assert_eq!(r.consecutive_errors, 1);

    // Backspace
    game.handle_input("functio");

    // Fix it
    let r = game.handle_input("function");
    assert_eq!(r.consecutive_errors, 0);
}

#[test]
fn test_rapid_error_accumulation() {
    let mut game = TypingGameCore::new("hello", Some(10));
    game.start(1000.0);

    // Just start typing wrong from the beginning
    let r = game.handle_input("x");
    assert_eq!(r.consecutive_errors, 1);

    let r = game.handle_input("xy");
    assert_eq!(r.consecutive_errors, 2);

    let r = game.handle_input("xyz");
    assert_eq!(r.consecutive_errors, 3);

    let r = game.handle_input("xyzw");
    assert_eq!(r.consecutive_errors, 4);

    let r = game.handle_input("xyzwq");
    assert_eq!(r.consecutive_errors, 5);
}

#[test]
fn test_completion_detection() {
    let mut game = TypingGameCore::new("done", Some(3));
    game.start(1000.0);

    let stats1 = game.get_stats(1500.0);
    assert!(!stats1.is_complete);

    game.handle_input("don");
    let stats2 = game.get_stats(1600.0);
    assert!(!stats2.is_complete);

    game.handle_input("done");
    let stats3 = game.get_stats(1700.0);
    assert!(stats3.is_complete);
}

// ============================================================================
// EDGE CASES
// ============================================================================

#[test]
fn test_empty_input() {
    let mut game = TypingGameCore::new("hello", Some(3));
    game.start(1000.0);

    let r = game.handle_input("");
    assert_eq!(r.consecutive_errors, 0);
    assert_eq!(r.total_errors, 0);
}

#[test]
fn test_exceeding_target_length() {
    let mut game = TypingGameCore::new("hi", Some(5));
    game.start(1000.0);

    // Type correctly
    game.handle_input("hi");

    // Try to type more
    let r = game.handle_input("hix");
    assert_eq!(r.consecutive_errors, 1);
    assert_eq!(r.total_errors, 1);
}

#[test]
fn test_unicode_characters() {
    let mut game = TypingGameCore::new("hello 世界", Some(3));
    game.start(1000.0);

    let r = game.handle_input("hello 世界");
    assert_eq!(r.consecutive_errors, 0);

    let stats = game.get_stats(2000.0);
    assert!(stats.is_complete);
}

#[test]
fn test_special_characters() {
    let mut game = TypingGameCore::new("foo@bar.com", Some(3));
    game.start(1000.0);

    let r = game.handle_input("foo@bar.com");
    assert_eq!(r.consecutive_errors, 0);

    let stats = game.get_stats(2000.0);
    assert!(stats.is_complete);
}
