import { z } from "zod"

export type GameState = "idle" | "playing" | "finished" | "timeout"

export type DisplayMode = "shown" | "hidden"
export type Language = "typescript" | "rust" | "cpp" | "c"
/**
 * Alternate source-text coloring, swapped in for Prism's syntax-highlight
 * palette — a `text-gradient-*` utility (packages/some-styles/tailwind.css)
 * painted across the not-yet-typed code instead. Options mirror the
 * swatch-driven gradient stops already defined for headings/accents
 * (tokens/base.css's `--gradient-heading` / `--gradient-accent` /
 * `--gradient-muted`), so the same "text is never the flat maximum-contrast
 * color" idiom applies to the code display, not just prose.
 */
export type TextGradient = "none" | "heading" | "accent" | "muted"
export type SessionMode = "data-structure" | "algorithm"
export type Difficulty = "easy" | "medium" | "hard"
export type NContext = "tiny" | "small" | "medium" | "large"

export const N_VALUES: Record<NContext, number> = {
  tiny: 10,
  small: 100,
  medium: 1000,
  large: 10000,
}

export type Challenge = {
  id: string
  title: string
  description: string
  difficulty: Difficulty
  mode: SessionMode
  tags: Array<string>
  codePaths: Record<Language, string>
  levelRequired: number
}

export type CompletedSessionStats = {
  wpm: number
  accuracy: number
  elapsedTime: number
  errors: number
  displayMode: DisplayMode
  wasAdaptive: boolean
  gameState: "finished" | "timeout"
}

export type SolveRecord = {
  challengeId: string
  solvedAt: number
  wpm: number
  accuracy: number
  elapsedTime: number
  errors: number
  n: NContext | null
  displayMode: DisplayMode
  xpEarned: number
}

export type PlayerProgress = {
  xp: number
  level: number
  solves: Array<SolveRecord>
}

export type CodeSample = {
  title: string
  description: string
  code: string
}

export type CodeSamplesMap = {
  [L in Language]: CodeSample
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
// `SLOT_*` decode the per-slot status map. Both cross the boundary as
// typed arrays, so they are numbers rather than strings.

export const ROLE_SKIP = 0
export const ROLE_TYPEABLE = 1

export const SLOT_UNTOUCHED = 0
export const SLOT_CORRECT = 1
export const SLOT_WRONG = 2

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
   * character, or one past the last character when the chunk is done — the
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
  wpm: z.number(),
  elapsedTime: z.number(),
  totalErrors: z.number(),
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
export type ChunkCompletionStats = z.infer<typeof ChunkCompletionStatsSchema>
export type CumulativeStats = z.infer<typeof CumulativeStatsSchema>
export type Outcome = z.infer<typeof OutcomeSchema>

// WASM module interface
export type TypingGameWasm = {
  layout(): unknown
  roles(): Uint8Array
  slot_of_display(): Int32Array
  slot_status(): Uint8Array
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
  reset(now: number): unknown
  reset_game(now: number): unknown
  complete_chunk(now: number): unknown
  start_next_chunk(new_target_code: string, now: number): unknown
  free(): void
}

export type WasmModule = {
  TypingGame: new (
    target_code: string,
    max_consecutive_errors?: number
  ) => TypingGameWasm
  classify_source(input: string): Uint8Array
  slot_map_from_source(input: string): Int32Array
}

export type TypedTypingGame = {
  layout(): Layout
  roles(): Uint8Array
  slotOfDisplay(): Int32Array
  slotStatus(): Uint8Array
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
  reset(now: number): Outcome
  resetGame(now: number): Outcome
  completeChunk(now: number): Outcome
  startNextChunk(newTargetCode: string, now: number): Outcome
  free(): void
}
