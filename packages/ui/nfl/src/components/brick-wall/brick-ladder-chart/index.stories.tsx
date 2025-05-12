import { useNflTennis } from "@nfl/data/brick-data"
import type { Meta as MetaObj, StoryObj } from "@storybook/react"

import { BrickWallChart } from "."

type Story = StoryObj<typeof BrickWallChart>
type Meta = MetaObj<typeof BrickWallChart>

export const Default: Story = {
  args: {},
  render: (args) => {
    const params = {
      range: "testing!A1:J33",
      layoutMode: "wall",
      horizontalSpacingRatio: 0.15,
      verticalSpacingRatio: 0.5,
    }
    const { data: response, isLoading, error } = useNflTennis({ ...params })
    const { data: points, metadata } = response ?? {}
    if (isLoading) return <div>Loading...</div>
    if (error) return <div>error...{`${error}`}</div>
    return (
      <main className="h-screen w-full border border-red-600">
        <BrickWallChart
          {...{ ...args, data: points ?? [], title: metadata?.title }}
        />
      </main>
    )
  },
}

export default {
  title: "UI/NFL/Components/BrickChart",
  component: BrickWallChart,
} as Meta
