import { usePreviewGame } from "@leetype/hooks/leetype/use-preview-game"
import {
  FIXTURE_EXERCISE_ID,
  nextExercise,
} from "@leetype/lib/leetype/exercises"
import {
  languageOf,
  renderedDiffLineKinds,
  typingBlockOf,
} from "@leetype/types/exercise"
import type { TextGradient } from "@leetype/types/leetype"
import type { Meta, StoryObj } from "@storybook/react-vite"

import type { Hunk } from "."
import { CodeDisplay } from "."

const meta: Meta<typeof CodeDisplay> = {
  title: "UI/Input/Components/Typing/CodeDisplay",
  component: CodeDisplay,
}

export default meta
type Story = StoryObj<typeof CodeDisplay>

/**
 * Every story mounts against the exercise shim rather than an ad-hoc prop
 * bag — one fixture set, the same one a player would be handed, so a story
 * cannot quietly drift into showing a state the corpus cannot produce.
 *
 * The engine is driven for real (`usePreviewGame`) rather than hand-rolled:
 * reconstructing a mid-step state by hand would mean reimplementing the
 * indentation rule and the reveal loop in TypeScript, which is the exact
 * drift the engine exists to prevent.
 */
const StoryFromStep = ({
  stepIndex,
  typedChars,
  idleSeconds = 0,
}: {
  stepIndex: number
  typedChars: number
  /** How long the player has been sitting there — the reveal window's input. */
  idleSeconds?: number
}) => {
  const exercise = nextExercise({ preferId: FIXTURE_EXERCISE_ID })
  const step = exercise.steps[stepIndex] ?? exercise.steps[0]
  const source = step ? (typingBlockOf(step)?.source ?? "") : ""
  const preview = usePreviewGame(source, typedChars, idleSeconds)

  if (!preview) {
    return (
      <div className="p-5 text-sm text-muted-foreground">Starting engine…</div>
    )
  }

  return (
    <div className="code rounded-lg border border-border bg-secondary p-4">
      <CodeDisplay
        displayCode={preview.displaySource}
        language={step ? languageOf(step) : "rust"}
        roles={preview.roles}
        slotOfDisplay={preview.slotOfDisplay}
        slotStatus={preview.slotStatus}
        visibility={preview.visibility}
        cursorDisplay={preview.snapshot.cursorDisplay}
      />
    </div>
  )
}

/** A step at rest: fully masked, which is where every step starts. */
export const FullyMasked: Story = {
  render: () => <StoryFromStep stepIndex={1} typedChars={0} />,
}

/** The reveal window open after the initial delay, nothing typed yet. */
export const WindowOpen: Story = {
  render: () => <StoryFromStep stepIndex={1} typedChars={0} idleSeconds={12} />,
}

/** Mid-step, some slots resolved. */
export const PartiallyTyped: Story = {
  render: () => <StoryFromStep stepIndex={1} typedChars={12} idleSeconds={6} />,
}

/** A multi-line proof, so the indentation-skipping caret is visible. */
export const MultiLineProof: Story = {
  render: () => (
    <StoryFromStep stepIndex={7} typedChars={40} idleSeconds={20} />
  ),
}

/**
 * The renderer at a height shorter than its content. It must not introduce a
 * scrollbar of its own — that is `TypingViewport`'s job and nobody else's.
 */
export const ShorterThanItsContent: Story = {
  render: () => (
    <div className="code h-32 rounded-lg border border-border bg-secondary p-4">
      <StoryFromStep stepIndex={7} typedChars={20} idleSeconds={20} />
    </div>
  ),
}

// ── A context-bearing step, one story per TextGradient value ─────────────
//
// Several seed steps carry context spans now (LTY-FAMILIES A2-A4's
// commitments and diagnostic instances), but none of them isolates the
// frame-then-body shape as cleanly as a minimal, purpose-built fixture
// does, and none needs to vary by `textGradient`. These mount
// `usePreviewGame` directly against a raw source string instead of going
// through the corpus, the same shim-bypass pattern the panel's
// hostile-prompt stories already use.

/**
 * `‹…›` wraps a context frame — the same fixture shape
 * `crates/leetype_wasm/tests/context_frame.rs`'s `FRAMED` uses. The
 * function's purpose is given; only its body is typed.
 */
const CONTEXT_SOURCE =
  "‹the function computes the rectangle's area›\nfn area(width: u32, height: u32) -> u32 {\n    width * height\n}"

const StoryFromSource = ({
  source,
  typedChars,
  idleSeconds = 0,
  textGradient,
  hunk,
}: {
  source: string
  typedChars: number
  idleSeconds?: number
  textGradient?: TextGradient
  hunk?: Hunk
}) => {
  const preview = usePreviewGame(source, typedChars, idleSeconds)

  if (!preview) {
    return (
      <div className="p-5 text-sm text-muted-foreground">Starting engine…</div>
    )
  }

  return (
    <div className="code rounded-lg border border-border bg-secondary p-4">
      <CodeDisplay
        displayCode={preview.displaySource}
        language="rust"
        roles={preview.roles}
        slotOfDisplay={preview.slotOfDisplay}
        slotStatus={preview.slotStatus}
        visibility={preview.visibility}
        cursorDisplay={preview.snapshot.cursorDisplay}
        textGradient={textGradient}
        hunk={hunk}
      />
    </div>
  )
}

/**
 * A context frame ahead of the typeable body, Prism's syntax-highlight
 * palette. Context reads as real code (still colored), just muted and
 * italic — the affordance is dimming it, not de-colouring it.
 */
export const ContextFrame: Story = {
  render: () => (
    <StoryFromSource source={CONTEXT_SOURCE} typedChars={10} idleSeconds={8} />
  ),
}

/** The same context frame with the not-yet-typed body painted in the heading gradient. */
export const ContextFrameHeadingGradient: Story = {
  render: () => (
    <StoryFromSource
      source={CONTEXT_SOURCE}
      typedChars={10}
      idleSeconds={8}
      textGradient="heading"
    />
  ),
}

/** The same context frame with the not-yet-typed body painted in the accent gradient. */
export const ContextFrameAccentGradient: Story = {
  render: () => (
    <StoryFromSource
      source={CONTEXT_SOURCE}
      typedChars={10}
      idleSeconds={8}
      textGradient="accent"
    />
  ),
}

/** The same context frame with the not-yet-typed body painted in the muted gradient. */
export const ContextFrameMutedGradient: Story = {
  render: () => (
    <StoryFromSource
      source={CONTEXT_SOURCE}
      typedChars={10}
      idleSeconds={8}
      textGradient="muted"
    />
  ),
}

// ── A hunk overlay (LTY-PATCH P3, #1078; the full set, P6, #1081) ────
//
// `HunkOverlay` below is the one story P3 owed on its own: proof the
// gutter, the tint and the caret actually render against a real seed
// instance, not a synthetic prop bag. The comprehensive set — a
// diagnostic patch, a construction patch, a hunk whose `-` side dwarfs
// its `+` side, a step with no patch at all — is P6's, the same way
// `prompt-panel`'s own pagination stories waited for the story that
// actually needed them.

const StoryFromPatchStep = ({
  exerciseId,
  typedChars,
  idleSeconds = 0,
}: {
  exerciseId: string
  typedChars: number
  idleSeconds?: number
}) => {
  const exercise = nextExercise({ preferId: exerciseId })
  const step = exercise.steps[0]
  const typing = step ? typingBlockOf(step) : undefined
  const preview = usePreviewGame(typing?.source ?? "", typedChars, idleSeconds)

  if (!preview || !typing) {
    return (
      <div className="p-5 text-sm text-muted-foreground">Starting engine…</div>
    )
  }

  const hunk = typing.diff && {
    oldStart: typing.diff.oldStart,
    newStart: typing.diff.newStart,
    lineKinds: renderedDiffLineKinds(typing.diff),
  }

  return (
    <div className="code rounded-lg border border-border bg-secondary p-4">
      <CodeDisplay
        displayCode={preview.displaySource}
        language={typing.language}
        roles={preview.roles}
        slotOfDisplay={preview.slotOfDisplay}
        slotStatus={preview.slotStatus}
        visibility={preview.visibility}
        cursorDisplay={preview.snapshot.cursorDisplay}
        hunk={hunk}
      />
    </div>
  )
}

/**
 * A real seed instance (`diagnostic-division-guard-01`, LTY-PATCH P4,
 * #1079): three added lines as one contiguous run, sitting between
 * context above and below — the sign column, both line-number columns and
 * the add tint, all against a hunk the repair-budget story already proved
 * validates.
 */
export const HunkOverlay: Story = {
  render: () => (
    <StoryFromPatchStep
      exerciseId="diagnostic-division-guard"
      typedChars={0}
      idleSeconds={20}
    />
  ),
}

/**
 * A real seed instance (`construction-lazy-default-01`, LTY-PATCH P5,
 * #1080): the only construction-family step whose `patch` carries a `del`
 * line, so this is the one story that proves the deletion strikethrough
 * renders against a construction step and not only a diagnostic one.
 */
export const HunkOverlayConstruction: Story = {
  render: () => (
    <StoryFromPatchStep
      exerciseId="construction-lazy-default"
      typedChars={0}
      idleSeconds={20}
    />
  ),
}

// ── A `-` side that dwarfs its `+` side ───────────────────────────────
//
// No seed instance has this shape — the corpus's own `del` lines (P5's
// `construction-lazy-default-01`) are deliberately one-for-one with their
// `add` line, per that exercise's own doc comment. This is the same
// shim-bypass `StoryFromSource` already uses for `ContextFrame`: a
// minimal, purpose-built fixture where the corpus has none. The source and
// its 11-del/3-add split are the identical fixture
// `check-deletions-are-free.ts`'s `WITH_LARGE_DELETION` already proved
// renders and plays correctly against the real compiled engine — this
// story is that same shape, just watched instead of played.

const LARGE_DELETION_SOURCE =
  "‹fn slow_path(items: &[i32]) -> i32 {\n" +
  "    let mut total = 0;\n" +
  "    for item in items {\n" +
  "        if *item % 2 == 0 {\n" +
  "            total += item * 2;\n" +
  "        } else {\n" +
  "            total += item;\n" +
  "        }\n" +
  "    }\n" +
  "    total\n" +
  "}\n" +
  "›fn fast_path(items: &[i32]) -> i32 {\n" +
  "    items.iter().sum()\n" +
  "}"

const LARGE_DELETION_HUNK: Hunk = {
  oldStart: 1,
  newStart: 1,
  lineKinds: [
    "del",
    "del",
    "del",
    "del",
    "del",
    "del",
    "del",
    "del",
    "del",
    "del",
    "del",
    "add",
    "add",
    "add",
  ],
}

export const HunkOverlayLargeDeletion: Story = {
  render: () => (
    <StoryFromSource
      source={LARGE_DELETION_SOURCE}
      typedChars={0}
      idleSeconds={20}
      hunk={LARGE_DELETION_HUNK}
    />
  ),
}

/**
 * A step with no `patch` at all (`entry-01-import`, `entryApi`'s first
 * step — never touched by LTY-PATCH). `hunk` is simply omitted — proof
 * the omission path (still every other story above `HunkOverlay`) keeps
 * rendering byte-identically to how it did before the epic, exercised
 * here through the same `StoryFromPatchStep` helper the hunk stories use
 * rather than a separate one, so this is a true apples-to-apples check of
 * the branch in `CodeDisplay` that hunk presence switches on.
 */
export const NoHunkOverlay: Story = {
  render: () => (
    <StoryFromPatchStep
      exerciseId="rust-hashmap-entry"
      typedChars={0}
      idleSeconds={20}
    />
  ),
}
