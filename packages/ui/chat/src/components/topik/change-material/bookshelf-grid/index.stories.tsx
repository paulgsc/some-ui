import { useState } from "react"
import type { TopikMetadata } from "@chat/lib/topik"
import type { Meta, StoryObj } from "@storybook/react-vite"

import { BookshelfGrid } from "."

const meta: Meta<typeof BookshelfGrid> = {
  title: "UI/Chat/Components/Topik/ChangeMaterial/BookshelfGrid",
  component: BookshelfGrid,
  argTypes: {
    onSelect: { action: "onSelect" },
    onPageChange: { action: "onPageChange" },
  },
}
export default meta
type Story = StoryObj<typeof BookshelfGrid>

function makeItems(count: number): Array<TopikMetadata> {
  return Array.from({ length: count }, (_, i) => ({
    key: `topik-${i}`,
    displayName: `Standard TOPIK ${i + 1}`,
    description: "Conversation set for study.",
    batchCount: (i % 5) + 1,
    totalQuestions: (i % 5) * 3,
    totalMessages: (i % 5) * 6,
  }))
}

/** A single shelf row, no pagination needed. */
export const SingleShelf: Story = {
  args: { items: makeItems(4), page: 1 },
}

/** Enough items to require pagination controls. */
export const MultiplePages: Story = {
  args: { items: makeItems(20), page: 1 },
}

/** No materials match the current search/filter. */
export const NoResults: Story = {
  args: { items: [], page: 1 },
}

/**
 * Interactive story wiring page state so Previous/Next actually navigate.
 */
export const Interactive: Story = {
  render: () => {
    const items = makeItems(20)
    const [page, setPage] = useState(1)
    const [selectedKey, setSelectedKey] = useState<string | null>(null)
    return (
      <BookshelfGrid
        items={items}
        selectedKey={selectedKey}
        onSelect={setSelectedKey}
        page={page}
        onPageChange={setPage}
      />
    )
  },
}
