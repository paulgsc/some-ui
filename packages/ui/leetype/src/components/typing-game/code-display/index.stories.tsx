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
 * Stories mount against the exercise shim, so they cannot show a state the
 * corpus cannot produce, and drive the real engine (`usePreviewGame`) rather
 * than reimplementing the reveal loop by hand.
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
// A minimal fixture isolates the frame-then-body shape better than any seed
// step, so these bypass the corpus and mount `usePreviewGame` on a raw
// source.

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

// ── A hunk overlay (LTY-PATCH) ───────────────────────────────────────────
//
// Gutter, tint and caret against real seed instances: a diagnostic patch, a
// construction patch, a dominant `-` side, and a step with no patch.

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
 * `diagnostic-division-guard-01`: three added lines as one contiguous run
 * between context, showing the sign column, both line-number columns and
 * the add tint.
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
 * `construction-lazy-default-01`: the only construction step with a `del`
 * line, so the deletion strikethrough shows on a construction step too.
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
// No seed instance has this shape, so this bypasses the corpus. The 11-del /
// 3-add source is `check-deletions-are-free.ts`'s `WITH_LARGE_DELETION`.

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
 * A step with no patch (`entry-01-import`): `hunk` omitted, through the same
 * `StoryFromPatchStep` helper as the hunk stories, for a like-for-like view
 * of the no-hunk branch.
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
