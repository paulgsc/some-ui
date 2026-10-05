import { DEFAULT_GAME_CONFIG } from "@honeycomb/lib/hangul/wasm-game-bridge"
import { describe, expect, it } from "vitest"

// Cross-language tripwire for Prop. 2.3: Rust and TypeScript defaults share
// no source, so both this test and `default_matches_typescript_bridge_defaults`
// (crates/hangul-game-core/src/internal/types.rs) pin the same literals.
describe("DEFAULT_GAME_CONFIG matches the Rust GameConfig::default()", () => {
  it("agrees with the Rust default on every field", () => {
    expect(DEFAULT_GAME_CONFIG).toEqual({
      minTimeWindowMs: 1000,
      maxTimeWindowMs: 3000,
      correctnessThresholdMs: 1500,
      speedIncreaseEveryNCorrect: 2,
      timeWindowStepMs: 150,
      hideRomanizationStreak: 5,
      pointsPerCorrect: 10,
      pointsPerMiss: -5,
      streakBonusDivisor: 5,
      gameDurationMs: 180000,
      bufferTimeoutMs: 400,
    })
  })
})
