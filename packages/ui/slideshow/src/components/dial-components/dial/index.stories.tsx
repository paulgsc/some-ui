import type { Meta as MetaObj, StoryObj } from "@storybook/react"

import { Dial } from "."

type Story = StoryObj<typeof Dial>
type Meta = MetaObj<typeof Dial>

const cycleTime = 300000
const sections = [
  {
    id: 1,
    title: "Planning",
    color: "#FF9AA2",
    details: "Initial project planning phase",
  },
  {
    id: 2,
    title: "Design",
    color: "#FFB7B2",
    details: "UI/UX design and prototyping",
  },
  {
    id: 3,
    title: "Development",
    color: "#FFDAC1",
    details: "Code implementation and testing",
  },
  {
    id: 4,
    title: "Testing",
    color: "#E2F0CB",
    details: "Quality assurance and bug fixes",
  },
  {
    id: 5,
    title: "Deployment",
    color: "#B5EAD7",
    details: "Release to production environment",
  },
  {
    id: 6,
    title: "Feedback",
    color: "#C7CEEA",
    details: "User feedback and iteration",
  },
]
export const Default: Story = {
  args: {
    center: 40,
    sections,
    cycleTime,
    uniformSections: true,
    animationPattern: "linear",
    className: "size-200",
  },
}

export default {
  title: "UI/Slideshow/Components/Dial/DialSVG",
  component: Dial,
} as Meta
