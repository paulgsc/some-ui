// Test-only stand-in for the `leetype-wasm` wasm-bindgen crate, which is
// only resolvable after `wasm-pack build` (crates/leetype_wasm) has produced
// its dist/ output. Individual test files override this via
// `vi.mock("leetype-wasm", ...)`; this stub exists purely so the bare
// specifier resolves during transform.
export default async function init(): Promise<void> {}

export class TypingGame {
  start(_timestamp: number): void {}
  reset(): void {}
  handle_input(_input: string): unknown {
    return {}
  }
  get_stats(_currentTimestamp: number): unknown {
    return {}
  }
  get_user_input(): string {
    return ""
  }
  get_target_units(): unknown {
    return []
  }
  get_user_units(): unknown {
    return []
  }
  get_cursor(): unknown {
    return []
  }
  free(): void {}
  complete_chunk(_currentTimestamp: number): unknown {
    return {}
  }
  start_next_chunk(_newTargetCode: string): void {}
  reset_game(): void {}
  get_cumulative_stats(): unknown {
    return [0, 0]
  }
  target_length(): number {
    return 0
  }
}

export function canonicalize_text(_input: string): unknown {
  return []
}

export function build_display_map_from_code(_input: string): Uint32Array {
  // The real binding returns a Uint32Array (validated via
  // `z.instanceof(Uint32Array)` at the call site in leetype-wasm-loader.ts),
  // even though the hand-written .d.ts types it as Array<number>.
  return new Uint32Array()
}
