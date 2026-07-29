import type {
  CumulativeStats,
  Layout,
  Outcome,
  SectionProgress,
  Snapshot,
  TypingGameWasm,
  WasmModule,
} from "@leetype/types/leetype"
import {
  CumulativeStatsSchema,
  LayoutSchema,
  OutcomeSchema,
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

  constructor(targetCode: string, maxConsecutiveErrors?: number) {
    this.instance = new (requireModule().TypingGame)(
      targetCode,
      maxConsecutiveErrors
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

  /** Swap in the next chunk of source, keeping the clock running. */
  startNextChunk(newTargetCode: string, now: number): Outcome {
    return this.commit(this.instance.start_next_chunk(newTargetCode, now))
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
 * Classify a source string's rendered characters without constructing a
 * game — `ROLE_SKIP` for layout the caret jumps over, `ROLE_TYPEABLE` for
 * characters the player owes a keystroke.
 */
export function classifySource(input: string): Uint8Array {
  return requireModule().classify_source(input)
}

/**
 * Map each rendered character of a source string to its slot ordinal, `-1`
 * where the character is layout the player never types.
 */
export function slotMapFromSource(input: string): Int32Array {
  return requireModule().slot_map_from_source(input)
}

/**
 * Check if WASM is loaded
 */
export function isWasmLoaded(): boolean {
  return loader.isLoaded()
}

/**
 * Force reload the WASM module (useful for testing)
 */
export function resetWasm(): void {
  loader.reset()
}
