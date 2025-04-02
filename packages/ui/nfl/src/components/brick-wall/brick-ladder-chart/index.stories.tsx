import { useNflTennis } from "@nfl/data/brick-data"
import type { Meta as MetaObj, StoryObj } from "@storybook/react"

import { BrickLadderChart } from "."

type Story = StoryObj<typeof BrickLadderChart>
type Meta = MetaObj<typeof BrickLadderChart>

export const Default: Story = {
  args: {},
  render: (args) => {
    const params = {
      range: "testing!A1:J33",
    }
    const { data: response, isLoading, error } = useNflTennis({ ...params })
    const { data: points, metadata } = response ?? {}
    if (isLoading) return <div>Loading...</div>
    if (error) return <div>error...{`${error}`}</div>
    return (
      <main className="h-screen w-1/2">
        <BrickLadderChart
          {...{ ...args, data: points ?? [], title: metadata?.title }}
        />
      </main>
    )
  },
}

export default {
  title: "UI/NFL/Components/BrickChart",
  component: BrickLadderChart,
} as Meta
