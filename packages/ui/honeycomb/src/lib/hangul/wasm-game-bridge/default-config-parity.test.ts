import { DEFAULT_GAME_CONFIG } from "@honeycomb/lib/hangul/wasm-game-bridge"
import { describe, expect, it } from "vitest"

// Cross-language tripwire for Prop. 2.3 (crates/hangul-game-core/docs/
// hangul-progression-canon.typ): the Rust and TypeScript defaults have no
// shared source, so this test pins every field to the literal values
// `default_matches_typescript_bridge_defaults`
// (crates/hangul-game-core/src/internal/types.rs) also asserts against
// itself. Changing either default without updating both tests leaves this
// one failing.
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
