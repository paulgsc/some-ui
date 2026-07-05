import type { Meta, StoryObj } from "@storybook/react-vite"

import { TopikBookCard } from "."

const meta: Meta<typeof TopikBookCard> = {
  title: "UI/Chat/Components/Topik/ChangeMaterial/TopikBookCard",
  component: TopikBookCard,
  argTypes: {
    onClick: { action: "onClick" },
  },
}
export default meta
type Story = StoryObj<typeof TopikBookCard>

const baseItem = {
  key: "topik-3-basic",
  displayName: "Standard TOPIK 3",
  description: "Introductory intermediate level comprehension.",
  batchCount: 5,
  totalQuestions: 15,
  totalMessages: 30,
  difficulty: "intermediate" as const,
}

/** Default shelf card, unselected. */
export const Default: Story = {
  args: { item: baseItem },
}

/** Selected state, shown with a highlighted border/ring. */
export const Selected: Story = {
  args: { item: baseItem, selected: true },
}

/** Compact "recommended" strip variant - no description, smaller footprint. */
export const Recommended: Story = {
  args: { item: baseItem, variant: "recommended" },
}

/** No difficulty metadata - the badge is simply omitted. */
export const NoDifficulty: Story = {
  args: { item: { ...baseItem, difficulty: undefined } },
}
