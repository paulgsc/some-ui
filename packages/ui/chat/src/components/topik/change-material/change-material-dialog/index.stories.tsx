import { useState } from "react"
import type { TopikMetadata } from "@chat/lib/topik"
import type { Meta, StoryObj } from "@storybook/react-vite"

import { ChangeMaterialDialog } from "."

const meta: Meta<typeof ChangeMaterialDialog> = {
  title: "UI/Chat/Components/Topik/ChangeMaterial/ChangeMaterialDialog",
  component: ChangeMaterialDialog,
  argTypes: {
    onOpenChange: { action: "onOpenChange" },
    onConfirm: { action: "onConfirm" },
    onReload: { action: "onReload" },
  },
}
export default meta
type Story = StoryObj<typeof ChangeMaterialDialog>

function makeItems(count: number): Array<TopikMetadata> {
  return Array.from({ length: count }, (_, i) => ({
    key: `topik-${i}`,
    displayName: `Standard TOPIK ${i + 1}`,
    description: "Conversation set for study.",
    batchCount: (i % 5) + 1,
    totalQuestions: (i % 5) * 3,
    totalMessages: (i % 5) * 6,
    difficulty: (["beginner", "intermediate", "advanced"] as const)[i % 3],
  }))
}

/** Interactive story - full open/close/select flow wired up. */
export const Interactive: Story = {
  render: () => {
    const [open, setOpen] = useState(true)
    return (
      <ChangeMaterialDialog
        open={open}
        onOpenChange={setOpen}
        topikItems={makeItems(12)}
        loading={false}
        onConfirm={() => setOpen(false)}
      />
    )
  },
}

/** Materials are still loading. */
export const Loading: Story = {
  args: {
    open: true,
    topikItems: [],
    loading: true,
  },
}

/** No materials loaded at all - fatal error state with a retry option. */
export const FatalError: Story = {
  args: {
    open: true,
    topikItems: [],
    loading: false,
    error: "Failed to fetch TOPIK manifest. Please try again.",
  },
}

/** Some materials loaded, but the catalog refresh partially failed. */
export const PartialError: Story = {
  args: {
    open: true,
    topikItems: makeItems(6),
    loading: false,
    error: "Some materials may be missing due to a partial load failure.",
  },
}
