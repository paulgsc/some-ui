/**
 * The three files every Rust Rounds tutor writes to and the phone reads
 * (paulgsc/some-ui#2231, #2232). No tutor holds memory of its own, so these
 * files are the whole contract: any agent can pick up where the last stopped.
 *
 * - `some-ui.rust-round/1`, a round of cards, goes down to the phone.
 * - `some-ui.rust-round-log/1`, what happened, goes up to the tutor.
 * - `some-ui.rust-tutor-notes/1`, the open and smoothed rough edges per
 *   concept, travels with every round.
 *
 * `ROUTINE.md` (beside `package.json`) describes them for a tutor, field by
 * field; a test holds it to naming every field these schemas have.
 *
 * Every object is strict: a key the format does not name is refused, so a
 * `correct` on a choice or a `rubric` on a card never gets in. The app
 * grades nothing.
 */
import { assertNever } from "@some-ui/core-utils"
import { z } from "zod"

export const ROUND_SCHEMA = "some-ui.rust-round/1"
export const LOG_SCHEMA = "some-ui.rust-round-log/1"
export const NOTES_SCHEMA = "some-ui.rust-tutor-notes/1"

/** Lower-case words joined by `-`: round, card, concept and edge ids. */
const SlugSchema = z
  .string()
  .regex(
    /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
    "use lower-case letters, digits and single hyphens (like indexing-01)"
  )

/** A voice note's id, as home names it. Only safe characters: it is quoted into markdown. */
const NoteIdSchema = z
  .string()
  .regex(
    /^[A-Za-z0-9._:-]{1,128}$/,
    "a note id is 1-128 letters, digits, '.', '_', ':' or '-'"
  )

/** Text with something in it. Kept as written: a program's whitespace is part of it. */
const TextSchema = z
  .string()
  .refine((text) => text.trim() !== "", "must not be empty")

const WhenSchema = z.iso.datetime({ offset: true })

/** rustc's error code, like `E0277`; null for an error rustc gives no code. */
const ErrorCodeSchema = z
  .string()
  .regex(/^E\d{4}$/, "an error code looks like E0277")
  .nullable()

// ── The round ──────────────────────────────────────────────────────────────

/**
 * The tutor's guess at what rustc does with a card's program. It is never
 * shown as a verdict; a guess that differs from the recorded run is logged
 * (`tutorGuessedWrong`) so the tutor can learn from it.
 */
const ExpectSchema = z.discriminatedUnion("outcome", [
  z.strictObject({
    outcome: z.literal("compile-error"),
    code: ErrorCodeSchema,
  }),
  z.strictObject({ outcome: z.literal("prints"), stdout: z.string() }),
  z.strictObject({ outcome: z.literal("panics") }),
])
export type Expect = z.infer<typeof ExpectSchema>

/**
 * One option on a card. Picking it chooses the sentence the owner is asked
 * to say; it is never scored. "Not sure" is an ordinary choice.
 */
const ChoiceSchema = z.strictObject({
  pick: TextSchema,
  say: z.string({
    error:
      "every choice needs its `say`: the sentence picking it asks the owner to say",
  }),
})
export type Choice = z.infer<typeof ChoiceSchema>

const ChoicesSchema = z
  .array(ChoiceSchema)
  .min(2, "a card offers 2 to 4 choices")
  .max(4, "a card offers 2 to 4 choices")

/** A toy binary on its own. */
const ReadCardSchema = z.strictObject({
  kind: z.literal("read"),
  id: SlugSchema,
  program: TextSchema,
  ask: TextSchema,
  choices: ChoicesSchema,
  expect: ExpectSchema,
})

/** One line of an earlier card's program, replaced. */
const HunkSchema = z.strictObject({
  /** 1-based, in the program of the card named by `of`. */
  line: z.int().positive(),
  /** The whole new line. One line: it holds no newline. */
  replace: z
    .string()
    .refine(
      (text) => !/[\r\n]/.test(text),
      "`replace` is one whole line: no newline"
    ),
})
export type Hunk = z.infer<typeof HunkSchema>

/** The program of an earlier card (`of`), with one line changed. */
const VariantCardSchema = z.strictObject({
  kind: z.literal("variant"),
  id: SlugSchema,
  of: SlugSchema,
  hunk: HunkSchema,
  ask: TextSchema,
  choices: ChoicesSchema,
  expect: ExpectSchema,
})

/** Revised Bloom, low to high. Shown only inside a refine card's prompt. */
export const BLOOM_STEPS = [
  "remember",
  "understand",
  "apply",
  "analyze",
  "evaluate",
  "create",
] as const

/** An earlier voice note, the tutor's nudge, and a new take. */
const RefineCardSchema = z.strictObject({
  kind: z.literal("refine"),
  id: SlugSchema,
  note: NoteIdSchema,
  nudge: TextSchema,
  aim: z.enum(BLOOM_STEPS),
  say: TextSchema,
})

const CardSchema = z.discriminatedUnion("kind", [
  ReadCardSchema,
  VariantCardSchema,
  RefineCardSchema,
])
export type Card = z.infer<typeof CardSchema>
export type ReadCard = z.infer<typeof ReadCardSchema>
export type VariantCard = z.infer<typeof VariantCardSchema>
export type RefineCard = z.infer<typeof RefineCardSchema>

/** Each id at most once, so a `variant`'s `of` and the log name one thing. */
function uniqueIds(
  items: ReadonlyArray<string>,
  ctx: z.RefinementCtx,
  path: (index: number) => Array<string | number>,
  what: string
): void {
  const seen = new Set<string>()
  items.forEach((id, index) => {
    if (seen.has(id)) {
      ctx.addIssue({
        code: "custom",
        path: path(index),
        message: `${what} "${id}" is used twice; ids are unique`,
      })
    }
    seen.add(id)
  })
}

export const RoundSchema = z
  .strictObject({
    schema: z.literal(ROUND_SCHEMA),
    /** Unique across rounds, never reused: `<concept>-NN`. */
    id: SlugSchema,
    /** Which tutor wrote it: `claude-routine`, `chatgpt`, … */
    by: TextSchema,
    concept: SlugSchema,
    /** The rough edges it targets, by the tutor notes' `edge` ids. */
    edges: z.array(SlugSchema),
    cards: z.array(CardSchema).min(1, "a round has at least one card"),
  })
  .superRefine((round, ctx) =>
    uniqueIds(
      round.cards.map((card) => card.id),
      ctx,
      (index) => ["cards", index, "id"],
      "card id"
    )
  )
export type Round = z.infer<typeof RoundSchema>

// ── What rustc did ─────────────────────────────────────────────────────────

/** rustc's primary span, 1-based, as its JSON diagnostics give it. */
const SpanSchema = z.strictObject({
  line: z.int().positive(),
  column: z.int().positive(),
  endLine: z.int().positive(),
  endColumn: z.int().positive(),
})

/** The toolchain that recorded the run, like `1.97.0`. Messages change between versions. */
const ToolchainSchema = TextSchema

/**
 * One recorded run of a card's program, by home (RR3, paulgsc/server): the
 * authority on what rustc did. Text is exactly as printed.
 *
 * - `compile-error`: rustc refused it; `stderr` is every diagnostic it
 *   printed, `code` the first error's code, `span` its primary span.
 * - `prints`: it compiled, ran and exited 0; `stdout` is what it printed.
 * - `panics`: it compiled and panicked (exit 101); `stderr` holds the panic.
 * - `stopped`: it compiled and the sandbox ended it, or it exited some other
 *   way: a time, memory or output limit, or another exit code (`exit`).
 */
export const RustcRunSchema = z.discriminatedUnion("outcome", [
  z.strictObject({
    outcome: z.literal("compile-error"),
    toolchain: ToolchainSchema,
    code: ErrorCodeSchema,
    stderr: z.string(),
    span: SpanSchema.nullable(),
  }),
  z.strictObject({
    outcome: z.literal("prints"),
    toolchain: ToolchainSchema,
    stdout: z.string(),
  }),
  z.strictObject({
    outcome: z.literal("panics"),
    toolchain: ToolchainSchema,
    stdout: z.string(),
    stderr: z.string(),
  }),
  z.strictObject({
    outcome: z.literal("stopped"),
    toolchain: ToolchainSchema,
    why: z.enum(["time", "memory", "output", "exit"]),
    stdout: z.string(),
    stderr: z.string(),
  }),
])
export type RustcRun = z.infer<typeof RustcRunSchema>

// ── The log ────────────────────────────────────────────────────────────────

const CardRefSchema = z.strictObject({ round: SlugSchema, card: SlugSchema })
export type CardRef = z.infer<typeof CardRefSchema>

/** One card, as it went. Notes are named by id: the log never holds audio. */
const CardEventSchema = z.strictObject({
  round: SlugSchema,
  card: SlugSchema,
  at: WhenSchema,
  /** The `pick` of the choice taken, as shown; null when none was. */
  picked: z.string().nullable(),
  /** The voice note said on this card; null when nothing was said. */
  note: NoteIdSchema.nullable(),
  /** Moved on before rustc's result was shown. */
  skipped: z.boolean(),
  /** The recorded run shown; null when none was held for the card. */
  rustc: RustcRunSchema.nullable(),
})
export type CardEvent = z.infer<typeof CardEventSchema>

/** An error the owner pasted from their own code, and what they said about it. */
const DeskPasteSchema = z.strictObject({
  at: WhenSchema,
  pasted: TextSchema,
  note: NoteIdSchema.nullable(),
})

/**
 * One opening of the app. It has a start and no end: leaving is not
 * finishing, and nothing here counts as one.
 */
const SessionSchema = z.strictObject({
  id: TextSchema,
  startedAt: WhenSchema,
  cards: z.array(CardEventSchema),
  pinned: z.array(CardRefSchema),
  fromMyDesk: z.array(DeskPasteSchema),
  tutorGuessedWrong: z.array(CardRefSchema),
})
export type Session = z.infer<typeof SessionSchema>

export const RoundLogSchema = z.strictObject({
  schema: z.literal(LOG_SCHEMA),
  sessions: z.array(SessionSchema),
})
export type RoundLog = z.infer<typeof RoundLogSchema>

// ── The tutor notes ────────────────────────────────────────────────────────

/** A rough edge: where the owner's words and the compiler's model come apart. */
const EdgeSchema = z.strictObject({
  edge: SlugSchema,
  /** The gap, in rustc's own terms. */
  what: TextSchema,
  /** The voice notes that showed it. */
  notes: z.array(NoteIdSchema),
})
export type Edge = z.infer<typeof EdgeSchema>

const ConceptNotesSchema = z
  .strictObject({
    concept: SlugSchema,
    open: z.array(EdgeSchema),
    smooth: z.array(EdgeSchema),
  })
  .superRefine((concept, ctx) => {
    const edges = [...concept.open, ...concept.smooth].map((edge) => edge.edge)
    uniqueIds(
      edges,
      ctx,
      (index) =>
        index < concept.open.length
          ? ["open", index, "edge"]
          : ["smooth", index - concept.open.length, "edge"],
      "edge"
    )
  })

export const TutorNotesSchema = z
  .strictObject({
    schema: z.literal(NOTES_SCHEMA),
    by: TextSchema,
    /** The round this version travels with. */
    round: SlugSchema,
    concepts: z.array(ConceptNotesSchema),
  })
  .superRefine((notes, ctx) =>
    uniqueIds(
      notes.concepts.map((concept) => concept.concept),
      ctx,
      (index) => ["concepts", index, "concept"],
      "concept"
    )
  )
export type TutorNotes = z.infer<typeof TutorNotesSchema>

// ── Reading a round ────────────────────────────────────────────────────────

/** A program's lines; a final newline ends the last line rather than starting another. */
export function programLines(program: string): Array<string> {
  const lines = program.split("\n")
  if (lines.length > 1 && lines.at(-1) === "") lines.pop()
  return lines
}

/** Why a variant's hunk gives no program, or gives the same one. */
export type HunkProblem =
  | "no-earlier-card"
  | "line-out-of-range"
  | "changes-nothing"

export type Resolved =
  | { program: string; problem: null | "changes-nothing" }
  | { program: null; problem: Exclude<HunkProblem, "changes-nothing"> }

/**
 * Every card's program, by card id: a read card's own, a variant's built by
 * replacing line `hunk.line` of the program of `of` with `hunk.replace`.
 * `of` must name an earlier read or variant card whose program resolved.
 * Refine cards have none.
 */
export function resolvePrograms(round: Round): Map<string, Resolved> {
  const resolved = new Map<string, Resolved>()
  for (const card of round.cards) {
    if (card.kind === "read") {
      resolved.set(card.id, { program: card.program, problem: null })
    } else if (card.kind === "variant") {
      resolved.set(card.id, applyHunk(resolved.get(card.of), card.hunk))
    }
  }
  return resolved
}

function applyHunk(base: Resolved | undefined, hunk: Hunk): Resolved {
  if (base === undefined || base.program === null) {
    return { program: null, problem: "no-earlier-card" }
  }
  const lines = programLines(base.program)
  const old = lines[hunk.line - 1]
  if (old === undefined) return { program: null, problem: "line-out-of-range" }
  lines[hunk.line - 1] = hunk.replace
  const ending = base.program.endsWith("\n") ? "\n" : ""
  return {
    program: lines.join("\n") + ending,
    problem: old === hunk.replace ? "changes-nothing" : null,
  }
}

/**
 * Whether the tutor's guess is what rustc did: the same outcome, the same
 * error code, the same stdout (trailing whitespace aside). A run the sandbox
 * stopped matches no guess.
 */
export function expectMatches(expect: Expect, run: RustcRun): boolean {
  switch (expect.outcome) {
    case "compile-error": {
      return run.outcome === "compile-error" && run.code === expect.code
    }
    case "prints": {
      return (
        run.outcome === "prints" &&
        run.stdout.trimEnd() === expect.stdout.trimEnd()
      )
    }
    case "panics": {
      return run.outcome === "panics"
    }
    default: {
      return assertNever(expect)
    }
  }
}
