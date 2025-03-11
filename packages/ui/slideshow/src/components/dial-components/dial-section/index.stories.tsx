import {
  generateSectionPath,
  getSectionTextPosition,
} from "@slideshow/utils/dial-utils"
import type { Meta as MetaObj, StoryObj } from "@storybook/react"

import { DialSection } from "."

type Story = StoryObj<typeof DialSection>
type Meta = MetaObj<typeof DialSection>

const section = {
  id: 1,
  title: "Planning",
  color: "#FF9AA2",
  details: "Initial project",
}
const sectionBoundaries = [{ startAngle: 90, endAngle: 135 }]
const center = 100
const innerRadius = 0.7 * center
const outerRadius = 0.95 * center
const radius = (innerRadius + outerRadius) / 2
export const Default: Story = {
  args: {
    section,
    radius: center,
    path: generateSectionPath({
      startAngle: 90,
      endAngle: 135,
      innerRadius,
      outerRadius,
      center,
    }),
    isZoomed: false,
    setZoomedSection: () => {},
    textPosition: getSectionTextPosition({
      sectionIndex: 0,
      radius,
      sectionBoundaries,
      center,
    }),
  },
  render: (args) => (
    <main className="size-200 border border-red-500">
      <svg
        xmlns="http://www.w3.org/2000/svg"
        className="size-full"
        fill="currentColor"
        viewBox={`0 0 ${center * 2} ${center * 2}`}
        preserveAspectRatio="xMidYMid meet"
      >
        <DialSection {...args} />
      </svg>
    </main>
  ),
}

export default {
  title: "UI/Slideshow/Components/DialSection",
  component: DialSection,
} as Meta
