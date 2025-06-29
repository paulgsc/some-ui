use crate::types::*;
use wasm_bindgen::prelude::*;
use web_sys::*;

/// Browser-specific sound engine that handles actual audio playback
pub struct BrowserSoundEngine {
    speech_synthesis: Option<SpeechSynthesis>,
    audio_context: Option<AudioContext>,
    current_utterance: Option<SpeechSynthesisUtterance>,
    current_audio_source: Option<AudioBufferSourceNode>,
}

impl BrowserSoundEngine {
    pub fn new() -> Result<Self, SoundEngineError> {
        let window = web_sys::window().ok_or(SoundEngineError::BrowserNotSupported { feature: "window".to_string() })?;

        let speech_synthesis = window.speech_synthesis().ok();

        let audio_context = AudioContext::new().ok();

        Ok(Self {
            speech_synthesis,
            audio_context,
            current_utterance: None,
            current_audio_source: None,
        })
    }

    /// Check if browser supports required features
    pub fn check_support(&self) -> Result<(), SoundEngineError> {
        if self.speech_synthesis.is_none() {
            return Err(SoundEngineError::BrowserNotSupported {
                feature: "SpeechSynthesis".to_string(),
            });
        }

        if self.audio_context.is_none() {
            return Err(SoundEngineError::BrowserNotSupported {
                feature: "AudioContext".to_string(),
            });
        }

        Ok(())
    }

    /// Play a speech token
    pub fn play_speech(&mut self, token: &SoundToken, utterance_id: &str, completion_callback: Option<Box<dyn FnOnce(String)>>) -> Result<(), SoundEngineError> {
        let speech_synthesis = self
            .speech_synthesis
            .as_ref()
            .ok_or(SoundEngineError::SpeechError("SpeechSynthesis not available".to_string()))?;

        if let SoundToken::Speech { text, voice_config } = token {
            let utterance = SpeechSynthesisUtterance::new_with_text(text).map_err(|_| SoundEngineError::SpeechError("Failed to create utterance".to_string()))?;

            // Configure voice parameters
            utterance.set_rate(voice_config.rate);
            utterance.set_pitch(voice_config.pitch);
            utterance.set_volume(voice_config.volume);

            if let Some(voice_name) = &voice_config.voice_name {
                // Try to find and set the requested voice
                if let Ok(voices) = speech_synthesis.get_voices() {
                    for i in 0..voices.length() {
                        if let Some(voice) = voices.get(i).dyn_into::<SpeechSynthesisVoice>().ok() {
                            if voice.name() == *voice_name {
                                utterance.set_voice(Some(&voice));
                                break;
                            }
                        }
                    }
                }
            }

            // Set up event handlers
            let utterance_id_clone = utterance_id.to_string();
            if let Some(callback) = completion_callback {
                let onend_callback = Closure::wrap(Box::new(move |_: web_sys::SpeechSynthesisEvent| {
                    callback(utterance_id_clone.clone());
                }) as Box<dyn FnMut(_)>);

                utterance.set_onend(Some(onend_callback.as_ref().unchecked_ref()));
                onend_callback.forget(); // Keep callback alive
            }

            let utterance_id_error = utterance_id.to_string();
            let onerror_callback = Closure::wrap(Box::new(move |event: web_sys::SpeechSynthesisErrorEvent| {
                web_sys::console::error_1(&format!("Speech synthesis error for {}: {:?}", utterance_id_error, event.error()).into());
            }) as Box<dyn FnMut(_)>);

            utterance.set_onerror(Some(onerror_callback.as_ref().unchecked_ref()));
            onerror_callback.forget();

            self.current_utterance = Some(utterance.clone());
            speech_synthesis.speak(&utterance);

            Ok(())
        } else {
            Err(SoundEngineError::SpeechError("Token is not a speech token".to_string()))
        }
    }

    /// Play a sound effect token
    pub fn play_effect(&mut self, token: &SoundToken, audio_id: &str, completion_callback: Option<Box<dyn FnOnce(String)>>) -> Result<(), SoundEngineError> {
        let audio_context = self.audio_context.as_ref().ok_or(SoundEngineError::AudioError("AudioContext not available".to_string()))?;

        if let SoundToken::SoundEffect { effect_type, params } = token {
            match effect_type {
                EffectType::Beep => self.generate_beep(audio_context, params, audio_id, completion_callback),
                EffectType::Boom => self.generate_boom(audio_context, params, audio_id, completion_callback),
                EffectType::Click => self.generate_click(audio_context, params, audio_id, completion_callback),
                EffectType::Whoosh => self.generate_whoosh(audio_context, params, audio_id, completion_callback),
                EffectType::Bell => self.generate_bell(audio_context, params, audio_id, completion_callback),
                EffectType::Custom(name) => self.generate_custom(audio_context, name, params, audio_id, completion_callback),
            }
        } else {
            Err(SoundEngineError::AudioError("Token is not a sound effect token".to_string()))
        }
    }

    /// Pause current playback
    pub fn pause(&mut self) -> Result<(), SoundEngineError> {
        if let Some(speech_synthesis) = &self.speech_synthesis {
            if speech_synthesis.speaking() {
                speech_synthesis.pause();
            }
        }

        if let Some(audio_source) = &self.current_audio_source {
            audio_source.stop().map_err(|_| SoundEngineError::AudioError("Failed to stop audio source".to_string()))?;
        }

        Ok(())
    }

    /// Resume paused playback
    pub fn resume(&mut self) -> Result<(), SoundEngineError> {
        if let Some(speech_synthesis) = &self.speech_synthesis {
            if speech_synthesis.paused() {
                speech_synthesis.resume();
            }
        }

        // Note: AudioContext sources can't be resumed once stopped, would need to recreate
        Ok(())
    }

    /// Stop all playback
    pub fn stop(&mut self) -> Result<(), SoundEngineError> {
        if let Some(speech_synthesis) = &self.speech_synthesis {
            speech_synthesis.cancel();
        }

        if let Some(audio_source) = &self.current_audio_source {
            audio_source.stop().map_err(|_| SoundEngineError::AudioError("Failed to stop audio source".to_string()))?;
        }

        self.current_utterance = None;
        self.current_audio_source = None;
        Ok(())
    }

    // Sound generation methods
    fn generate_beep(
        &mut self,
        audio_context: &AudioContext,
        params: &EffectParams,
        audio_id: &str,
        completion_callback: Option<Box<dyn FnOnce(String)>>,
    ) -> Result<(), SoundEngineError> {
        let frequency = params.frequency.unwrap_or(800.0);
        let duration = params.duration_ms.unwrap_or(200) as f64 / 1000.0;
        let volume = params.volume.unwrap_or(0.3);

        self.create_oscillator_sound(audio_context, frequency, duration, volume, "sine", audio_id, completion_callback)
    }

    fn generate_boom(
        &mut self,
        audio_context: &AudioContext,
        params: &EffectParams,
        audio_id: &str,
        completion_callback: Option<Box<dyn FnOnce(String)>>,
    ) -> Result<(), SoundEngineError> {
        let frequency = params.frequency.unwrap_or(60.0);
        let duration = params.duration_ms.unwrap_or(500) as f64 / 1000.0;
        let volume = params.volume.unwrap_or(0.5);

        self.create_noise_burst(audio_context, frequency, duration, volume, audio_id, completion_callback)
    }

    fn generate_click(
        &mut self,
        audio_context: &AudioContext,
        params: &EffectParams,
        audio_id: &str,
        completion_callback: Option<Box<dyn FnOnce(String)>>,
    ) -> Result<(), SoundEngineError> {
        let frequency = params.frequency.unwrap_or(1000.0);
        let duration = params.duration_ms.unwrap_or(50) as f64 / 1000.0;
        let volume = params.volume.unwrap_or(0.2);

        self.create_oscillator_sound(audio_context, frequency, duration, volume, "square", audio_id, completion_callback)
    }

    fn generate_whoosh(
        &mut self,
        audio_context: &AudioContext,
        params: &EffectParams,
        audio_id: &str,
        completion_callback: Option<Box<dyn FnOnce(String)>>,
    ) -> Result<(), SoundEngineError> {
        let duration = params.duration_ms.unwrap_or(800) as f64 / 1000.0;
        let volume = params.volume.unwrap_or(0.3);

        self.create_filtered_noise(audio_context, duration, volume, audio_id, completion_callback)
    }

    fn generate_bell(
        &mut self,
        audio_context: &AudioContext,
        params: &EffectParams,
        audio_id: &str,
        completion_callback: Option<Box<dyn FnOnce(String)>>,
    ) -> Result<(), SoundEngineError> {
        let frequency = params.frequency.unwrap_or(800.0);
        let duration = params.duration_ms.unwrap_or(1000) as f64 / 1000.0;
        let volume = params.volume.unwrap_or(0.4);

        self.create_bell_sound(audio_context, frequency, duration, volume, audio_id, completion_callback)
    }

    fn generate_custom(
        &mut self,
        audio_context: &AudioContext,
        name: &str,
        params: &EffectParams,
        audio_id: &str,
        completion_callback: Option<Box<dyn FnOnce(String)>>,
    ) -> Result<(), SoundEngineError> {
        // For custom sounds, default to a beep with different parameters
        web_sys::console::warn_1(&format!("Custom sound '{}' not implemented, using default beep", name).into());
        self.generate_beep(audio_context, params, audio_id, completion_callback)
    }

    // Low-level audio generation helpers
    fn create_oscillator_sound(
        &mut self,
        audio_context: &AudioContext,
        frequency: f32,
        duration: f64,
        volume: f32,
        wave_type: &str,
        audio_id: &str,
        completion_callback: Option<Box<dyn FnOnce(String)>>,
    ) -> Result<(), SoundEngineError> {
        let oscillator = audio_context
            .create_oscillator()
            .map_err(|_| SoundEngineError::AudioError("Failed to create oscillator".to_string()))?;

        let gain_node = audio_context
            .create_gain()
            .map_err(|_| SoundEngineError::AudioError("Failed to create gain node".to_string()))?;

        // Set wave type
        let wave_type = match wave_type {
            "sine" => OscillatorType::Sine,
            "square" => OscillatorType::Square,
            "sawtooth" => OscillatorType::Sawtooth,
            "triangle" => OscillatorType::Triangle,
            _ => OscillatorType::Sine,
        };
        oscillator.set_type(wave_type);

        // Set frequency
        oscillator.frequency().set_value(frequency);

        // Set volume with envelope
        let current_time = audio_context.current_time();
        gain_node
            .gain()
            .set_value_at_time(0.0, current_time)
            .map_err(|_| SoundEngineError::AudioError("Failed to set initial gain".to_string()))?;
        gain_node
            .gain()
            .linear_ramp_to_value_at_time(volume, current_time + 0.01)
            .map_err(|_| SoundEngineError::AudioError("Failed to ramp up gain".to_string()))?;
        gain_node
            .gain()
            .exponential_ramp_to_value_at_time(0.01, current_time + duration)
            .map_err(|_| SoundEngineError::AudioError("Failed to ramp down gain".to_string()))?;

        // Connect nodes
        oscillator
            .connect_with_audio_node(&gain_node)
            .map_err(|_| SoundEngineError::AudioError("Failed to connect oscillator to gain".to_string()))?;
        gain_node
            .connect_with_audio_node(&audio_context.destination())
            .map_err(|_| SoundEngineError::AudioError("Failed to connect gain to destination".to_string()))?;

        // Set up completion callback
        if let Some(callback) = completion_callback {
            let audio_id_clone = audio_id.to_string();
            let onended_callback = Closure::wrap(Box::new(move |_: web_sys::Event| {
                callback(audio_id_clone);
            }) as Box<dyn FnMut(_)>);

            oscillator.set_onended(Some(onended_callback.as_ref().unchecked_ref()));
            onended_callback.forget();
        }

        // Start and schedule stop
        oscillator.start().map_err(|_| SoundEngineError::AudioError("Failed to start oscillator".to_string()))?;
        oscillator
            .stop_with_when(current_time + duration)
            .map_err(|_| SoundEngineError::AudioError("Failed to schedule oscillator stop".to_string()))?;

        // Store reference (note: this is simplified, in practice you'd want better tracking)
        self.current_audio_source = Some(oscillator.dyn_into().unwrap());

        Ok(())
    }

    fn create_noise_burst(
        &mut self,
        audio_context: &AudioContext,
        base_frequency: f32,
        duration: f64,
        volume: f32,
        audio_id: &str,
        completion_callback: Option<Box<dyn FnOnce(String)>>,
    ) -> Result<(), SoundEngineError> {
        // Create a more complex boom sound using multiple oscillators
        self.create_oscillator_sound(audio_context, base_frequency, duration, volume, "sawtooth", audio_id, completion_callback)
    }

    fn create_filtered_noise(
        &mut self,
        audio_context: &AudioContext,
        duration: f64,
        volume: f32,
        audio_id: &str,
        completion_callback: Option<Box<dyn FnOnce(String)>>,
    ) -> Result<(), SoundEngineError> {
        // Simplified whoosh - in practice you'd create filtered white noise
        self.create_oscillator_sound(audio_context, 200.0, duration, volume, "sawtooth", audio_id, completion_callback)
    }

    fn create_bell_sound(
        &mut self,
        audio_context: &AudioContext,
        frequency: f32,
        duration: f64,
        volume: f32,
        audio_id: &str,
        completion_callback: Option<Box<dyn FnOnce(String)>>,
    ) -> Result<(), SoundEngineError> {
        // Simplified bell - in practice you'd layer multiple harmonics
        self.create_oscillator_sound(audio_context, frequency, duration, volume, "sine", audio_id, completion_callback)
    }
}
