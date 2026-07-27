import type { Meta as MetaObj, StoryObj } from "@storybook/react-vite"

import { NFLJersey } from "."

type Story = StoryObj<typeof NFLJersey>
type Meta = MetaObj<typeof NFLJersey>

export const Default: Story = {}

const meta = {
  title: "UI/Shared/Icons/NFLJersey",
  component: NFLJersey,
} satisfies Meta

export default meta
