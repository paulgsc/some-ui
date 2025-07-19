import type { Meta as MetaObj, StoryObj } from "@storybook/react-vite"

import { PackageCard } from "."

type Story = StoryObj<typeof PackageCard>
type Meta = MetaObj<typeof PackageCard>

export const Default: Story = {}

export default {
  title: "UI/Resume/Components/Graveyard/PackageCard",
  component: PackageCard,
} as Meta
