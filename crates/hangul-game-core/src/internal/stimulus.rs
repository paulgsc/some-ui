use serde::{Deserialize, Serialize};

/// What the player perceives when a challenge spawns (canon Def. 3.1, ADR 0001 §2(a)). The engine
/// holds and compares only identifiers here - never pixels, audio samples, or any renderable
/// payload (Axiom 3.1, the asset-opacity invariant); the honeycomb layer resolves `Image`/`Icon`
/// ids and `Speech` refs/text to something renderable or speakable.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "camelCase", rename_all_fields = "camelCase")]
pub enum Stimulus {
    /// Today's behavior, preserved exactly: the prompt *is* the answer glyph, rendered as text.
    Glyph {
        text: String,
    },
    Image {
        asset_id: String,
    },
    Icon {
        name: String,
    },
    Speech {
        #[serde(skip_serializing_if = "Option::is_none", default)]
        audio_ref: Option<String>,
        #[serde(skip_serializing_if = "Option::is_none", default)]
        tts_text: Option<String>,
    },
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn glyph_stimulus_serializes_with_camel_case_kind_tag() {
        let stimulus = Stimulus::Glyph { text: "ㄱ".to_string() };
        let json = serde_json::to_value(&stimulus).unwrap();
        assert_eq!(json["kind"], "glyph");
        assert_eq!(json["text"], "ㄱ");
    }

    #[test]
    fn image_stimulus_serializes_its_asset_id_field_as_camel_case() {
        let stimulus = Stimulus::Image { asset_id: "apple-01".to_string() };
        let json = serde_json::to_value(&stimulus).unwrap();
        assert_eq!(json["kind"], "image");
        assert_eq!(json["assetId"], "apple-01");
    }

    #[test]
    fn speech_stimulus_omits_absent_optional_fields_and_camel_cases_present_ones() {
        let stimulus = Stimulus::Speech {
            audio_ref: None,
            tts_text: Some("사과".to_string()),
        };
        let json = serde_json::to_value(&stimulus).unwrap();
        assert_eq!(json["kind"], "speech");
        assert_eq!(json["ttsText"], "사과");
        assert!(json.get("audioRef").is_none());
    }

    #[test]
    fn stimulus_round_trips_through_json_deserialization() {
        let stimulus = Stimulus::Icon { name: "apple".to_string() };
        let json = serde_json::to_value(&stimulus).unwrap();
        let round_tripped: Stimulus = serde_json::from_value(json).unwrap();
        assert_eq!(round_tripped, stimulus);
    }
}
