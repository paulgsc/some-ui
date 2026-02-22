import type { TopikMetadata } from "@chat/lib/topik"
import type { Meta, StoryObj } from "@storybook/react-vite"

import { SessionHeader } from "."

const mockTopikItems: Array<TopikMetadata> = [
  {
    key: "topik-3-basic",
    displayName: "Standard TOPIK 3",
    description: "Introductory intermediate level comprehension.",
    batchCount: 5,
    totalQuestions: 15,
    totalMessages: 30,
    difficulty: "intermediate",
  },
  {
    key: "topik-4-advanced",
    displayName: "Standard TOPIK 4",
    description: "Professional workplace scenarios.",
    batchCount: 8,
    totalQuestions: 24,
    totalMessages: 48,
    difficulty: "advanced",
  },
]

const meta: Meta<typeof SessionHeader> = {
  title: "UI/Chat/Components/Topik/Learning/SessionHeader",
  component: SessionHeader,
  parameters: {
    layout: "fullscreen",
  },
  argTypes: {
    onEndSession: { action: "onEndSession" },
    onTopikSelect: { action: "onTopikSelect" },
    onTopikReload: { action: "onTopikReload" },
  },
}

export default meta
type Story = StoryObj<typeof SessionHeader>

/**
 * The standard view when a session has just begun.
 */
export const Default: Story = {
  args: {
    timeRemaining: 1800, // 30:00
    score: 0,
    totalQuestions: 20,
    currentBatch: 1,
    totalBatches: 5,
    topikDisplayName: "TOPIK 3 - Workplace Ethics",
    topikItems: mockTopikItems,
    topikLoading: false,
    topikError: null,
    currentTopikKey: "topik-3-basic",
  },
}

/**
 * Mid-session state showing progress and a ticking clock.
 */
export const InProgress: Story = {
  args: {
    ...Default.args,
    timeRemaining: 645, // 10:45
    score: 12,
    currentBatch: 3,
  },
}

/**
 * Urgent state when time is running low.
 */
export const LowTime: Story = {
  args: {
    ...Default.args,
    timeRemaining: 45, // 00:45
    score: 18,
    currentBatch: 5,
  },
}

/**
 * Header view when the material selection data is still fetching.
 */
export const LoadingMaterial: Story = {
  args: {
    ...Default.args,
    topikItems: [],
    topikLoading: true,
  },
}

/**
 * Handling error states for the "Change Material" functionality.
 */
export const MaterialError: Story = {
  args: {
    ...Default.args,
    topikError: "Failed to fetch TOPIK manifest. Please try again.",
  },
}

/**
 * View when no specific TOPIK display name is provided.
 */
export const GenericSession: Story = {
  args: {
    ...Default.args,
    topikDisplayName: undefined,
  },
}
