import type {
  GameStats,
  GameStatus,
} from "@honeycomb/lib/hangul/wasm-game-bridge"
import type { Meta, StoryObj } from "@storybook/react-vite"
import { fn } from "storybook/test"

import { GameOverModal } from "."

const baseStats = (
  overrides: Partial<GameStats & { accuracy: number }> = {}
): GameStats & { accuracy: number } => ({
  score: 1_840,
  currentStreak: 9,
  bestStreak: 15,
  totalCorrect: 46,
  totalMissed: 6,
  accuracy: 88.5,
  ...overrides,
})

const baseStatus = (overrides: Partial<GameStatus> = {}): GameStatus => ({
  isComplete: false,
  isTimedOut: false,
  timeRemainingMs: 0,
  progress: {
    totalKeys: 50,
    completedKeys: 50,
    remainingKeys: 0,
    completionPercentage: 100,
    keysCompletedList: [],
  },
  ...overrides,
})

const meta: Meta<typeof GameOverModal> = {
  title: "UI/Honeycomb/Hangul/Components/GameOverModal",
  component: GameOverModal,
  tags: ["autodocs"],
  parameters: { layout: "fullscreen" },
  decorators: [
    (Story) => (
      <div className="relative h-[500px] w-full bg-slate-900">
        <Story />
      </div>
    ),
  ],
  args: {
    isOpen: true,
    onContinue: fn(),
  },
} satisfies Meta<typeof GameOverModal>

export default meta
type Story = StoryObj<typeof meta>

/** Completion mode mastered before time ran out - the 🎉 "Complete!" ending. */
export const Completed: Story = {
  args: {
    status: baseStatus({ isComplete: true }),
    stats: baseStats(),
  },
}

/** Completion mode's clock ran out first - the ⏰ "Time's Up!" ending. */
export const TimedOut: Story = {
  args: {
    status: baseStatus({
      isComplete: false,
      isTimedOut: true,
      progress: {
        totalKeys: 50,
        completedKeys: 31,
        remainingKeys: 19,
        completionPercentage: 62,
        keysCompletedList: [],
      },
    }),
    stats: baseStats({ score: 980, totalCorrect: 31, totalMissed: 9 }),
  },
}

/** Neither complete nor timed out (e.g. endless mode ended manually) - the generic 🎮 "Game Over" ending. */
export const GenericGameOver: Story = {
  args: {
    status: baseStatus({ isComplete: false, isTimedOut: false }),
    stats: baseStats(),
  },
}

/** `isOpen: false` renders nothing. */
export const Closed: Story = {
  args: {
    isOpen: false,
    status: baseStatus({ isComplete: true }),
    stats: baseStats(),
  },
}
