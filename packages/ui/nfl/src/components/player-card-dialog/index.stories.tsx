import type { Meta as MetaObj, StoryObj } from "@storybook/react"

import { PlayerCardDialog } from "."

type Story = StoryObj<typeof PlayerCardDialog>
type Meta = MetaObj<typeof PlayerCardDialog>

export const Default: Story = {}

export default {
  title: "UI/NFL/Components/PlayerCardDialog",
  component: PlayerCardDialog,
} as Meta
