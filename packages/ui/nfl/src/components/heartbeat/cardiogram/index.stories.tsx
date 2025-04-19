import type { Meta as MetaObj, StoryObj } from "@storybook/react"

import { NFLTeamCardiogram } from "."

type Story = StoryObj<typeof NFLTeamCardiogram>
type Meta = MetaObj<typeof NFLTeamCardiogram>

export const Default: Story = {}

export default {
  title: "UI/NFL/Components/NFLTeamCardiogram",
  component: NFLTeamCardiogram,
} as Meta
