import { z } from "zod"

export type GameState = "idle" | "playing" | "finished"

export type Language = "typescript" | "rust" | "cpp" | "c"
/**
 * Alternate source-text coloring, swapped in for Prism's syntax-highlight
 * palette — a `text-gradient-*` utility (packages/some-styles/tailwind.css)
 * painted across the not-yet-typed code instead. Options mirror the
 * swatch-driven gradient stops already defined for headings/accents
 * (tokens/base.css's `--gradient-heading` / `--gradient-accent` /
 * `--gradient-muted`), so the same "text is never the flat maximum-contrast
 * color" idiom applies to the code display, not just prose.
 *
 * Cosmetic and story-independent: it survived the prune because it costs
 * nothing, and it is a host prop rather than a menu because the new session
 * flow has no menus in it.
 */
export type TextGradient = "none" | "heading" | "accent" | "muted"

/** What a finished exercise reports. */
export type CompletedSessionStats = {
  /** Cumulative WPM across the whole run. */
  wpm: number
  accuracy: number
  /** Seconds, across every step. */
  elapsedTime: number
  errors: number
  stepsCompleted: number
  /**
   * Steps the gate let through only because the attempts ran out. Worth
   * reporting: it is the honest record of where the player was carried.
   */
  stepsEscaped: number
  /** Mean fraction of each step's resolved slots that were revealed, 0–1. */
  assistance: number
}

// ── Engine vocabulary ─────────────────────────────────────────────────────
//
// The engine talks in two coordinate systems and it matters which one you
// are holding:
//
//   display index — an index into the *rendered* source, every character
//                   included, indentation and newlines and all.
//   slot          — an index into the *typeable stream*: the subsequence of
//                   rendered characters the player actually presses a key
//                   for. Layout whitespace has a display index but no slot,
//                   which is exactly what lets the caret fly over
//                   indentation while still sitting on a real character.
//
// `ROLE_TYPEABLE`/`ROLE_SKIP` decode the per-display-character role map;
// `SLOT_*` decode the per-slot status map; `VISIBILITY_*` decode the
// per-slot reveal map. All three cross the boundary as typed arrays, so they
// are numbers rather than strings.

export const ROLE_SKIP = 0
export const ROLE_TYPEABLE = 1

export const SLOT_UNTOUCHED = 0
export const SLOT_CORRECT = 1
export const SLOT_WRONG = 2

/**
 * Per-slot reveal state, projected by the engine's control loop. The
 * renderer draws what this says and owns no masking policy of its own —
 * there is no `displayMode` prop and no React state anywhere describing
 * whether code is hidden.
 */
export const VISIBILITY_MASKED = 0
export const VISIBILITY_REVEALED = 1

/**
 * `Option<T>` crosses the wasm-bindgen boundary as `undefined`, but every
 * consumer here wants a plain nullable — normalizing once at the seam beats
 * spelling `?? null` at each call site.
 */
const nullableNumber = z
  .number()
  .nullish()
  .transform((value): number | null => value ?? null)

// Zod schemas matching the Rust projections in crates/leetype_wasm.
export const SectionSchema = z.object({
  index: z.number(),
  label: z.string(),
  startLine: z.number(),
  endLine: z.number(),
  startSlot: z.number(),
  endSlot: z.number(),
  startDisplay: z.number(),
})

export const LayoutSchema = z.object({
  displayLen: z.number(),
  slotCount: z.number(),
  sections: z.array(SectionSchema),
})

export const SnapshotSchema = z.object({
  cursorSlot: z.number(),
  /**
   * Where the caret sits in the *rendered* source. Always a typeable
   * character, or one past the last character when the step is done — the
   * engine guarantees it never lands inside indentation.
   */
  cursorDisplay: z.number(),
  cursorSection: nullableNumber,
  slotCount: z.number(),
  filled: z.number(),
  correct: z.number(),
  firstGapSlot: nullableNumber,
  progress: z.number(),
  accuracy: z.number(),
  /** Cumulative WPM — the figure the player is shown. */
  wpm: z.number(),
  /**
   * Instantaneous, windowed WPM — what drives the reveal window. Volatile by
   * design; that volatility is the signal.
   */
  instantWpm: z.number(),
  /**
   * Rate discounted by assistance taken and accuracy. The gate reads this
   * one and nothing else.
   */
  weightedWpm: z.number(),
  /**
   * What `weightedWpm` has to reach to leave this step — a fraction of the
   * player's own sampled baseline, never a constant.
   */
  gateThreshold: z.number(),
  /** Which attempt at this step this is, zero-based. */
  attempt: z.number(),
  /** Runs ahead of the caret currently unmasked. `0` is fully masked. */
  revealK: z.number(),
  /** Reveal units the step holds in total. */
  runCount: z.number(),
  /**
   * Whether a manual-reveal toggle currently has the auto-hide loop frozen
   * open. Drives the toggle's visual ergonomic effect; there is no
   * client-side masking policy behind it, same posture as `visibility`.
   */
  manualRevealActive: z.boolean(),
  /**
   * Fraction of the manual-reveal freeze window still remaining, `1` at the
   * instant of toggling down to `0` once it lifts. Always `0` when
   * `manualRevealActive` is `false`.
   */
  manualRevealFraction: z.number(),
  /** Correctly-resolved slots the player could see when they resolved them. */
  assisted: z.number(),
  /** Seconds this step has been in flight; restarts on every step. */
  elapsedTime: z.number(),
  /** Seconds since the session began, continuous across steps. */
  sessionElapsedTime: z.number(),
  /** Lifetime tally of wrong keystrokes, corrected ones included. */
  totalErrors: z.number(),
  /**
   * How far the caret has run past its earliest *uncorrected* mistake — a
   * distance back to the divergence, not a count of wrong slots. A correct
   * character typed while already diverged extends this (the player is still
   * misaligned) without adding to `totalErrors`. Zero means aligned.
   */
  consecutiveErrors: z.number(),
  showErrorAlert: z.boolean(),
  isComplete: z.boolean(),
  started: z.boolean(),
})

export const SectionProgressSchema = z.object({
  index: z.number(),
  slotCount: z.number(),
  filled: z.number(),
  correct: z.number(),
})

export const RejectionSchema = z.enum([
  "extraSpace",
  "errorCeiling",
  "nothingPending",
  "notTypeable",
])

/**
 * What the engine says should happen to a step the player just finished.
 * `escape` is the repeat cap letting them past — the guarantee that an
 * exercise always terminates.
 */
export const ProgressionSchema = z.enum(["advance", "repeat", "escape"])

export const ChunkCompletionStatsSchema = z.object({
  charsTyped: z.number(),
  errors: z.number(),
  elapsedTime: z.number(),
})

export const CumulativeStatsSchema = z.object({
  charsTyped: z.number(),
  errors: z.number(),
})

export const OutcomeSchema = z.object({
  accepted: z.boolean(),
  rejection: RejectionSchema.nullish().transform(
    (value): Rejection | null => value ?? null
  ),
  chunk: ChunkCompletionStatsSchema.nullish().transform(
    (value): ChunkCompletionStats | null => value ?? null
  ),
  snapshot: SnapshotSchema,
})

export type Section = z.infer<typeof SectionSchema>
export type Layout = z.infer<typeof LayoutSchema>
export type Snapshot = z.infer<typeof SnapshotSchema>
export type SectionProgress = z.infer<typeof SectionProgressSchema>
export type Rejection = z.infer<typeof RejectionSchema>
export type Progression = z.infer<typeof ProgressionSchema>
export type ChunkCompletionStats = z.infer<typeof ChunkCompletionStatsSchema>
export type CumulativeStats = z.infer<typeof CumulativeStatsSchema>
export type Outcome = z.infer<typeof OutcomeSchema>

// WASM module interface
export type TypingGameWasm = {
  layout(): unknown
  roles(): Uint8Array
  slot_of_display(): Int32Array
  slot_status(): Uint8Array
  visibility(): Uint8Array
  progression(now: number): unknown
  snapshot(now: number): unknown
  section_progress(): unknown
  cumulative_stats(): unknown
  start(now: number): unknown
  press(key: string, now: number): unknown
  backspace(now: number): unknown
  jump_to_slot(slot: number, now: number): unknown
  jump_to_section(section: number, now: number): unknown
  resume(now: number): unknown
  dismiss_alert(now: number): unknown
  toggle_reveal(now: number): unknown
  reset(now: number): unknown
  reset_game(now: number): unknown
  complete_chunk(now: number): unknown
  start_next_chunk(new_target_code: string, now: number): unknown
  retry_chunk(now: number): unknown
  tick(now: number): unknown
  calibrate(baseline_wpm: number, dispersion_wpm: number, now: number): unknown
  free(): void
}

export type WasmModule = {
  TypingGame: new (
    target_code: string,
    max_consecutive_errors?: number,
    baseline_wpm?: number,
    dispersion_wpm?: number
  ) => TypingGameWasm
  classify_source(input: string): Uint8Array
  slot_map_from_source(input: string): Int32Array
}

export type TypedTypingGame = {
  layout(): Layout
  roles(): Uint8Array
  slotOfDisplay(): Int32Array
  slotStatus(): Uint8Array
  visibility(): Uint8Array
  progression(now: number): Progression
  snapshot(now: number): Snapshot
  sectionProgress(): Array<SectionProgress>
  cumulativeStats(): CumulativeStats
  start(now: number): Outcome
  press(key: string, now: number): Outcome
  backspace(now: number): Outcome
  jumpToSlot(slot: number, now: number): Outcome
  jumpToSection(section: number, now: number): Outcome
  resume(now: number): Outcome
  dismissAlert(now: number): Outcome
  toggleReveal(now: number): Outcome
  reset(now: number): Outcome
  resetGame(now: number): Outcome
  completeChunk(now: number): Outcome
  startNextChunk(newTargetCode: string, now: number): Outcome
  retryChunk(now: number): Outcome
  tick(now: number): Outcome
  calibrate(baselineWpm: number, dispersionWpm: number, now: number): Outcome
  free(): void
}
