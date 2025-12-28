use crate::types::{EffectParams, EffectType, SoundEngineError, SoundToken, VoiceConfig};
use regex::Regex;

#[derive(Debug, PartialEq)]
enum TokenType {
    Voice,
    Effect,
    Pause,
}

#[derive(Debug)]
enum NextToken {
    VoiceConfig { end_pos: usize, config: VoiceConfig },
    Effect { end_pos: usize, effect_type: EffectType, params: EffectParams },
    Pause { end_pos: usize, duration_ms: u32 },
    Speech { end_pos: usize, text: String },
    End,
}

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

            // Find the next token (special or speech)
            let next_token = self.find_next_token(remaining, &current_voice_config)?;

            match next_token {
                NextToken::VoiceConfig { end_pos, config } => {
                    current_voice_config = config;
                    pos += end_pos;
                }
                NextToken::Effect { end_pos, effect_type, params } => {
                    tokens.push(SoundToken::SoundEffect { effect_type, params });
                    pos += end_pos;
                }
                NextToken::Pause { end_pos, duration_ms } => {
                    tokens.push(SoundToken::Pause { duration_ms });
                    pos += end_pos;
                }
                NextToken::Speech { end_pos, text } => {
                    if !text.trim().is_empty() {
                        tokens.push(SoundToken::Speech {
                            text: text.trim().to_string(),
                            voice_config: current_voice_config.clone(),
                        });
                    }
                    pos += end_pos;
                }
                NextToken::End => break,
            }
        }

        Ok(tokens)
    }

    /// Find the next token in the input string
    fn find_next_token(&self, text: &str, c: &VoiceConfig) -> Result<NextToken, SoundEngineError> {
        // Find all special token positions
        let voice_match = self.voice_config_pattern.find(text);
        let effect_match = self.effect_pattern.find(text);
        let pause_match = self.pause_pattern.find(text);

        // Find the earliest special token
        let earliest_special = [
            voice_match.map(|m| (m.start(), TokenType::Voice)),
            effect_match.map(|m| (m.start(), TokenType::Effect)),
            pause_match.map(|m| (m.start(), TokenType::Pause)),
        ]
        .into_iter()
        .flatten()
        .min_by_key(|(pos, _)| *pos);

        match earliest_special {
            Some((0, TokenType::Voice)) => {
                // Voice config at the beginning
                let captures = self.voice_config_pattern.captures(text).unwrap();
                let config = self.parse_voice_config(&captures[1], c)?;
                Ok(NextToken::VoiceConfig {
                    end_pos: captures.get(0).unwrap().end(),
                    config,
                })
            }
            Some((0, TokenType::Effect)) => {
                // Effect at the beginning
                let captures = self.effect_pattern.captures(text).unwrap();
                let effect_type = self.parse_effect_type(&captures[1])?;
                let params = if let Some(param_str) = captures.get(2) {
                    self.parse_effect_params(param_str.as_str())?
                } else {
                    EffectParams::default()
                };
                Ok(NextToken::Effect {
                    end_pos: captures.get(0).unwrap().end(),
                    effect_type,
                    params,
                })
            }
            Some((0, TokenType::Pause)) => {
                // Pause at the beginning
                let captures = self.pause_pattern.captures(text).unwrap();
                let duration_ms = captures[1]
                    .parse::<u32>()
                    .map_err(|e| SoundEngineError::LexerError(format!("Invalid pause duration: {}", e)))?;
                Ok(NextToken::Pause {
                    end_pos: captures.get(0).unwrap().end(),
                    duration_ms,
                })
            }
            Some((pos, _)) => {
                // Speech text before the next special token
                Ok(NextToken::Speech {
                    end_pos: pos,
                    text: text[..pos].to_string(),
                })
            }
            None => {
                // No special tokens found, treat all remaining as speech or end
                if text.is_empty() {
                    Ok(NextToken::End)
                } else {
                    Ok(NextToken::Speech {
                        end_pos: text.len(),
                        text: text.to_string(),
                    })
                }
            }
        }
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

    fn parse_voice_config(&self, config_str: &str, c: &VoiceConfig) -> Result<VoiceConfig, SoundEngineError> {
        let mut config = c.clone();

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
    fn test_pause_token() {
        let lexer = SoundLexer::new().unwrap();
        let tokens = lexer.tokenize("[pause:500]").unwrap();

        assert_eq!(tokens.len(), 1);
        match tokens[0] {
            SoundToken::Pause { duration_ms } => assert_eq!(duration_ms, 500),
            _ => panic!("Expected pause token"),
        }
    }

    #[test]
    fn test_effect_token() {
        let lexer = SoundLexer::new().unwrap();
        let tokens = lexer.tokenize("[effect:boom]").unwrap();

        assert_eq!(tokens.len(), 1);
        match &tokens[0] {
            SoundToken::SoundEffect { effect_type, .. } => {
                assert_eq!(*effect_type, EffectType::Boom);
            }
            _ => panic!("Expected effect token"),
        }
    }

    #[test]
    fn test_speech_with_effect() {
        let lexer = SoundLexer::new().unwrap();
        let tokens = lexer.tokenize("Hello [effect:boom]").unwrap();

        assert_eq!(tokens.len(), 2);
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
    }

    #[test]
    fn test_mixed_content() {
        let lexer = SoundLexer::new().unwrap();
        let tokens = lexer.tokenize("Hello [effect:boom] world [pause:500] done").unwrap();

        assert_eq!(tokens.len(), 5);

        match &tokens[0] {
            SoundToken::Speech { text, .. } => assert_eq!(text, "Hello"),
            _ => panic!("Expected speech token at position 0"),
        }

        match &tokens[1] {
            SoundToken::SoundEffect { effect_type, .. } => {
                assert_eq!(*effect_type, EffectType::Boom);
            }
            _ => panic!("Expected effect token at position 1"),
        }

        match &tokens[2] {
            SoundToken::Speech { text, .. } => assert_eq!(text, "world"),
            _ => panic!("Expected speech token at position 2"),
        }

        match &tokens[3] {
            SoundToken::Pause { duration_ms } => assert_eq!(*duration_ms, 500),
            _ => panic!("Expected pause token at position 3"),
        }

        match &tokens[4] {
            SoundToken::Speech { text, .. } => assert_eq!(text, "done"),
            _ => panic!("Expected speech token at position 4"),
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

    #[test]
    fn test_effect_with_params() {
        let lexer = SoundLexer::new().unwrap();
        let tokens = lexer.tokenize("[effect:beep:frequency=440,duration=1000]").unwrap();

        assert_eq!(tokens.len(), 1);
        match &tokens[0] {
            SoundToken::SoundEffect { effect_type, params } => {
                assert_eq!(*effect_type, EffectType::Beep);
                assert_eq!(params.frequency, Some(440.0));
                assert_eq!(params.duration_ms, Some(1000));
            }
            _ => panic!("Expected effect token with params"),
        }
    }

    #[test]
    fn test_multiple_voice_configs() {
        let lexer = SoundLexer::new().unwrap();
        let tokens = lexer.tokenize("{voice:rate=1.0}Hello {voice:rate=2.0}world").unwrap();

        assert_eq!(tokens.len(), 2);

        match &tokens[0] {
            SoundToken::Speech { text, voice_config } => {
                assert_eq!(text, "Hello");
                assert_eq!(voice_config.rate, 1.0);
            }
            _ => panic!("Expected first speech token"),
        }

        match &tokens[1] {
            SoundToken::Speech { text, voice_config } => {
                assert_eq!(text, "world");
                assert_eq!(voice_config.rate, 2.0);
            }
            _ => panic!("Expected second speech token"),
        }
    }

    #[test]
    fn test_complex_mixed_content() {
        let lexer = SoundLexer::new().unwrap();
        let tokens = lexer
            .tokenize("{voice:rate=1.2}Welcome [effect:bell] to the show [pause:1000] {voice:pitch=1.5}Enjoy!")
            .unwrap();

        assert_eq!(tokens.len(), 5);

        // First speech with voice config
        match &tokens[0] {
            SoundToken::Speech { text, voice_config } => {
                assert_eq!(text, "Welcome");
                assert_eq!(voice_config.rate, 1.2);
            }
            _ => panic!("Expected welcome speech token"),
        }

        // Bell effect
        match &tokens[1] {
            SoundToken::SoundEffect { effect_type, .. } => {
                assert_eq!(*effect_type, EffectType::Bell);
            }
            _ => panic!("Expected bell effect token"),
        }

        // Second speech (inherits previous voice config)
        match &tokens[2] {
            SoundToken::Speech { text, voice_config } => {
                assert_eq!(text, "to the show");
                assert_eq!(voice_config.rate, 1.2);
            }
            _ => panic!("Expected 'to the show' speech token"),
        }

        // Pause
        match &tokens[3] {
            SoundToken::Pause { duration_ms } => assert_eq!(*duration_ms, 1000),
            _ => panic!("Expected pause token"),
        }

        // Final speech with updated voice config
        match &tokens[4] {
            SoundToken::Speech { text, voice_config } => {
                assert_eq!(text, "Enjoy!");
                assert_eq!(voice_config.rate, 1.2); // Still inherited
                assert_eq!(voice_config.pitch, 1.5); // Updated
            }
            _ => panic!("Expected 'Enjoy!' speech token"),
        }
    }

    #[test]
    fn test_empty_string() {
        let lexer = SoundLexer::new().unwrap();
        let tokens = lexer.tokenize("").unwrap();
        assert_eq!(tokens.len(), 0);
    }

    #[test]
    fn test_whitespace_handling() {
        let lexer = SoundLexer::new().unwrap();
        let tokens = lexer.tokenize("  Hello   [effect:boom]   world  ").unwrap();

        assert_eq!(tokens.len(), 3);
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
            SoundToken::Speech { text, .. } => {
                assert_eq!(text, "world");
            }
            _ => panic!("Expected effect token"),
        }
    }

    #[test]
    fn test_custom_effect_type() {
        let lexer = SoundLexer::new().unwrap();
        let tokens = lexer.tokenize("[effect:explosion]").unwrap();

        assert_eq!(tokens.len(), 1);
        match &tokens[0] {
            SoundToken::SoundEffect { effect_type, .. } => {
                assert_eq!(*effect_type, EffectType::Custom("explosion".to_string()));
            }
            _ => panic!("Expected custom effect token"),
        }
    }
}
