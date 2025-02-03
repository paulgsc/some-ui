import type { Meta as MetaObj, StoryObj } from "@storybook/react"

import HierarchicalContentLayout from "."

type Meta = MetaObj<typeof HierarchicalContentLayout>
type Story = StoryObj<typeof HierarchicalContentLayout>

// Define the Default story
export const Default: Story = {}

// Exporting the meta information
export default {
  title: "HierarchicalContentLayout",
  component: HierarchicalContentLayout,
} as Meta
