import type { Meta as MetaObj, StoryObj } from "@storybook/react-vite"

import { NFLJersey } from "."

type Story = StoryObj<typeof NFLJersey>
type Meta = MetaObj<typeof NFLJersey>

export const Default: Story = {}

export default {
  title: "UI/Shared/Icons/NFLJersey",
  component: NFLJersey,
} as Meta
