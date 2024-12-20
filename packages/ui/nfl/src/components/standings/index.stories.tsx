import type { Meta as MetaObj, StoryObj } from "@storybook/react"

import NFLStandings from "."

type Meta = MetaObj<typeof NFLStandings>
type Story = StoryObj<typeof NFLStandings>

export default {
  title: "NFL Standings",
  component: NFLStandings,
} as Meta

export const Complete: Story = {}
