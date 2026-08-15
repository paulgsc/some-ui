import type {
  CumulativeStats,
  Layout,
  Outcome,
  Progression,
  SectionProgress,
  Snapshot,
  TypingGameWasm,
  WasmModule,
} from "@leetype/types/leetype"
import {
  CumulativeStatsSchema,
  LayoutSchema,
  OutcomeSchema,
  ProgressionSchema,
  SectionProgressSchema,
  SnapshotSchema,
} from "@leetype/types/leetype"
import { createWasmLoader } from "@some-ui/wasm-loader"
import { z } from "zod"

const loader = createWasmLoader<WasmModule>({
  importModule: async () => {
    try {
      const wasm = await import("@some-ui/leetype-wasm")
      await wasm.default() // Initialize the WASM module
      return wasm
    } catch (error) {
      throw new Error(
        `Failed to load WASM module: ${error instanceof Error ? error.message : String(error)}`,
        { cause: error }
      )
    }
  },
  // Preserves this loader's original throw-on-error contract (unlike
  // polyhedron/hangul's log-and-resolve-null posture).
  errorPolicy: "throw",
})

/**
 * Load the WASM module (singleton pattern)
 */
export async function loadWasm(): Promise<WasmModule> {
  const mod = await loader.load()
  if (mod === null) {
    // Unreachable under the "throw" error policy above (a failed load
    // rejects instead of resolving null) - satisfies the return type.
    throw new Error("Failed to load WASM module: unknown error")
  }
  return mod
}

function requireModule(): WasmModule {
  const wasmModule = loader.peek()
  if (!wasmModule) {
    throw new Error("WASM module not loaded. Call loadWasm() first.")
  }
  return wasmModule
}

/**
 * Type-safe wrapper around the WASM `TypingGame`.
 *
 * Every mutating call returns the `Outcome` the engine produced — the fresh
 * snapshot travels back with the command rather than being fetched
 * separately, so a keystroke is one round trip across the boundary. The
 * per-character maps (`roles`, `slotOfDisplay`, `slotStatus`) come back as
 * typed arrays instead of boxed objects, since the renderer reads them once
 * per frame over the whole chunk.
 */
export class TypedTypingGame {
  private instance: TypingGameWasm
  private listeners = new Set<() => void>()

  constructor(
    targetCode: string,
    maxConsecutiveErrors?: number,
    /**
     * The player's sampled copying speed and its spread. Every threshold in
     * the reveal loop and the gate is a fraction of these; omitting them
     * takes the engine's cold-start stand-in, which is playable.
     */
    baselineWpm?: number,
    dispersionWpm?: number
  ) {
    this.instance = new (requireModule().TypingGame)(
      targetCode,
      maxConsecutiveErrors,
      baselineWpm,
      dispersionWpm
    )
  }

  /** The current chunk's fixed structure: sizes and navigable sections. */
  layout(): Layout {
    return LayoutSchema.parse(this.instance.layout())
  }

  /** Per-rendered-character role: `ROLE_SKIP` or `ROLE_TYPEABLE`. */
  roles(): Uint8Array {
    return this.instance.roles()
  }

  /** Per-rendered-character slot ordinal, `-1` where the char is layout. */
  slotOfDisplay(): Int32Array {
    return this.instance.slot_of_display()
  }

  /** Per-slot status: `SLOT_UNTOUCHED` / `SLOT_CORRECT` / `SLOT_WRONG`. */
  slotStatus(): Uint8Array {
    return this.instance.slot_status()
  }

  /**
   * Per-slot reveal state: `VISIBILITY_MASKED` / `VISIBILITY_REVEALED`.
   *
   * Crosses as a typed array for the same reason `slotStatus` does, and is
   * consumed the same way: the renderer draws what it says. There is no
   * masking policy on this side of the boundary at all.
   */
  visibility(): Uint8Array {
    return this.instance.visibility()
  }

  /** What the runner should do with this step: advance, repeat, or escape. */
  progression(now: number): Progression {
    return ProgressionSchema.parse(this.instance.progression(now))
  }

  snapshot(now: number): Snapshot {
    return SnapshotSchema.parse(this.instance.snapshot(now))
  }

  sectionProgress(): Array<SectionProgress> {
    return z
      .array(SectionProgressSchema)
      .parse(this.instance.section_progress())
  }

  cumulativeStats(): CumulativeStats {
    return CumulativeStatsSchema.parse(this.instance.cumulative_stats())
  }

  start(now: number): Outcome {
    return this.commit(this.instance.start(now))
  }

  press(key: string, now: number): Outcome {
    return this.commit(this.instance.press(key, now))
  }

  backspace(now: number): Outcome {
    return this.commit(this.instance.backspace(now))
  }

  jumpToSlot(slot: number, now: number): Outcome {
    return this.commit(this.instance.jump_to_slot(slot, now))
  }

  jumpToSection(section: number, now: number): Outcome {
    return this.commit(this.instance.jump_to_section(section, now))
  }

  /** Move the caret back to the first slot never resolved. */
  resume(now: number): Outcome {
    return this.commit(this.instance.resume(now))
  }

  dismissAlert(now: number): Outcome {
    return this.commit(this.instance.dismiss_alert(now))
  }

  /**
   * Flip the manual-reveal override: freeze the auto-hide loop open for a
   * bounded duration, or hand control back early if it is already frozen.
   * The keybinding that calls this lives in `use-keystroke-capture`; this
   * method only forwards it to the engine.
   */
  toggleReveal(now: number): Outcome {
    return this.commit(this.instance.toggle_reveal(now))
  }

  /** Clear this chunk's progress, keeping session totals. */
  reset(now: number): Outcome {
    return this.commit(this.instance.reset(now))
  }

  /** Clear everything, including session totals and the clock. */
  resetGame(now: number): Outcome {
    return this.commit(this.instance.reset_game(now))
  }

  /** Fold this chunk's work into the session totals. */
  completeChunk(now: number): Outcome {
    return this.commit(this.instance.complete_chunk(now))
  }

  /** Swap in the next step's source, keeping the session clock running. */
  startNextChunk(newTargetCode: string, now: number): Outcome {
    return this.commit(this.instance.start_next_chunk(newTargetCode, now))
  }

  /** Replay the same source as a fresh attempt — the gate held. */
  retryChunk(now: number): Outcome {
    return this.commit(this.instance.retry_chunk(now))
  }

  /**
   * Advance the reveal loop without a keystroke.
   *
   * Not optional plumbing: the loop's most important input is a player who
   * has *stopped* typing, and a state machine driven only by keystrokes
   * cannot see one.
   */
  tick(now: number): Outcome {
    return this.commit(this.instance.tick(now))
  }

  /** Re-derive every threshold from a fresh sample of the player's speed. */
  calibrate(baselineWpm: number, dispersionWpm: number, now: number): Outcome {
    return this.commit(this.instance.calibrate(baselineWpm, dispersionWpm, now))
  }

  /**
   * Subscribe to engine changes. Returns an unsubscribe function.
   */
  subscribe(callback: () => void): () => void {
    this.listeners.add(callback)
    return (): void => {
      this.listeners.delete(callback)
    }
  }

  free(): void {
    this.listeners.clear()
    this.instance.free()
  }

  /** Validate an outcome at the seam, then wake subscribers. */
  private commit(raw: unknown): Outcome {
    const outcome = OutcomeSchema.parse(raw)
    this.listeners.forEach((listener) => listener())
    return outcome
  }
}

/**
 * Force reload the WASM module. Used by the hook's tests to clear the
 * module-level singleton between cases.
 */
export function resetWasm(): void {
  loader.reset()
}
