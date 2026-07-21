import type {
  GameProgress,
  GameStats,
  TimingParams,
} from "@honeycomb/lib/hangul/wasm-game-bridge"
import type { Meta, StoryObj } from "@storybook/react-vite"

import { StatsPanel } from "."

// ---------------------------------------------------------------------------
// Helpers – build realistic mock data so each story stays declarative
// ---------------------------------------------------------------------------

const baseStats = (
  overrides: Partial<GameStats & { accuracy: number }> = {}
): GameStats & { accuracy: number } => ({
  score: 1_250,
  currentStreak: 7,
  bestStreak: 12,
  totalCorrect: 48,
  totalMissed: 5,
  accuracy: 90.6,
  ...overrides,
})

const baseTiming = (overrides?: Partial<TimingParams>): TimingParams => ({
  characterLifetimeMs: 2_500,
  showRomanization: false,
  spawnIntervalMs: 2_000,
  ...overrides,
})

const baseProgress = (overrides?: Partial<GameProgress>): GameProgress => ({
  completedKeys: 34,
  remainingKeys: 16,
  totalKeys: 50,
  completionPercentage: 68,
  keysCompletedList: ["a", "b", "c"],
  ...overrides,
})

// ---------------------------------------------------------------------------
// Meta
// ---------------------------------------------------------------------------

const meta: Meta<typeof StatsPanel> = {
  title: "UI/Honeycomb/Components/HangulHexGrid/StatsPanel",
  component: StatsPanel,
  tags: ["autodocs"],
  parameters: {
    layout: "fullscreen",
    backgrounds: {
      default: "dark",
      values: [
        { name: "dark", value: "#0f172a" },
        { name: "light", value: "#f1f5f9" },
      ],
    },
  },
  decorators: [
    (Story) => (
      <div className="relative w-screen h-screen bg-slate-900">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof StatsPanel>

export default meta
type Story = StoryObj<typeof meta>

// ---------------------------------------------------------------------------
// Stories
// ---------------------------------------------------------------------------

export const Default: Story = {
  args: {
    stats: baseStats(),
    timingParams: baseTiming(),
    currentTimeWindow: 2_500,
    mode: "endless",
  },
}

// ---- Mode variants --------------------------------------------------------

export const CompletionMode: Story = {
  args: {
    stats: baseStats({ score: 800, totalCorrect: 30, totalMissed: 3 }),
    timingParams: baseTiming(),
    currentTimeWindow: 2_500,
    mode: "completion",
    timeRemaining: 90_000,
    progress: baseProgress(),
  },
}

export const CompletionAlmostDone: Story = {
  args: {
    stats: baseStats({ score: 2_400, totalCorrect: 49, totalMissed: 1 }),
    timingParams: baseTiming(),
    currentTimeWindow: 2_000,
    mode: "completion",
    timeRemaining: 12_500,
    progress: baseProgress({
      completedKeys: 49,
      totalKeys: 50,
      completionPercentage: 98,
    }),
  },
}

export const CompletionJustStarted: Story = {
  args: {
    stats: baseStats({
      score: 0,
      currentStreak: 0,
      bestStreak: 0,
      totalCorrect: 0,
      totalMissed: 0,
      accuracy: 100,
    }),
    timingParams: baseTiming(),
    currentTimeWindow: 3_000,
    mode: "completion",
    timeRemaining: 120_000,
    progress: baseProgress({
      completedKeys: 0,
      totalKeys: 50,
      completionPercentage: 0,
    }),
  },
}

// ---- Difficulty variants --------------------------------------------------

export const EasyDifficulty: Story = {
  args: {
    stats: baseStats({ accuracy: 97.2, totalMissed: 1 }),
    timingParams: baseTiming({ characterLifetimeMs: 4_000 }),
    currentTimeWindow: 4_000,
    mode: "endless",
  },
}

export const MediumDifficulty: Story = {
  args: {
    stats: baseStats(),
    timingParams: baseTiming({ characterLifetimeMs: 2_500 }),
    currentTimeWindow: 2_500,
    mode: "endless",
  },
}

export const HardDifficulty: Story = {
  args: {
    stats: baseStats({
      score: 3_800,
      currentStreak: 14,
      bestStreak: 22,
      totalCorrect: 110,
      totalMissed: 18,
      accuracy: 85.9,
    }),
    timingParams: baseTiming({ characterLifetimeMs: 1_500 }),
    currentTimeWindow: 1_500,
    mode: "endless",
  },
}

// ---- Accuracy colour thresholds -------------------------------------------

export const HighAccuracy: Story = {
  args: {
    stats: baseStats({ accuracy: 95.3, totalMissed: 2 }),
    timingParams: baseTiming(),
    currentTimeWindow: 2_500,
    mode: "endless",
  },
}
