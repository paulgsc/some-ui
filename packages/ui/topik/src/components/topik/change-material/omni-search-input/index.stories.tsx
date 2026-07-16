import { useState } from "react"
import type { TopikMetadata } from "@topik/lib/topik"
import type { Meta, StoryObj } from "@storybook/react-vite"

import { OmniSearchInput } from "."

const meta: Meta<typeof OmniSearchInput> = {
  title: "UI/Chat/Components/Topik/ChangeMaterial/OmniSearchInput",
  component: OmniSearchInput,
  argTypes: {
    onChange: { action: "onChange" },
    onHighlight: { action: "onHighlight" },
    onSelect: { action: "onSelect" },
  },
}
export default meta
type Story = StoryObj<typeof OmniSearchInput>

const items: Array<TopikMetadata> = [
  {
    key: "topik-3",
    displayName: "TOPIK 3 - Workplace",
    description: "Workplace conversations.",
    batchCount: 5,
    totalQuestions: 15,
    totalMessages: 30,
  },
  {
    key: "topik-4",
    displayName: "TOPIK 4 - Travel",
    description: "Travel and directions.",
    batchCount: 4,
    totalQuestions: 12,
    totalMessages: 24,
  },
]

/** Interactive story - type to filter, arrow keys to navigate, Enter to select. */
export const Interactive: Story = {
  render: () => {
    const [value, setValue] = useState("")
    const [highlightedKey, setHighlightedKey] = useState<string>()
    return (
      <OmniSearchInput
        value={value}
        onChange={setValue}
        items={items}
        onHighlight={setHighlightedKey}
        onSelect={() => {}}
        highlightedKey={highlightedKey}
      />
    )
  },
}

/** Disabled while materials are loading. */
export const Disabled: Story = {
  args: {
    value: "",
    items,
    disabled: true,
  },
}
