import type { Meta, StoryObj } from "@storybook/react-vite"
import { fn } from "@storybook/test"

import { SessionHeader } from "."

const mockTopikItems = [
  {
    key: "daily-life",
    displayName: "Daily Life Conversations",
    description: "Basic interactions involving shopping and hobbies.",
    batchCount: 5,
    totalQuestions: 25,
  },
  {
    key: "workplace",
    displayName: "Workplace Etiquette",
    description: "Formal Korean used in office settings.",
    batchCount: 3,
    totalQuestions: 15,
  },
]

const meta: Meta<typeof SessionHeader> = {
  title: "UI/Chat/Components/Topik/Learning/SessionHeader",
  component: SessionHeader,
  parameters: {
    layout: "fullscreen",
  },
  // Default args to satisfy the new interface
  args: {
    timeRemaining: 600,
    score: 10,
    totalQuestions: 20,
    currentBatch: 2,
    totalBatches: 5,
    topikItems: mockTopikItems,
    topikLoading: false,
    topikError: null,
    onEndSession: fn(),
    onTopikSelect: fn(),
  },
}

export default meta
type Story = StoryObj<typeof SessionHeader>

/**
 * Standard session state with a topic currently active.
 */
export const Default: Story = {
  args: {
    topikDisplayName: "Intermediate Business Korean",
    currentTopikKey: "workplace",
  },
}

/**
 * Tests the dialog's loading state.
 * To view this, click 'Change Material' in the Storybook preview.
 */
export const LibraryLoading: Story = {
  args: {
    topikLoading: true,
    topikItems: [],
  },
}

/**
 * Tests the dialog's error state.
 */
export const LibraryError: Story = {
  args: {
    topikError: "Could not connect to the topic server.",
    topikItems: [],
  },
}

/**
 * Scenario with a very long title and high progress.
 */
export const LongTitleProgress: Story = {
  args: {
    topikDisplayName:
      "Advanced Academic Research & Discussion Vocabulary (Level 6)",
    timeRemaining: 45,
    score: 48,
    totalQuestions: 50,
    currentBatch: 10,
    totalBatches: 10,
  },
}
