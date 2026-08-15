import { usePreviewGame } from "@leetype/hooks/leetype/use-preview-game"
import { nextExercise } from "@leetype/lib/leetype/exercises"
import { languageOf, typingBlockOf } from "@leetype/types/exercise"
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
