use leetype_wasm::*;

#[test]
fn test_progress_calculation() {
    let mut game = TypingGame::new("hello", Some(10));
    game.start(1000.0);

    game.handle_input("he");
    let stats: serde_json::Value = serde_wasm_bindgen::from_value(game.get_stats(2000.0)).unwrap();

    // 2 out of 5 characters = 40%
    assert_eq!(stats["progress"].as_f64().unwrap(), 40.0);
}

#[test]
fn test_accuracy_with_errors() {
    let mut game = TypingGame::new("aaaa", Some(10));
    game.start(1000.0);

    game.handle_input("a"); // Correct
    game.handle_input("ax"); // Error
    game.handle_input("a"); // Backspace
    game.handle_input("aa"); // Correct

    let stats: serde_json::Value = serde_wasm_bindgen::from_value(game.get_stats(2000.0)).unwrap();

    // 2 chars typed, 1 error = 50% accuracy
    assert_eq!(stats["accuracy"].as_f64().unwrap(), 50.0);
}

#[test]
fn test_wpm_calculation() {
    let mut game = TypingGame::new("hello world", Some(10));
    game.start(1000.0);

    // Type everything
    game.handle_input("hello world");

    // After 60 seconds (60000ms)
    let stats: serde_json::Value = serde_wasm_bindgen::from_value(game.get_stats(61000.0)).unwrap();

    // 10 chars (excluding space as it's separator) / 5 chars per word / 1 minute = 2 WPM
    let wpm = stats["wpm"].as_u64().unwrap();
    assert!(wpm > 0);
}
