use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "lowercase")]
pub enum CanonicalUnit {
    #[serde(rename = "char")]
    Char { value: char },
    #[serde(rename = "separator")]
    Separator { value: String },
}

impl CanonicalUnit {
    pub fn char_value(&self) -> Option<char> {
        match self {
            CanonicalUnit::Char { value } => Some(*value),
            _ => None,
        }
    }

    pub fn is_char(&self) -> bool {
        matches!(self, CanonicalUnit::Char { .. })
    }

    pub fn matches(&self, other: &CanonicalUnit) -> bool {
        match (self, other) {
            (CanonicalUnit::Char { value: a }, CanonicalUnit::Char { value: b }) => a == b,
            (CanonicalUnit::Separator { .. }, CanonicalUnit::Separator { .. }) => true,
            _ => false,
        }
    }
}

/// Canonicalize input into a sequence of characters and separators.
/// Rules:
/// 1. Non-whitespace chars become Char units
/// 2. Sequences of whitespace between chars become Separator units
/// 3. Leading/trailing whitespace is ignored
pub fn canonicalize(input: &str) -> Vec<CanonicalUnit> {
    let mut units = Vec::new();
    let mut pending_whitespace = String::new();

    for ch in input.chars() {
        if ch.is_whitespace() {
            pending_whitespace.push(ch);
        } else {
            // Flush pending whitespace if we already have chars
            if !units.is_empty() && !pending_whitespace.is_empty() {
                units.push(CanonicalUnit::Separator {
                    value: pending_whitespace.clone(),
                });
            }
            pending_whitespace.clear();
            units.push(CanonicalUnit::Char { value: ch });
        }
    }

    units
}
