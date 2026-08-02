//! Shared driver for the integration tests: plays a `TypingGameCore` the
//! way the UI does — one keystroke at a time, never a whole string.
//!
//! Each test binary compiles its own copy of this module, so no single one
//! of them uses the whole driver.
#![allow(dead_code)]

use leetype_wasm::{Command, RevealConfig, TypingGameCore};

/// xorshift64*, so a failure is reproducible from its seed alone and the
/// crate stays dependency-free.
///
/// Deliberately not a `proptest`/`quickcheck` dependency: these properties
/// run in CI at a bounded case count, and a hand-rolled deterministic
/// generator gives that for free while keeping the crate's dependency list
/// at three entries.
pub struct Rng(pub u64);

impl Rng {
    pub fn next(&mut self) -> u64 {
        self.0 ^= self.0 << 13;
        self.0 ^= self.0 >> 7;
        self.0 ^= self.0 << 17;
        self.0
    }

    pub fn below(&mut self, bound: usize) -> usize {
        if bound == 0 {
            return 0;
        }
        usize::try_from(self.next() % bound as u64).unwrap_or(0)
    }

    /// A value in `[0, 1)`.
    pub fn unit(&mut self) -> f64 {
        (self.next() >> 11) as f64 / (1_u64 << 53) as f64
    }
}

/// A keystroke timeline generator: the fixture the whole reveal epic is
/// measured against.
///
/// The reveal loop is a closed-loop controller whose input is a human being,
/// so its failure modes are the ones controllers have — oscillation,
/// runaway, traps — and none of those is reachable by example-based tests.
/// What is reachable is a *model* of a player, parameterised over the four
/// things that actually change the controller's behaviour.
#[derive(Debug, Clone, Copy)]
pub struct Typist {
    /// Mean typing speed.
    pub wpm: f64,
    /// How much each inter-keystroke interval varies, as a fraction of the
    /// mean. `0.0` is a metronome.
    pub jitter: f64,
    /// Probability, per keystroke, of stopping to think.
    pub hesitation_rate: f64,
    /// How long that pause lasts.
    pub hesitation_ms: f64,
    /// Probability a keystroke is the wrong one.
    pub error_rate: f64,
}

impl Typist {
    /// A metronome at `wpm` — the player every convergence property is
    /// stated about.
    pub const fn steady(wpm: f64) -> Self {
        Self {
            wpm,
            jitter: 0.0,
            hesitation_rate: 0.0,
            hesitation_ms: 0.0,
            error_rate: 0.0,
        }
    }

    pub const fn with_jitter(self, jitter: f64) -> Self {
        Self { jitter, ..self }
    }

    pub const fn with_hesitations(self, rate: f64, millis: f64) -> Self {
        Self {
            hesitation_rate: rate,
            hesitation_ms: millis,
            ..self
        }
    }

    pub const fn with_errors(self, rate: f64) -> Self {
        Self { error_rate: rate, ..self }
    }

    /// Milliseconds until this typist's next keystroke.
    pub fn interval_ms(&self, rng: &mut Rng) -> f64 {
        let mean = 60_000.0 / (self.wpm * 5.0);
        let spread = mean * self.jitter * (rng.unit() * 2.0 - 1.0);
        let hesitation = if rng.unit() < self.hesitation_rate { self.hesitation_ms } else { 0.0 };
        (mean + spread).max(1.0) + hesitation
    }

    pub fn mistypes(&self, rng: &mut Rng) -> bool {
        rng.unit() < self.error_rate
    }
}

/// One observation of the reveal loop, taken after every command.
#[derive(Debug, Clone)]
pub struct Frame {
    pub now: f64,
    pub cursor_slot: usize,
    pub reveal_k: usize,
    pub run_count: usize,
    /// Per-slot visibility, `0` masked / `1` revealed.
    pub visibility: Vec<u8>,
}

/// Play one step to completion (or until the clock budget runs out), ticking
/// between keystrokes the way the host does, and record every frame.
///
/// Returns the frames plus the finished core, so a caller can ask the gate
/// what it made of the run.
pub fn play_step(source: &str, typist: Typist, config: RevealConfig, seed: u64, budget_ms: f64) -> (Vec<Frame>, TypingGameCore) {
    let stream: Vec<char> = Player::token_stream(source).chars().collect();
    let mut core = TypingGameCore::new(source, Some(99), Some(config));
    let mut rng = Rng(seed | 1);
    let mut now = 0.0;

    core.dispatch(&Command::Start, now);
    let mut frames = vec![observe(&core, now)];

    while now < budget_ms && !core.snapshot(now).is_complete {
        let interval = typist.interval_ms(&mut rng);

        // Tick roughly every 250ms of the wait, which is what the host does
        // while a step is in flight — a controller that only sees keystrokes
        // cannot see a player who has stopped making them.
        let mut waited = 0.0;
        while waited + 250.0 < interval {
            waited += 250.0;
            now += 250.0;
            core.dispatch(&Command::Tick, now);
            frames.push(observe(&core, now));
        }
        now += interval - waited;

        let cursor = core.snapshot(now).cursor_slot;
        let Some(&expected) = stream.get(cursor) else { break };
        let key = if typist.mistypes(&mut rng) { pick_wrong(expected) } else { expected };

        core.dispatch(&Command::Press { key }, now);
        frames.push(observe(&core, now));
    }

    (frames, core)
}

/// Tick a step without ever touching a key: the idle player.
pub fn idle_step(source: &str, config: RevealConfig, ticks: usize, tick_ms: f64) -> (Vec<Frame>, TypingGameCore) {
    let mut core = TypingGameCore::new(source, Some(99), Some(config));
    let mut now = 0.0;

    core.dispatch(&Command::Start, now);
    let mut frames = vec![observe(&core, now)];

    for _ in 0..ticks {
        now += tick_ms;
        core.dispatch(&Command::Tick, now);
        frames.push(observe(&core, now));
    }

    (frames, core)
}

fn observe(core: &TypingGameCore, now: f64) -> Frame {
    let snapshot = core.snapshot(now);
    Frame {
        now,
        cursor_slot: snapshot.cursor_slot,
        reveal_k: snapshot.reveal_k,
        run_count: snapshot.run_count,
        visibility: core.visibility_codes(),
    }
}

fn pick_wrong(expected: char) -> char {
    // A space would be swallowed as `ExtraSpace` rather than scored, so the
    // wrong key has to be a real character the slot did not want.
    if expected == 'q' {
        'z'
    } else {
        'q'
    }
}

pub struct Player {
    core: TypingGameCore,
    now: f64,
}

impl Player {
    pub fn start(source: &str, max_consecutive_errors: Option<usize>) -> Self {
        let mut core = TypingGameCore::new(source, max_consecutive_errors, None);
        core.dispatch(&Command::Start, 0.0);
        Self { core, now: 0.0 }
    }

    /// The exact keystroke sequence this source demands, in order — the
    /// engine's own answer to "what does the player still owe?".
    pub fn token_stream(source: &str) -> String {
        let core = TypingGameCore::new(source, None, None);
        let roles = core.role_codes();
        source.chars().zip(roles).filter_map(|(ch, role)| (role == 1).then_some(ch)).collect()
    }

    pub fn advance_clock(&mut self, millis: f64) -> &mut Self {
        self.now += millis;
        self
    }

    pub fn send(&mut self, command: &Command) -> leetype_wasm::Outcome {
        self.core.dispatch(command, self.now)
    }

    pub fn press(&mut self, key: char) -> leetype_wasm::Outcome {
        self.send(&Command::Press { key })
    }

    pub fn type_text(&mut self, text: &str) -> &mut Self {
        for key in text.chars() {
            self.press(key);
        }
        self
    }

    pub fn snapshot(&self) -> leetype_wasm::Snapshot {
        self.core.snapshot(self.now)
    }

    pub fn core(&self) -> &TypingGameCore {
        &self.core
    }
}
