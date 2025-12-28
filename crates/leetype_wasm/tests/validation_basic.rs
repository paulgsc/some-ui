use leetype_wasm::TypingGameCore;

#[test]
fn test_typing_correct_sequence() {
    let mut game = TypingGameCore::new("hello", Some(3));
    game.start(1000.0);

    let r = game.handle_input("h");
    assert_eq!(r.consecutive_errors, 0);
    assert_eq!(r.total_errors, 0);

    let r = game.handle_input("he");
    assert_eq!(r.consecutive_errors, 0);
    assert_eq!(r.total_errors, 0);

    let r = game.handle_input("hel");
    assert_eq!(r.consecutive_errors, 0);
    assert_eq!(r.total_errors, 0);

    let r = game.handle_input("hell");
    assert_eq!(r.consecutive_errors, 0);
    assert_eq!(r.total_errors, 0);

    let r = game.handle_input("hello");
    assert_eq!(r.consecutive_errors, 0);
    assert_eq!(r.total_errors, 0);

    let stats = game.get_stats(2000.0);
    assert!(stats.is_complete);
}

#[test]
fn test_single_error_then_backspace_then_correct() {
    let mut game = TypingGameCore::new("hello", Some(3));
    game.start(1000.0);

    // Type "hel" correctly
    game.handle_input("hel");

    // Make an error
    let r = game.handle_input("helx");
    assert_eq!(r.consecutive_errors, 1);
    assert_eq!(r.total_errors, 1);

    // Backspace
    let r = game.handle_input("hel");
    assert_eq!(r.consecutive_errors, 0);

    // Continue correctly
    let r = game.handle_input("hell");
    assert_eq!(r.consecutive_errors, 0);
    assert_eq!(r.total_errors, 1); // Total errors don't decrease
}

#[test]
fn test_multiple_words_with_spaces() {
    let mut game = TypingGameCore::new("foo bar", Some(3));
    game.start(1000.0);

    let r = game.handle_input("foo");
    assert_eq!(r.consecutive_errors, 0);

    let r = game.handle_input("foo ");
    assert_eq!(r.consecutive_errors, 0);

    let r = game.handle_input("foo b");
    assert_eq!(r.consecutive_errors, 0);

    let r = game.handle_input("foo ba");
    assert_eq!(r.consecutive_errors, 0);

    let r = game.handle_input("foo bar");
    assert_eq!(r.consecutive_errors, 0);

    let stats = game.get_stats(2000.0);
    assert!(stats.is_complete);
}

// ============================================================================
// CONSECUTIVE ERROR TRACKING
// ============================================================================

#[test]
fn test_single_wrong_character() {
    let mut game = TypingGameCore::new("hello", Some(3));
    game.start(1000.0);

    game.handle_input("he");

    // Type 'x' instead of 'l'
    let r = game.handle_input("hex");
    assert_eq!(r.consecutive_errors, 1);
    assert_eq!(r.total_errors, 1);
    assert!(!r.show_error_alert);
}

#[test]
fn test_consecutive_errors_accumulate() {
    let mut game = TypingGameCore::new("abcdef", Some(5));
    game.start(1000.0);

    // Type "a" correctly
    game.handle_input("a");

    // Now type wrong chars - each should increment consecutive errors
    let r = game.handle_input("ax");
    assert_eq!(r.consecutive_errors, 1, "First error");

    let r = game.handle_input("axy");
    assert_eq!(r.consecutive_errors, 2, "Second error");

    let r = game.handle_input("axyz");
    assert_eq!(r.consecutive_errors, 3, "Third error");

    assert_eq!(r.total_errors, 3);
}

#[test]
fn test_error_after_correct_chars() {
    let mut game = TypingGameCore::new("hello world", Some(3));
    game.start(1000.0);

    // Type correctly up to "hello w"
    game.handle_input("hello w");
    assert_eq!(game.handle_input("hello w").consecutive_errors, 0);

    // Make an error
    let r = game.handle_input("hello wx");
    assert_eq!(r.consecutive_errors, 1);
}

// ============================================================================
// BACKSPACE BEHAVIOR
// ============================================================================

#[test]
fn test_backspace_reduces_consecutive_errors() {
    let mut game = TypingGameCore::new("hello", Some(5));
    game.start(1000.0);

    // Create errors
    game.handle_input("h");
    game.handle_input("hx");
    game.handle_input("hxy");
    let r = game.handle_input("hxyz");
    assert_eq!(r.consecutive_errors, 3);

    // Backspace once
    let r = game.handle_input("hxy");
    assert_eq!(r.consecutive_errors, 2);

    // Backspace again
    let r = game.handle_input("hx");
    assert_eq!(r.consecutive_errors, 1);

    // Backspace to last correct position
    let r = game.handle_input("h");
    assert_eq!(r.consecutive_errors, 0);
}

#[test]
fn test_backspace_multiple_at_once() {
    let mut game = TypingGameCore::new("hello", Some(10));
    game.start(1000.0);

    // Create 5 errors
    game.handle_input("h");
    game.handle_input("hx");
    game.handle_input("hxy");
    game.handle_input("hxyz");
    game.handle_input("hxyzw");
    let r = game.handle_input("hxyzwq");
    assert_eq!(r.consecutive_errors, 5);

    // Delete 3 characters at once
    let r = game.handle_input("hxy");
    assert_eq!(r.consecutive_errors, 2);
}

#[test]
fn test_backspace_cannot_go_negative() {
    let mut game = TypingGameCore::new("hello", Some(3));
    game.start(1000.0);

    // Type correctly then make one error
    game.handle_input("he");
    game.handle_input("hex");

    // Backspace past the error
    let r = game.handle_input("h");
    assert_eq!(r.consecutive_errors, 0);
}

// ============================================================================
// MAX ERROR BLOCKING
// ============================================================================

#[test]
fn test_max_errors_blocks_input() {
    let mut game = TypingGameCore::new("hello", Some(3));
    game.start(1000.0);

    // Make 3 errors
    game.handle_input("x");
    game.handle_input("xy");
    let r = game.handle_input("xyz");
    assert_eq!(r.consecutive_errors, 3);
    assert!(r.show_error_alert);

    // Try to type more - should be blocked
    let r = game.handle_input("xyzw");
    assert!(!r.accepted);
    assert!(r.show_error_alert);

    // Verify input didn't change
    assert_eq!(game.get_user_input(), "xyz");
}

#[test]
fn test_can_continue_after_backspacing_below_limit() {
    let mut game = TypingGameCore::new("hello", Some(3));
    game.start(1000.0);

    // Hit the limit
    game.handle_input("x");
    game.handle_input("xy");
    game.handle_input("xyz");

    // Blocked
    let r = game.handle_input("xyzw");
    assert!(!r.accepted);

    // Backspace one char
    let r = game.handle_input("xy");
    assert_eq!(r.consecutive_errors, 2);
    assert!(r.accepted);

    // Can now type again (will create another error, but accepted)
    let r = game.handle_input("xyz");
    assert_eq!(r.consecutive_errors, 3);
    assert!(r.accepted);
}

#[test]
fn test_different_max_error_limits() {
    // Limit of 1
    let mut game1 = TypingGameCore::new("abc", Some(1));
    game1.start(1000.0);
    game1.handle_input("x");
    let r = game1.handle_input("xy");
    assert!(!r.accepted);

    // Limit of 5
    let mut game5 = TypingGameCore::new("abcdef", Some(5));
    game5.start(1000.0);
    for i in 1..=5 {
        let input = "x".repeat(i);
        game5.handle_input(&input);
    }
    let r = game5.handle_input("xxxxxx");
    assert!(!r.accepted);
}
