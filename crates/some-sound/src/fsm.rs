use crate::lexer::SoundLexer;
use crate::types::*;

/// Core FSM that handles state transitions
#[allow(dead_code)]
pub struct SoundEngineFSM {
    state: SoundEngineState,
    lexer: SoundLexer,
    config: SoundEngineConfig,
}

impl SoundEngineFSM {
    #[allow(dead_code)]
    pub fn new(config: SoundEngineConfig) -> Result<Self, SoundEngineError> {
        Ok(Self {
            state: SoundEngineState::Idle(IdleState),
            lexer: SoundLexer::new()?,
            config,
        })
    }

    /// Get current state (read-only)
    #[allow(dead_code)]
    pub const fn state(&self) -> &SoundEngineState {
        &self.state
    }

    /// Process an event and transition to new state
    #[allow(dead_code)]
    pub fn handle_event(&mut self, event: SoundEngineEvent) -> Result<(), SoundEngineError> {
        let new_state = self.transition(event)?;
        self.state = new_state;
        Ok(())
    }

    /// Core transition logic - implements the typestate pattern
    fn transition(&self, event: SoundEngineEvent) -> Result<SoundEngineState, SoundEngineError> {
        match (&self.state, event) {
            // Idle State Transitions
            (SoundEngineState::Idle(_), SoundEngineEvent::ProcessText { input }) => {
                let tokens = self.lexer.tokenize(&input)?;
                if tokens.is_empty() {
                    Ok(SoundEngineState::Idle(IdleState))
                } else {
                    Ok(SoundEngineState::Processing(ProcessingState { tokens, current_index: 0 }))
                }
            }

            // Processing State Transitions
            (SoundEngineState::Processing(state), SoundEngineEvent::PlayNext) => {
                if state.current_index >= state.tokens.len() {
                    // Queue exhausted, return to idle
                    Ok(SoundEngineState::Idle(IdleState))
                } else {
                    let token = &state.tokens[state.current_index];
                    match token {
                        SoundToken::Speech { .. } => {
                            let utterance_id = generate_id();
                            Ok(SoundEngineState::PlayingSpeech(PlayingSpeechState {
                                token: token.clone(),
                                utterance_id,
                            }))
                        }
                        SoundToken::SoundEffect { .. } => {
                            let audio_id = generate_id();
                            Ok(SoundEngineState::PlayingEffect(PlayingEffectState { token: token.clone(), audio_id }))
                        }
                        SoundToken::Pause { .. } => {
                            // For pause, immediately advance to next
                            let new_state = ProcessingState {
                                tokens: state.tokens.clone(),
                                current_index: state.current_index + 1,
                            };

                            // If we have more tokens, continue processing
                            if new_state.current_index < new_state.tokens.len() {
                                Ok(SoundEngineState::Processing(new_state))
                            } else {
                                Ok(SoundEngineState::Idle(IdleState))
                            }
                        }
                    }
                }
            }

            (SoundEngineState::Processing(_), SoundEngineEvent::Pause) => {
                Ok(SoundEngineState::Paused(PausedState {
                    paused_token: SoundToken::Pause { duration_ms: 0 }, // Placeholder
                    remaining_tokens: vec![],
                }))
            }

            (SoundEngineState::Processing(_), SoundEngineEvent::Stop) => Ok(SoundEngineState::Idle(IdleState)),

            // Playing Speech State Transitions
            (SoundEngineState::PlayingSpeech(state), SoundEngineEvent::SpeechCompleted { utterance_id }) => {
                if state.utterance_id == utterance_id {
                    // Move to next token or idle
                    Ok(SoundEngineState::Processing(ProcessingState {
                        tokens: vec![], // This should be populated from context
                        current_index: 0,
                    }))
                } else {
                    // Ignore completion for different utterance
                    Ok(SoundEngineState::PlayingSpeech(state.clone()))
                }
            }

            (SoundEngineState::PlayingSpeech(state), SoundEngineEvent::Pause) => Ok(SoundEngineState::Paused(PausedState {
                paused_token: state.token.clone(),
                remaining_tokens: vec![],
            })),

            (SoundEngineState::PlayingSpeech(_), SoundEngineEvent::Stop) => Ok(SoundEngineState::Idle(IdleState)),

            // Playing Effect State Transitions
            (SoundEngineState::PlayingEffect(state), SoundEngineEvent::EffectCompleted { audio_id }) => {
                if state.audio_id == audio_id {
                    Ok(SoundEngineState::Processing(ProcessingState { tokens: vec![], current_index: 0 }))
                } else {
                    Ok(SoundEngineState::PlayingEffect(state.clone()))
                }
            }

            (SoundEngineState::PlayingEffect(state), SoundEngineEvent::Pause) => Ok(SoundEngineState::Paused(PausedState {
                paused_token: state.token.clone(),
                remaining_tokens: vec![],
            })),

            (SoundEngineState::PlayingEffect(_), SoundEngineEvent::Stop) => Ok(SoundEngineState::Idle(IdleState)),

            // Paused State Transitions
            (SoundEngineState::Paused(_), SoundEngineEvent::Resume) => Ok(SoundEngineState::Processing(ProcessingState { tokens: vec![], current_index: 0 })),

            (SoundEngineState::Paused(_), SoundEngineEvent::Stop) => Ok(SoundEngineState::Idle(IdleState)),

            // Error State Transitions
            (SoundEngineState::Error(_), SoundEngineEvent::Reset) => Ok(SoundEngineState::Idle(IdleState)),

            (SoundEngineState::Error(state), SoundEngineEvent::ProcessText { input }) => {
                if state.recoverable {
                    let tokens = self.lexer.tokenize(&input)?;
                    if tokens.is_empty() {
                        Ok(SoundEngineState::Idle(IdleState))
                    } else {
                        Ok(SoundEngineState::Processing(ProcessingState { tokens, current_index: 0 }))
                    }
                } else {
                    Ok(SoundEngineState::Error(state.clone()))
                }
            }

            // Global Error Transitions (from any state)
            (_, SoundEngineEvent::Error { message, recoverable }) => Ok(SoundEngineState::Error(ErrorState { error: message, recoverable })),

            // Global Reset Transitions (from any state)
            (_, SoundEngineEvent::Reset) => Ok(SoundEngineState::Idle(IdleState)),

            // Invalid transitions
            (current_state, event) => Err(SoundEngineError::InvalidTransition {
                current_state: format!("{:?}", current_state),
                event: format!("{:?}", event),
            }),
        }
    }

    /// Enhanced transition with queue management
    #[allow(dead_code)]
    pub fn transition_with_queue(&mut self, event: SoundEngineEvent, queue_context: Option<QueueContext>) -> Result<(), SoundEngineError> {
        match (&self.state, &event) {
            (SoundEngineState::Processing(state), SoundEngineEvent::PlayNext) => {
                if let Some(context) = queue_context {
                    let new_state = self.transition_processing_with_context(state, &context)?;
                    self.state = new_state;
                    Ok(())
                } else {
                    self.handle_event(event)
                }
            }
            _ => self.handle_event(event),
        }
    }

    fn transition_processing_with_context(&self, state: &ProcessingState, context: &QueueContext) -> Result<SoundEngineState, SoundEngineError> {
        if state.current_index >= state.tokens.len() {
            return Ok(SoundEngineState::Idle(IdleState));
        }

        let token = &state.tokens[state.current_index];
        match token {
            SoundToken::Speech { .. } => Ok(SoundEngineState::PlayingSpeech(PlayingSpeechState {
                token: token.clone(),
                utterance_id: context.utterance_id.clone().unwrap_or_else(generate_id),
            })),
            SoundToken::SoundEffect { .. } => Ok(SoundEngineState::PlayingEffect(PlayingEffectState {
                token: token.clone(),
                audio_id: context.audio_id.clone().unwrap_or_else(generate_id),
            })),
            SoundToken::Pause { .. } => {
                // Schedule continuation after pause
                let next_index = state.current_index + 1;
                if next_index < state.tokens.len() {
                    Ok(SoundEngineState::Processing(ProcessingState {
                        tokens: state.tokens.clone(),
                        current_index: next_index,
                    }))
                } else {
                    Ok(SoundEngineState::Idle(IdleState))
                }
            }
        }
    }

    /// Get engine status for external queries
    #[allow(dead_code)]
    pub fn status(&self) -> EngineStatus {
        match &self.state {
            SoundEngineState::Idle(_) => EngineStatus {
                state_name: "idle",
                is_playing: false,
                queue_length: 0,
                current_position: 0,
                error_message: None,
            },
            SoundEngineState::Processing(state) => EngineStatus {
                state_name: "processing",
                is_playing: false,
                queue_length: state.tokens.len(),
                current_position: state.current_index,
                error_message: None,
            },
            SoundEngineState::PlayingSpeech(_) => EngineStatus {
                state_name: "playing_speech",
                is_playing: true,
                queue_length: 0, // Would need context to show full queue
                current_position: 0,
                error_message: None,
            },
            SoundEngineState::PlayingEffect(_) => EngineStatus {
                state_name: "playing_effect",
                is_playing: true,
                queue_length: 0,
                current_position: 0,
                error_message: None,
            },
            SoundEngineState::Paused(_) => EngineStatus {
                state_name: "paused",
                is_playing: false,
                queue_length: 0,
                current_position: 0,
                error_message: None,
            },
            SoundEngineState::Error(state) => EngineStatus {
                state_name: "error",
                is_playing: false,
                queue_length: 0,
                current_position: 0,
                error_message: Some(&state.error),
            },
        }
    }
}

/// Context for queue management during transitions
#[derive(Debug, Clone)]
pub struct QueueContext {
    pub utterance_id: Option<String>,
    pub audio_id: Option<String>,
    #[allow(dead_code)]
    pub remaining_tokens: Vec<SoundToken>,
    #[allow(dead_code)]
    pub current_index: usize,
}

/// Generate unique IDs for tracking audio/speech instances
fn generate_id() -> String {
    use std::time::{SystemTime, UNIX_EPOCH};
    let timestamp = SystemTime::now().duration_since(UNIX_EPOCH).unwrap_or_default().as_millis();
    format!("id_{}", timestamp)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn create_test_config() -> SoundEngineConfig {
        SoundEngineConfig {
            default_voice: VoiceConfig::default(),
            default_effect_params: EffectParams::default(),
            auto_play: true,
            loop_queue: false,
        }
    }

    fn create_test_fsm() -> SoundEngineFSM {
        SoundEngineFSM::new(create_test_config()).unwrap()
    }

    #[test]
    fn test_fsm_creation_with_lexer() {
        let fsm = create_test_fsm();
        assert!(matches!(fsm.state(), SoundEngineState::Idle(_)));
    }

    #[test]
    fn test_simple_speech_processing() {
        let mut fsm = create_test_fsm();

        let event = SoundEngineEvent::ProcessText { input: "Hello world".to_string() };

        fsm.handle_event(event).unwrap();

        match fsm.state() {
            SoundEngineState::Processing(state) => {
                assert_eq!(state.current_index, 0);
                assert_eq!(state.tokens.len(), 1);

                match &state.tokens[0] {
                    SoundToken::Speech { text, voice_config } => {
                        assert_eq!(text, "Hello world");
                        assert_eq!(voice_config.rate, 1.0);
                        assert_eq!(voice_config.pitch, 1.0);
                        assert_eq!(voice_config.volume, 1.0);
                    }
                    _ => panic!("Expected speech token"),
                }
            }
            _ => panic!("Expected Processing state"),
        }
    }

    #[test]
    fn test_mixed_content_lexing_and_queue() {
        let mut fsm = create_test_fsm();

        let event = SoundEngineEvent::ProcessText {
            input: "Hello [effect:boom] world [pause:500] goodbye".to_string(),
        };

        fsm.handle_event(event).unwrap();

        match fsm.state() {
            SoundEngineState::Processing(state) => {
                assert_eq!(state.current_index, 0);
                assert_eq!(state.tokens.len(), 4);

                // Check first token - speech
                match &state.tokens[0] {
                    SoundToken::Speech { text, .. } => assert_eq!(text, "Hello"),
                    _ => panic!("Expected speech token at index 0"),
                }

                // Check second token - sound effect
                match &state.tokens[1] {
                    SoundToken::SoundEffect { effect_type, params } => {
                        assert_eq!(*effect_type, EffectType::Boom);
                        assert_eq!(params.frequency, Some(440.0)); // Default
                        assert_eq!(params.volume, Some(0.5)); // Default
                    }
                    _ => panic!("Expected effect token at index 1"),
                }

                // Check third token - speech
                match &state.tokens[2] {
                    SoundToken::Speech { text, .. } => assert_eq!(text, "world"),
                    _ => panic!("Expected speech token at index 2"),
                }

                // Check fourth token - pause
                match &state.tokens[3] {
                    SoundToken::Pause { duration_ms } => assert_eq!(*duration_ms, 500),
                    _ => panic!("Expected pause token at index 3"),
                }
            }
            _ => panic!("Expected Processing state"),
        }
    }
}
