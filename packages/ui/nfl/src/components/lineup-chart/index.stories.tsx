import type { Meta as MetaObj, StoryObj } from "@storybook/react"

import FootballFormationChart from "."

type Meta = MetaObj<typeof FootballFormationChart>
type Story = StoryObj<typeof FootballFormationChart>

export const Default: Story = {
  args: {
    param: "foo",
  },
}

export default { component: FootballFormationChart } as Meta
