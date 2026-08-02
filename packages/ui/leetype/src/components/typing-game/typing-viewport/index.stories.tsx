import { usePreviewGame } from "@leetype/hooks/leetype/use-preview-game"
import { nextExercise } from "@leetype/lib/leetype/exercises"
import { languageOf, typingBlockOf } from "@leetype/types/exercise"
import type { Meta, StoryObj } from "@storybook/react-vite"

import { TypingViewport } from "."

const meta: Meta<typeof TypingViewport> = {
  title: "UI/Input/Components/Typing/TypingViewport",
  component: TypingViewport,
}

export default meta
type Story = StoryObj<typeof TypingViewport>

const seed = nextExercise()

/**
 * The viewport takes its height from the layout. Every story therefore puts
 * it in a flex column of a stated height — the case where it sized itself
 * is the one that made the sticky-prompt layout inexpressible.
 */
const InBox = ({
  stepIndex,
  typedChars,
  height,
}: {
  stepIndex: number
  typedChars: number
  height: string
}) => {
  const step = seed.steps[stepIndex] ?? seed.steps[0]
  const source = step ? (typingBlockOf(step)?.source ?? "") : ""
  const preview = usePreviewGame(source, typedChars, 20)

  if (!step || !preview) {
    return (
      <div className="p-5 text-sm text-muted-foreground">Starting engine…</div>
    )
  }

  return (
    <div
      className="code flex flex-col overflow-hidden rounded-lg border border-dashed border-border p-2"
      style={{ width: "44rem", height }}
    >
      <TypingViewport
        displayCode={source}
        language={languageOf(step)}
        roles={preview.roles}
        slotOfDisplay={preview.slotOfDisplay}
        slotStatus={preview.slotStatus}
        visibility={preview.visibility}
        cursorDisplay={preview.snapshot.cursorDisplay}
      />
    </div>
  )
}

/** Content shorter than the box: no scrollbar appears. */
export const ContentFits: Story = {
  render: () => <InBox stepIndex={1} typedChars={10} height="18rem" />,
}

/** Content taller than the box: this is the one legitimate scroll. */
export const ContentOverflows: Story = {
  render: () => <InBox stepIndex={9} typedChars={20} height="10rem" />,
}

/** The caret deep into a long body, where following it is the whole point. */
export const CaretFollowed: Story = {
  render: () => <InBox stepIndex={9} typedChars={90} height="12rem" />,
}
