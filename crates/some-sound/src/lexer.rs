use crate::types::{EffectParams, EffectType, SoundEngineError, SoundToken, VoiceConfig};
use regex::Regex;

/// Lexer that parses text input into sound tokens
pub struct SoundLexer {
    // Regex patterns for different sound tokens
    #[allow(dead_code)]
    speech_pattern: Regex,
    effect_pattern: Regex,
    pause_pattern: Regex,
    voice_config_pattern: Regex,
}

impl SoundLexer {
    pub fn new() -> Result<Self, SoundEngineError> {
        Ok(Self {
            // Match speech text (default case) - fixed regex
            speech_pattern: Regex::new(r"[^\[\]{}]+").map_err(|e| SoundEngineError::LexerError(format!("Invalid speech regex: {e}")))?,

            // Match sound effects: [effect:type] or [effect:type:param1=val1,param2=val2]
            effect_pattern: Regex::new(r"\[effect:(\w+)(?::([^\]]+))?\]").map_err(|e| SoundEngineError::LexerError(format!("Invalid effect regex: {e}")))?,

            // Match pauses: [pause:duration_ms]
            pause_pattern: Regex::new(r"\[pause:(\d+)\]").map_err(|e| SoundEngineError::LexerError(format!("Invalid pause regex: {e}")))?,

            // Match voice config: {voice:rate=1.0,pitch=1.0,volume=1.0,name=voice_name}
            voice_config_pattern: Regex::new(r"\{voice:([^}]+)\}").map_err(|e| SoundEngineError::LexerError(format!("Invalid voice config regex: {e}")))?,
        })
    }

    /// Main tokenization function
    pub fn tokenize(&self, input: &str) -> Result<Vec<SoundToken>, SoundEngineError> {
        let mut tokens = Vec::new();
        let mut current_voice_config = VoiceConfig::default();
        let mut pos = 0;

        while pos < input.len() {
            let remaining = &input[pos..];

            if let Some(captures) = self.voice_config_pattern.find(remaining) {
                // Update voice configuration
                if let Some(config_match) = self.voice_config_pattern.captures(remaining) {
                    current_voice_config = self.parse_voice_config(&config_match[1])?;
                }
                pos += captures.end();
                continue;
            }

            if let Some(captures) = self.effect_pattern.captures(remaining) {
                // Parse sound effect
                let effect_type = self.parse_effect_type(&captures[1])?;
                let params = if let Some(param_str) = captures.get(2) {
                    self.parse_effect_params(param_str.as_str())?
                } else {
                    EffectParams::default()
                };

                tokens.push(SoundToken::SoundEffect { effect_type, params });
                pos += captures.get(0).unwrap().end();
                continue;
            }

            if let Some(captures) = self.pause_pattern.captures(remaining) {
                // Parse pause
                let duration_ms = captures[1]
                    .parse::<u32>()
                    .map_err(|e| SoundEngineError::LexerError(format!("Invalid pause duration: {}", e)))?;

                tokens.push(SoundToken::Pause { duration_ms });
                pos += captures.get(0).unwrap().end();
                continue;
            }

            // Find the next special token or end of string
            let next_special = [
                self.effect_pattern.find(remaining).map(|m| m.start()),
                self.pause_pattern.find(remaining).map(|m| m.start()),
                self.voice_config_pattern.find(remaining).map(|m| m.start()),
            ]
            .into_iter()
            .flatten()
            .min()
            .unwrap_or(remaining.len());

            if next_special > 0 {
                // Extract speech text
                let speech_text = remaining[..next_special].trim();
                if !speech_text.is_empty() {
                    tokens.push(SoundToken::Speech {
                        text: speech_text.to_string(),
                        voice_config: current_voice_config.clone(),
                    });
                }
                pos += next_special;
            } else {
                // No more special tokens, take remaining text as speech
                let remaining_text = remaining.trim();
                if !remaining_text.is_empty() {
                    tokens.push(SoundToken::Speech {
                        text: remaining_text.to_string(),
                        voice_config: current_voice_config.clone(),
                    });
                }
                break;
            }
        }

        Ok(tokens)
    }

    fn parse_effect_type(&self, type_str: &str) -> Result<EffectType, SoundEngineError> {
        match type_str.to_lowercase().as_str() {
            "beep" => Ok(EffectType::Beep),
            "boom" => Ok(EffectType::Boom),
            "click" => Ok(EffectType::Click),
            "whoosh" => Ok(EffectType::Whoosh),
            "bell" => Ok(EffectType::Bell),
            custom => Ok(EffectType::Custom(custom.to_string())),
        }
    }

    fn parse_effect_params(&self, param_str: &str) -> Result<EffectParams, SoundEngineError> {
        let mut params = EffectParams::default();

        for param in param_str.split(',') {
            let parts: Vec<&str> = param.split('=').collect();
            if parts.len() != 2 {
                continue;
            }

            let key = parts[0].trim();
            let value = parts[1].trim();

            match key {
                "frequency" => {
                    params.frequency = Some(value.parse().map_err(|e| SoundEngineError::LexerError(format!("Invalid frequency: {}", e)))?);
                }
                "duration" => {
                    params.duration_ms = Some(value.parse().map_err(|e| SoundEngineError::LexerError(format!("Invalid duration: {}", e)))?);
                }
                "volume" => {
                    params.volume = Some(value.parse().map_err(|e| SoundEngineError::LexerError(format!("Invalid volume: {}", e)))?);
                }
                "decay" => {
                    params.decay = Some(value.parse().map_err(|e| SoundEngineError::LexerError(format!("Invalid decay: {}", e)))?);
                }
                _ => {} // Ignore unknown parameters
            }
        }

        Ok(params)
    }

    fn parse_voice_config(&self, config_str: &str) -> Result<VoiceConfig, SoundEngineError> {
        let mut config = VoiceConfig::default();

        for param in config_str.split(',') {
            let parts: Vec<&str> = param.split('=').collect();
            if parts.len() != 2 {
                continue;
            }

            let key = parts[0].trim();
            let value = parts[1].trim();

            match key {
                "rate" => {
                    config.rate = value.parse().map_err(|e| SoundEngineError::LexerError(format!("Invalid rate: {}", e)))?;
                }
                "pitch" => {
                    config.pitch = value.parse().map_err(|e| SoundEngineError::LexerError(format!("Invalid pitch: {}", e)))?;
                }
                "volume" => {
                    config.volume = value.parse().map_err(|e| SoundEngineError::LexerError(format!("Invalid volume: {}", e)))?;
                }
                "name" => {
                    config.voice_name = Some(value.to_string());
                }
                _ => {} // Ignore unknown parameters
            }
        }

        Ok(config)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_simple_speech() {
        let lexer = SoundLexer::new().unwrap();
        let tokens = lexer.tokenize("Hello world").unwrap();

        assert_eq!(tokens.len(), 1);
        match &tokens[0] {
            SoundToken::Speech { text, .. } => assert_eq!(text, "Hello world"),
            _ => panic!("Expected speech token"),
        }
    }

    #[test]
    fn test_tokens() {
        let lexer = SoundLexer::new().unwrap();
        let tokens = lexer.tokenize("[pause:500]").unwrap();

        assert_eq!(tokens.len(), 1);
        match tokens[0] {
            SoundToken::Pause { duration_ms } => assert_eq!(duration_ms, 500),
            _ => panic!("Expected pause token"),
        }

        let tokens = lexer.tokenize("[effect:boom]").unwrap();

        assert_eq!(tokens.len(), 1);
        match &tokens[0] {
            SoundToken::SoundEffect { effect_type, .. } => assert_eq!(*effect_type, EffectType::Boom),
            _ => panic!("Expected effect token"),
        }

        let tokens = lexer.tokenize("Hello [effect:boom]").unwrap();

        assert_eq!(tokens.len(), 2);
    }

    #[test]
    fn test_mixed_content() {
        let lexer = SoundLexer::new().unwrap();
        let tokens = lexer.tokenize("Hello [effect:boom] world [pause:500] done").unwrap();

        assert_eq!(tokens.len(), 4);

        match &tokens[0] {
            SoundToken::Speech { text, .. } => assert_eq!(text, "Hello"),
            _ => panic!("Expected speech token"),
        }

        match &tokens[1] {
            SoundToken::SoundEffect { effect_type, .. } => {
                assert_eq!(*effect_type, EffectType::Boom);
            }
            _ => panic!("Expected effect token"),
        }

        match &tokens[2] {
            SoundToken::Speech { text, .. } => assert_eq!(text, "world"),
            _ => panic!("Expected speech token"),
        }

        match &tokens[3] {
            SoundToken::Pause { duration_ms } => assert_eq!(*duration_ms, 500),
            _ => panic!("Expected pause token"),
        }
    }

    #[test]
    fn test_voice_config() {
        let lexer = SoundLexer::new().unwrap();
        let tokens = lexer.tokenize("{voice:rate=1.5,pitch=2.0}Hello").unwrap();

        assert_eq!(tokens.len(), 1);
        match &tokens[0] {
            SoundToken::Speech { text, voice_config } => {
                assert_eq!(text, "Hello");
                assert_eq!(voice_config.rate, 1.5);
                assert_eq!(voice_config.pitch, 2.0);
            }
            _ => panic!("Expected speech token"),
        }
    }
}
