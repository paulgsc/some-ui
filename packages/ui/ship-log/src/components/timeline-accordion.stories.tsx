import { useState } from "react"
import type { Meta, StoryObj } from "@storybook/react-vite"

import { timeline } from "../data"
import { TimelineAccordion } from "./timeline-accordion"

const meta = {
  title: "UI/Ship Log/Timeline Accordion",
  component: TimelineAccordion,
} satisfies Meta<typeof TimelineAccordion>
export default meta
type Story = StoryObj<typeof meta>

export const CyclingState: Story = {
  args: { items: timeline, activeIndex: 0, onSelect: () => undefined },
  render: () => {
    const [activeIndex, setActiveIndex] = useState(0)
    return (
      <div className="ship-log-shell" style={{ minHeight: 560, padding: 40 }}>
        <TimelineAccordion
          items={timeline}
          activeIndex={activeIndex}
          onSelect={setActiveIndex}
        />
      </div>
    )
  },
}
