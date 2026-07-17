import { useNflTennis } from "@nfl/hooks/use-nfl-tennis"
import type { Meta as MetaObj, StoryObj } from "@storybook/react-vite"

import { BrickWallChart } from "."

type Story = StoryObj<typeof BrickWallChart>
type Meta = MetaObj<typeof BrickWallChart>

export const Default: Story = {
  args: {},
  render: (args) => {
    const params = {
      range: "testing!A1:J33",
      layoutMode: "wall" as const,
      horizontalSpacingRatio: 0.15,
      verticalSpacingRatio: 0.5,
    }
    const { data: response, isLoading, error } = useNflTennis({ ...params })
    const { data: rawData, metadata } = response ?? {}

    if (isLoading) return <div>Loading...</div>

    if (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error)
      return <div>error... {errorMessage}</div>
    }

    // Assuming DataItem needs: { name: string, value: number, imageUrl: string }
    const points = (rawData ?? []).flatMap((group) =>
      group.standings.map((standing) => ({
        ...standing,
        // Ensure any other required DataItem fields are present here
      }))
    )

    return (
      <main className="h-screen w-full border border-red-600">
        <BrickWallChart {...args} data={points} title={metadata?.title} />
      </main>
    )
  },
}

const meta: Meta = {
  title: "UI/NFL/Components/BrickChart",
  component: BrickWallChart,
}

export default meta
