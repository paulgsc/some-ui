use leetype_wasm::TypingGameCore;

#[test]
fn test_consecutive_errors_increment_on_each_wrong_char() {
    let mut game = TypingGameCore::new("abcdefgh", Some(5));
    game.start(1000.0);

    // Type correct "a"
    let result = game.handle_input("a");
    assert_eq!(result.consecutive_errors, 0);

    // First wrong character
    let result = game.handle_input("ax");
    assert_eq!(result.consecutive_errors, 1, "First wrong char should increment to 1");

    // Second wrong character
    let result = game.handle_input("axc");
    assert_eq!(result.consecutive_errors, 2, "Second wrong char should increment to 2");

    // Third wrong character
    let result = game.handle_input("axcd");
    assert_eq!(result.consecutive_errors, 3, "Third wrong char should increment to 3");

    // Fourth wrong character
    let result = game.handle_input("axcde");
    assert_eq!(result.consecutive_errors, 4, "Fourth wrong char should increment to 4");
}

#[test]
fn test_all_chars_after_first_error_are_errors() {
    let mut game = TypingGameCore::new("hello", Some(1));
    game.start(1000.0);

    // Type "he" correctly
    game.handle_input("he");

    // Type wrong character 'x' (should be 'l')
    let result = game.handle_input("hex");
    assert_eq!(result.consecutive_errors, 1);

    // Every subsequent character is also wrong, should keep incrementing
    let result = game.handle_input("hexa");
    assert_eq!(result.consecutive_errors, 2);

    let result = game.handle_input("hexab");
    assert_eq!(result.consecutive_errors, 3);

    let result = game.handle_input("hexabc");
    assert_eq!(result.consecutive_errors, 4);

    let result = game.handle_input("hexabcd");
    assert_eq!(result.consecutive_errors, 5);
}

#[test]
fn test_max_errors_blocks_further_input() {
    let mut game = TypingGameCore::new("abc", Some(3));
    game.start(1000.0);

    // Type correct "a"
    let result = game.handle_input("a");
    assert_eq!(result.accepted, true);
    assert_eq!(result.consecutive_errors, 0);

    // Type "x" (error 1 - should be 'b')
    let result = game.handle_input("ax");
    assert_eq!(result.accepted, true);
    assert_eq!(result.consecutive_errors, 1);
    assert_eq!(result.show_error_alert, false);

    // Type "y" (error 2 - should be 'b')
    let result = game.handle_input("axy");
    assert_eq!(result.accepted, true);
    assert_eq!(result.consecutive_errors, 2);
    assert_eq!(result.show_error_alert, false);

    // Type "z" (error 3 - at limit)
    let result = game.handle_input("axyz");
    assert_eq!(result.accepted, true);
    assert_eq!(result.consecutive_errors, 3);
    assert_eq!(result.show_error_alert, true);

    // Try to type "w" (should be BLOCKED)
    let result = game.handle_input("axyzw");
    assert_eq!(result.accepted, false);
    assert_eq!(result.consecutive_errors, 4);
    assert_eq!(result.show_error_alert, true);

    // Verify input wasn't changed
    assert_eq!(game.get_user_input(), "axyz");
}

#[test]
fn test_backspace_decrements_consecutive_errors() {
    let mut game = TypingGameCore::new("foo bar", Some(5));
    game.start(1000.0);

    // Type correctly then make 3 errors
    game.handle_input("foo b");
    game.handle_input("foo bx"); // error 1
    game.handle_input("foo bxy"); // error 2
    let result = game.handle_input("foo bxyz"); // error 3
    assert_eq!(result.consecutive_errors, 3);

    // Backspace once - should decrement by 1
    let result = game.handle_input("foo bxy");
    assert_eq!(result.consecutive_errors, 2, "Single backspace should decrement by 1");

    // Backspace again - should decrement by 1 more
    let result = game.handle_input("foo bx");
    assert_eq!(result.consecutive_errors, 1, "Second backspace should decrement by 1 more");

    // Backspace again - should reach 0
    let result = game.handle_input("foo b");
    assert_eq!(result.consecutive_errors, 0, "Third backspace should reach 0");
    assert_eq!(result.show_error_alert, false);
}

#[test]
fn test_backspace_multiple_chars_at_once() {
    let mut game = TypingGameCore::new("hello", Some(10));
    game.start(1000.0);

    // Type correct then make 5 errors
    game.handle_input("h");
    game.handle_input("hx"); // error 1
    game.handle_input("hxy"); // error 2
    game.handle_input("hxyz"); // error 3
    game.handle_input("hxyzw"); // error 4
    let result = game.handle_input("hxyzwq"); // error 5
    assert_eq!(result.consecutive_errors, 5);

    // Delete 3 characters at once (e.g., select and delete)
    let result = game.handle_input("hxy");
    assert_eq!(result.consecutive_errors, 2, "Deleting 3 chars should decrement by 3");
}

#[test]
fn test_backspace_cannot_go_negative() {
    let mut game = TypingGameCore::new("hello", Some(5));
    game.start(1000.0);

    // Type 2 correct chars, 1 error
    game.handle_input("he");
    let result = game.handle_input("hex"); // error 1
    assert_eq!(result.consecutive_errors, 1);

    // Backspace to delete the error and one correct char
    let result = game.handle_input("h");
    assert_eq!(result.consecutive_errors, 0, "Should not go negative");
}

#[test]
fn test_excess_whitespace_is_ignored() {
    let mut game = TypingGameCore::new("foo bar zar", Some(5));
    game.start(1000.0);

    // Multiple spaces should still match single space
    let result = game.handle_input("foo     bar     zar");
    assert_eq!(result.consecutive_errors, 0, "Multiple spaces should be normalized");

    // Check completion with excess whitespace
    let stats = game.get_stats(2000.0);
    assert!(stats.is_complete, "Should be complete despite excess whitespace");
}

#[test]
fn test_newlines_and_mixed_whitespace_normalized() {
    let mut game = TypingGameCore::new("foo bar zar", Some(5));
    game.start(1000.0);

    // Newlines and mixed whitespace should normalize to single spaces
    let result = game.handle_input("foo\n\n\nbar\t\tzar");
    assert_eq!(result.consecutive_errors, 0, "Newlines and tabs should normalize to spaces");

    let stats = game.get_stats(2000.0);
    assert!(stats.is_complete, "Should be complete with normalized whitespace");
}

#[test]
fn test_trailing_whitespace_ignored() {
    let mut game = TypingGameCore::new("foo bar", Some(5));
    game.start(1000.0);

    // Trailing spaces should not cause errors
    let result = game.handle_input("foo bar     ");

    let stats = game.get_stats(2000.0);
    assert!(stats.is_complete, "Trailing whitespace should not prevent completion");
    assert_eq!(result.consecutive_errors, 0, "Trailing whitespace should not be errors");
}

#[test]
fn test_missing_space_causes_error() {
    let mut game = TypingGameCore::new("foo bar zar", Some(10));
    game.start(1000.0);

    // "foobarzar" should not match "foo bar zar" - spaces are required
    let result = game.handle_input("foobarzar");

    // Should have errors because tokens are not properly separated
    assert!(
        result.consecutive_errors > 0 || result.total_errors > 0,
        "Missing required spaces between tokens should cause errors"
    );
}

#[test]
fn test_space_required_between_tokens() {
    let mut game = TypingGameCore::new("hello world", Some(10));
    game.start(1000.0);

    // Type "helloworld" without space
    game.handle_input("hello");
    let result = game.handle_input("hellow"); // 'w' should be space, this is an error

    assert_eq!(result.consecutive_errors, 1, "Missing space should be an error");
}

#[test]
fn test_leading_whitespace_ignored() {
    let mut game = TypingGameCore::new("foo bar", Some(5));
    game.start(1000.0);

    // Leading spaces should be normalized
    let result = game.handle_input("   foo bar");
    assert_eq!(result.consecutive_errors, 0, "Leading whitespace should be ignored");
}

#[test]
fn test_correct_char_resets_consecutive_errors() {
    let mut game = TypingGameCore::new("abcdef", Some(3));
    game.start(1000.0);

    // Make errors
    game.handle_input("ax");
    game.handle_input("axx");

    // Backspace to correct position
    game.handle_input("ax");
    game.handle_input("a");

    // Type correct char
    let result = game.handle_input("ab");
    assert_eq!(result.consecutive_errors, 0);
}

#[test]
fn test_different_max_error_limits() {
    // Test with limit of 1
    let mut game = TypingGameCore::new("abc", Some(1));
    game.start(1000.0);

    game.handle_input("x"); // Error 1
    let result = game.handle_input("xy");
    assert_eq!(result.accepted, false); // Blocked

    // Test with limit of 3
    let mut game = TypingGameCore::new("abcdef", Some(3));
    game.start(1000.0);

    let result = game.handle_input("x");
    assert_eq!(result.show_error_alert, false);
    let result = game.handle_input("xx");
    assert_eq!(result.show_error_alert, false);
    let result = game.handle_input("xxx");
    assert_eq!(result.show_error_alert, true);
    assert_eq!(result.accepted, true);
    let result = game.handle_input("xxxx");
    assert_eq!(result.consecutive_errors, 4);
    assert_eq!(result.accepted, false);
    let result = game.handle_input("xxxxx");
    assert_eq!(result.consecutive_errors, 5);
    assert_eq!(result.show_error_alert, true);

    // 6th error should block
    let result = game.handle_input("xxxxxx");
    assert_eq!(result.accepted, false);
}
