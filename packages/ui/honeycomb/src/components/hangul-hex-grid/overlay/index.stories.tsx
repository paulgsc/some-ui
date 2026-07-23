import type { Meta as MetaObj, StoryObj } from "@storybook/react-vite"

import { HangulHexGrid } from "."

type Story = StoryObj<typeof HangulHexGrid>
type Meta = MetaObj<typeof HangulHexGrid>

// Every story here renders the *real* HangulHexGrid, wired to the real WASM
// engine (no mocks) - this is the "story the entire flow" half of the
// component's visual-regression coverage: a reviewer can play a full game
// of each mode directly in Storybook without running the tanstack `www`
// app. The composable pieces each mode is built from (hex cells, key
// buffer, word progress, prompt station, ...) get their own static-prop
// stories under `UI/Honeycomb/Hangul/Components/*` for finer-grained
// regression coverage that doesn't depend on WASM load timing or RNG.

export const Completion: Story = {
  args: { mode: "completion" },
}

export const Endless: Story = {
  args: { mode: "endless" },
}

export const Vocabulary: Story = {
  name: "Vocabulary (word mode, ADR 0001)",
  args: { mode: "vocabulary" },
}

export const VocabularyEndless: Story = {
  args: { mode: "vocabulary-endless" },
}

/** Difficulty is a lay-facing label (Relaxed/Standard/Challenging), not raw
 * engine config - the activity setup screen in apps/www offers this
 * alongside mode selection; HangulHexGrid alone resolves what it means. */
export const ChallengingDifficulty: Story = {
  args: { mode: "completion", difficulty: "challenging" },
}

export const RelaxedDifficulty: Story = {
  args: { mode: "completion", difficulty: "relaxed" },
}

const meta: Meta = {
  title: "UI/Honeycomb/Hangul/Flow/HangulHexGrid",
  component: HangulHexGrid,
  parameters: {
    layout: "fullscreen",
  },
}
export default meta
