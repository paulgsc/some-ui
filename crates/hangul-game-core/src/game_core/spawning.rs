
use crate::types::internal::ActiveReveal;
use crate::types::public::SpawnResult;
use rand::seq::SliceRandom;
use rand::thread_rng;

/// Find an available cell and create a spawn result
pub fn spawn_character_at_available_cell(
    hangul: String,
    expected_key: String,
    revealed_at_ms: u64,
    available_cell_ids: Vec<String>,
    active_reveals: &[ActiveReveal],
) -> Option<SpawnResult> {
    // Filter out cells that are already occupied
    let available: Vec<String> = available_cell_ids
        .into_iter()
        .filter(|id| !active_reveals.iter().any(|r| &r.cell_id == id))
        .collect();

    // Pick a random available cell
    available
        .choose(&mut thread_rng())
        .cloned()
        .map(|cell_id| SpawnResult {
            cell_id,
            hangul,
            expected_key,
            revealed_at_ms,
            play_spawn_sound: true,
        })
}

/// Get Korean character to QWERTY key mapping
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
        // Vowels
        "ㅏ" => "k",
        "ㅐ" => "o",
        "ㅑ" => "i",
        "ㅒ" => "O",
        "ㅓ" => "j",
        "ㅔ" => "p",
        "ㅕ" => "u",
        "ㅖ" => "P",
        "ㅗ" => "h",
        "ㅘ" => "hk",
        "ㅙ" => "ho",
        "ㅚ" => "hl",
        "ㅛ" => "y",
        "ㅜ" => "n",
        "ㅝ" => "nj",
        "ㅞ" => "np",
        "ㅟ" => "nl",
        "ㅠ" => "b",
        "ㅡ" => "m",
        "ㅢ" => "ml",
        "ㅣ" => "l",
        _ => "",
    }
    .to_string()
}
