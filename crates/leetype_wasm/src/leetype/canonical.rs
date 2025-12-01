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
    #[allow(dead_code)]
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

pub fn canonicalize(input: &str) -> Vec<CanonicalUnit> {
    let mut units = Vec::new();
    let mut chars = input.chars().peekable();
    let mut whitespace_buffer = String::new();
    let mut seen_char = false;

    while let Some(ch) = chars.next() {
        if ch.is_whitespace() {
            whitespace_buffer.push(ch);

            // Look ahead to see if more whitespace follows
            while let Some(&next_ch) = chars.peek() {
                if next_ch.is_whitespace() {
                    whitespace_buffer.push(next_ch);
                    chars.next();
                } else {
                    break;
                }
            }

            // Only add separator if there are non-whitespace chars after
            if seen_char && chars.peek().is_some() {
                units.push(CanonicalUnit::Separator { value: whitespace_buffer.clone() });
            }
            whitespace_buffer.clear();
        } else {
            seen_char = true;
            units.push(CanonicalUnit::Char { value: ch });
        }
    }

    units
}
