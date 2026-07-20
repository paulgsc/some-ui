mod korean;

pub use korean::Korean;

#[cfg(test)]
mod test_fixture;

/// Generalizes Definitions 1.1-1.2 (canon §11.1, Def. 11.1): a content domain fixes its atomic
/// token alphabet, its token-to-key mapping, and a finite completion pool. `Token`/`Key` stay
/// `String` because every consumer downstream of `GameMode` (canon §6) already treats them opaquely
/// as `String` - only the two content-source functions (`hangul_to_qwerty`, the 40-entry alphabet)
/// needed to move behind this trait (canon Thm. 11.1).
pub trait ContentDomain {
    /// `κ_D`: map one token to its expected key sequence. Empty string for an unmapped/unknown
    /// token, matching `hangul_to_qwerty`'s prior contract.
    fn key_for(token: &str) -> String;

    /// `A_D`: the finite, enumerable alphabet backing completion-style pools and endless-mode's
    /// random draws.
    fn completion_alphabet() -> Vec<String>;
}
