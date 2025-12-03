use leetype_wasm::TypingGameCore;

#[test]
fn test_backspace_recalculates_correctly() {
    let mut game = TypingGameCore::new("foo bar zar", Some(3));
    game.start(1000.0);

    // Target: [f,o,o,<sep>,b,a,r,<sep>,z,a,r] (11 units)

    // Type "foo bzz" - errors at positions 5,6
    let result = game.handle_input("foo bzz");
    // Canonical: [f,o,o,<sep>,b,z,z] (7 units)
    // First error at pos 5, so consecutive = 7 - 5 = 2
    assert_eq!(result.consecutive_errors, 2);

    // Type "foo bzr z" - adds 2 more units (including separator)
    let result = game.handle_input("foo bzr z");
    // Canonical: [f,o,o,<sep>,b,z,r,<sep>,z] (9 units)
    // First error still at pos 5, added 2 chars, so +2 errors
    // consecutive = 2 + 2 = 4
    assert_eq!(result.consecutive_errors, 4);
    assert_eq!(result.show_error_alert, true);

    // Backspace to "foo bzr " (trailing space ignored)
    let result = game.handle_input("foo bzr ");
    // Canonical: [f,o,o,<sep>,b,z,r] (7 units)
    // First error at pos 5, so consecutive = 7 - 5 = 2
    assert_eq!(result.consecutive_errors, 2, "Should recalculate to 2 errors");

    // Type "foo bz r" - adds space before 'r'
    let result = game.handle_input("foo bz r");
    // Canonical: [f,o,o,<sep>,b,z,<sep>,r] (8 units)
    // First error at pos 5, added 1 unit, so +1 error
    // consecutive = 2 + 1 = 3
    assert_eq!(result.consecutive_errors, 3);

    // Type "foo bz r zyy" - adds more
    let result = game.handle_input("foo bz r zyy");
    // Canonical: [f,o,o,<sep>,b,z,<sep>,r,<sep>,z,y,y] (12 units)
    // First error at pos 5, added 4 units, so +4 errors
    // consecutive = 3 + 4 = 7
    assert_eq!(result.consecutive_errors, 7);
}

#[test]
fn test_backspace_to_correct_position_resets() {
    let mut game = TypingGameCore::new("hello", Some(5));
    game.start(1000.0);

    // Type "h" correctly
    game.handle_input("h");

    // Make errors: "hxyz"
    game.handle_input("hx");
    game.handle_input("hxy");
    let r = game.handle_input("hxyz");
    assert_eq!(r.consecutive_errors, 3);

    // Backspace to "hx"
    let r = game.handle_input("hx");
    // First error at pos 1, length 2, so consecutive = 2 - 1 = 1
    assert_eq!(r.consecutive_errors, 1);

    // Backspace to "h" (no errors)
    let r = game.handle_input("h");
    // No error position found, so consecutive = 0
    assert_eq!(r.consecutive_errors, 0);

    // Type correctly
    let r = game.handle_input("he");
    assert_eq!(r.consecutive_errors, 0);
}

#[test]
fn test_backspace_partial_error_region() {
    let mut game = TypingGameCore::new("abcdefgh", Some(10));
    game.start(1000.0);

    // Type "ab" correctly, then "xyz" wrong
    game.handle_input("ab");
    game.handle_input("abx");
    game.handle_input("abxy");
    let r = game.handle_input("abxyz");
    // First error at pos 2, length 5, consecutive = 5 - 2 = 3
    assert_eq!(r.consecutive_errors, 3);

    // Backspace to "abxy"
    let r = game.handle_input("abxy");
    // First error at pos 2, length 4, consecutive = 4 - 2 = 2
    assert_eq!(r.consecutive_errors, 2);

    // Backspace to "abx"
    let r = game.handle_input("abx");
    // First error at pos 2, length 3, consecutive = 3 - 2 = 1
    assert_eq!(r.consecutive_errors, 1);
}

#[test]
fn test_backspace_from_blocked_state() {
    let mut game = TypingGameCore::new("hello", Some(3));
    game.start(1000.0);

    // Hit the limit
    game.handle_input("x");
    game.handle_input("xy");
    game.handle_input("xyz");

    // Try to add more - blocked
    let r = game.handle_input("xyzw");
    assert!(!r.accepted);
    assert_eq!(game.get_user_input(), "xyz"); // Input unchanged

    // Backspace below limit
    let r = game.handle_input("xy");
    assert!(r.accepted);
    // First error at pos 0, length 2, consecutive = 2 - 0 = 2
    assert_eq!(r.consecutive_errors, 2);
    assert!(!r.show_error_alert);

    // Can type again
    let r = game.handle_input("xyz");
    assert!(r.accepted);
    assert_eq!(r.consecutive_errors, 3);
}

#[test]
fn test_complex_whitespace_backspace() {
    let mut game = TypingGameCore::new("foo bar", Some(10));
    game.start(1000.0);

    // Type "foo b" correctly
    game.handle_input("foo b");

    // Make error: "foo bx"
    let r = game.handle_input("foo bx");
    assert_eq!(r.consecutive_errors, 1);

    // Add trailing space (should be ignored): "foo bx "
    let r = game.handle_input("foo bx ");
    // Canonical is still [f,o,o,<sep>,b,x] (6 units)
    // No change, so consecutive_errors stays 1
    assert_eq!(r.consecutive_errors, 1);

    // Backspace to "foo b"
    let r = game.handle_input("foo b");
    // Canonical: [f,o,o,<sep>,b] (5 units)
    // No error, consecutive = 0
    assert_eq!(r.consecutive_errors, 0);
}

#[test]
fn test_backspace_when_all_correct() {
    let mut game = TypingGameCore::new("hello", Some(3));
    game.start(1000.0);

    // Type correctly
    game.handle_input("hel");

    // Backspace
    let r = game.handle_input("he");
    assert_eq!(r.consecutive_errors, 0);

    // Continue correctly
    let r = game.handle_input("hell");
    assert_eq!(r.consecutive_errors, 0);
}
