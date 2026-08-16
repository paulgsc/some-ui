import { usePreviewGame } from "@leetype/hooks/leetype/use-preview-game"
import { nextExercise } from "@leetype/lib/leetype/exercises"
import { languageOf, typingBlockOf } from "@leetype/types/exercise"
import type { TextGradient } from "@leetype/types/leetype"
import type { Meta, StoryObj } from "@storybook/react-vite"

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
  const exercise = nextExercise()
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
    <StoryFromStep stepIndex={9} typedChars={40} idleSeconds={20} />
  ),
}

/**
 * The renderer at a height shorter than its content. It must not introduce a
 * scrollbar of its own — that is `TypingViewport`'s job and nobody else's.
 */
export const ShorterThanItsContent: Story = {
  render: () => (
    <div className="code h-32 rounded-lg border border-border bg-secondary p-4">
      <StoryFromStep stepIndex={9} typedChars={20} idleSeconds={20} />
    </div>
  ),
}

// ── A context-bearing step, one story per TextGradient value ─────────────
//
// No seed step carries a context span yet (LTY-FRAME's own fixture is a
// crate-side test, not a corpus entry — authoring one for real is a
// decision for whichever story actually wants the frame rendered end to
// end in the shell). These mount `usePreviewGame` directly against a raw
// source string instead of going through the corpus, the same shim-bypass
// pattern the panel's hostile-prompt stories already use.

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
}: {
  source: string
  typedChars: number
  idleSeconds?: number
  textGradient?: TextGradient
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
