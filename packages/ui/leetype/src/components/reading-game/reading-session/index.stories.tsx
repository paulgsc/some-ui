import { ReadingSession } from "@leetype/components/reading-game/reading-session"
import {
  FIXTURE_DIAGNOSTIC_EXERCISE_IDS,
  FIXTURE_EXERCISE_ID,
  nextExercise,
} from "@leetype/lib/leetype/exercises"
import type { Meta, StoryObj } from "@storybook/react-vite"

const meta: Meta<typeof ReadingSession> = {
  title: "UI/Input/Components/Reading/ReadingSession",
  component: ReadingSession,
  parameters: {
    layout: "fullscreen",
    viewport: { defaultViewport: "mobile1" },
  },
}

export default meta
type Story = StoryObj<typeof ReadingSession>

/**
 * The whole small-screen surface, in a phone-shaped box.
 *
 * `sessionSeed` is fixed so the distractor set and its order are the same
 * every time this story is opened — a story that reshuffled on every refresh
 * would be useless for reviewing the card's composition.
 */
const Phone = ({ preferId }: { preferId: string }) => (
  <div className="relative mx-auto h-[844px] w-full max-w-[390px] overflow-hidden border border-border">
    <ReadingSession
      exercise={nextExercise({ preferId })}
      sessionSeed={20260826}
    />
  </div>
)

/** A diagnostic step: the question is what the change repairs. */
export const Diagnostic: Story = {
  render: () => <Phone preferId={FIXTURE_DIAGNOSTIC_EXERCISE_IDS[0]} />,
}

/**
 * A construction chain: the question is what the change establishes, and the
 * explanation panel does not mount — the construction family has no authored
 * `whyRepairDiscriminates` equivalent yet. See `ReadingFeedback`'s own doc
 * comment for why that thinness is left visible rather than papered over.
 */
export const Construction: Story = {
  render: () => <Phone preferId={FIXTURE_EXERCISE_ID} />,
}

/**
 * The same surface with no fixed exercise: the seeded schedule picks, and the
 * session loops through the corpus for its term the way a real one does.
 */
export const ScheduledSession: Story = {
  render: () => (
    <div className="relative mx-auto h-[844px] w-full max-w-[390px] overflow-hidden border border-border">
      <ReadingSession sessionSeed={4} />
    </div>
  ),
}
