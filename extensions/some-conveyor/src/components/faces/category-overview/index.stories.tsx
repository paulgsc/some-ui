import { VanillaBridge } from "@conveyor/components/story-bridge"
import type { Meta, StoryObj } from "@storybook/react-vite"

import { CategoryOverviewFace, type CategoryOverviewProps } from "."

const meta: Meta<CategoryOverviewProps> = {
  title: "Extensions/Conveyor/Faces/CategoryOverview",
  parameters: { layout: "centered", backgrounds: { default: "dark" } },
  render: (args) => (
    <VanillaBridge factory={CategoryOverviewFace} props={args} />
  ),
}
export default meta
type Story = StoryObj<CategoryOverviewProps>

export const Default: Story = {
  args: {
    categories: [
      { icon: "🏃", name: "Fitness", pct: 100 },
      { icon: "📚", name: "Reading", pct: 50 },
      { icon: "💻", name: "Code", pct: 0 },
    ],
  },
}
export const Empty: Story = { args: { categories: [] } }
