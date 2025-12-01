use leetype_wasm::*;

#[test]
fn test_exceeding_target_length() {
    let mut game = TypingGame::new("abc", Some(10));
    game.start(1000.0);

    game.handle_input("abc"); // Correct
    let result: serde_json::Value = serde_wasm_bindgen::from_value(
        game.handle_input("abcd"), // Extra character
    )
    .unwrap();

    assert_eq!(result["consecutive_errors"], 1);
    assert!(result["total_errors"].as_u64().unwrap() >= 1);
}

#[test]
fn test_special_regex_characters() {
    let target = ".*+?[]{}()^$|\\";
    let mut game = TypingGame::new(target, Some(10));
    game.start(1000.0);

    let _result: serde_json::Value = serde_wasm_bindgen::from_value(game.handle_input(target)).unwrap();

    let stats: serde_json::Value = serde_wasm_bindgen::from_value(game.get_stats(2000.0)).unwrap();
    assert_eq!(stats["is_complete"], true);
}

#[test]
fn test_quotes_and_escapes() {
    let target = r#"hello "world" 'test' \n"#;
    let mut game = TypingGame::new(target, Some(10));
    game.start(1000.0);

    game.handle_input(target);

    let stats: serde_json::Value = serde_wasm_bindgen::from_value(game.get_stats(2000.0)).unwrap();
    assert_eq!(stats["is_complete"], true);
}

#[test]
fn test_very_long_input() {
    let target = "a".repeat(1000);
    let mut game = TypingGame::new(&target, Some(10));
    game.start(1000.0);

    game.handle_input(&target);

    let stats: serde_json::Value = serde_wasm_bindgen::from_value(game.get_stats(2000.0)).unwrap();
    assert_eq!(stats["is_complete"], true);
}
