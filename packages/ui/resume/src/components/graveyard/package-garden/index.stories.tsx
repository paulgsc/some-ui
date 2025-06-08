import type { Meta as MetaObj, StoryObj } from "@storybook/react"

import { PackageGarden } from "."

type Story = StoryObj<typeof PackageGarden>
type Meta = MetaObj<typeof PackageGarden>

export const Default: Story = {}

export default {
  title: "UI/Resume/Components/Graveyard/PackageGarden",
  component: PackageGarden,
} as Meta
