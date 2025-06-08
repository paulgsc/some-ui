use serde::{Deserialize, Serialize};

/// Core sound token types that our lexer produces
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub enum SoundToken {
    Speech { text: String, voice_config: VoiceConfig },
    SoundEffect { effect_type: EffectType, params: EffectParams },
    Pause { duration_ms: u32 },
}

/// Voice configuration for speech synthesis
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct VoiceConfig {
    pub rate: f32,   // 0.1 to 10
    pub pitch: f32,  // 0 to 2
    pub volume: f32, // 0 to 1
    pub voice_name: Option<String>,
}

impl Default for VoiceConfig {
    fn default() -> Self {
        Self {
            rate: 1.0,
            pitch: 1.0,
            volume: 1.0,
            voice_name: None,
        }
    }
}

/// Sound effect types
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub enum EffectType {
    Beep,
    Boom,
    Click,
    Whoosh,
    Bell,
    Custom(String),
}

/// Parameters for sound effects
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct EffectParams {
    pub frequency: Option<f32>,
    pub duration_ms: Option<u32>,
    pub volume: Option<f32>,
    pub decay: Option<f32>,
}

impl Default for EffectParams {
    fn default() -> Self {
        Self {
            frequency: Some(440.0),
            duration_ms: Some(200),
            volume: Some(0.5),
            decay: Some(0.1),
        }
    }
}

/// FSM State types - each state is a distinct type for compile-time safety
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct IdleState;

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct ProcessingState {
    pub tokens: Vec<SoundToken>,
    pub current_index: usize,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct PlayingSpeechState {
    pub token: SoundToken,
    pub utterance_id: String,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct PlayingEffectState {
    pub token: SoundToken,
    pub audio_id: String,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct PausedState {
    pub paused_token: SoundToken,
    pub remaining_tokens: Vec<SoundToken>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ErrorState {
    pub error: String,
    pub recoverable: bool,
}

/// Main FSM State enum
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub enum SoundEngineState {
    Idle(IdleState),
    Processing(ProcessingState),
    PlayingSpeech(PlayingSpeechState),
    PlayingEffect(PlayingEffectState),
    Paused(PausedState),
    Error(ErrorState),
}

/// FSM Events
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub enum SoundEngineEvent {
    ProcessText { input: String },
    PlayNext,
    SpeechCompleted { utterance_id: String },
    EffectCompleted { audio_id: String },
    Pause,
    Resume,
    Stop,
    Error { message: String, recoverable: bool },
    Reset,
}

/// Errors that can occur in the sound engine
#[derive(thiserror::Error, Debug, Clone, Eq, PartialEq, Serialize, Deserialize)]
pub enum SoundEngineError {
    #[error("Lexer error: {0}")]
    LexerError(String),

    #[error("Speech synthesis error: {0}")]
    SpeechError(String),

    #[error("Audio context error: {0}")]
    AudioError(String),

    #[error("Invalid state transition: {current_state} -> {event}")]
    InvalidTransition { current_state: String, event: String },

    #[error("Browser not supported: {feature}")]
    BrowserNotSupported { feature: String },
}

/// Configuration for the sound engine
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SoundEngineConfig {
    pub default_voice: VoiceConfig,
    pub default_effect_params: EffectParams,
    pub auto_play: bool,
    pub loop_queue: bool,
}

impl Default for SoundEngineConfig {
    fn default() -> Self {
        Self {
            default_voice: VoiceConfig::default(),
            default_effect_params: EffectParams::default(),
            auto_play: true,
            loop_queue: false,
        }
    }
}

/// Status information for the WASM API
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EngineStatus<'a> {
    pub state_name: &'a str,
    pub is_playing: bool,
    pub queue_length: usize,
    pub current_position: usize,
    pub error_message: Option<&'a str>,
}

impl<'a> EngineStatus<'a> {
    #[allow(dead_code)]
    pub const fn state_name(&self) -> &'a str {
        self.state_name
    }

    #[allow(dead_code)]
    pub const fn is_playing(&self) -> bool {
        self.is_playing
    }

    #[allow(dead_code)]
    pub const fn queue_length(&self) -> usize {
        self.queue_length
    }

    #[allow(dead_code)]
    pub const fn current_position(&self) -> usize {
        self.current_position
    }

    #[allow(dead_code)]
    pub const fn error_message(&self) -> Option<&'a str> {
        self.error_message
    }
}
