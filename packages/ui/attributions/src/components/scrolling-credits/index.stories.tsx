import { useGetCredits } from "@attributions/data/fetched-attribution-data"
import type { Meta, StoryObj } from "@storybook/react-vite"

import { ScrollingCredits } from "."

type Story = StoryObj<typeof ScrollingCredits>

export const Default: Story = {
  render: () => {
    const params = {
      range: "attributions!A1:G6",
    }
    const { data, isLoading, error } = useGetCredits({ ...params })
    if (isLoading) return <div>Loading...</div>
    if (error)
      return (
        <div>
          error...{error instanceof Error ? error.message : String(error)}
        </div>
      )
    const transform = data?.map(({ source_type, thanks, ...rest }) => ({
      sourceType: source_type,
      thankYouMessage: thanks,
      ...rest,
    }))
    return (
      <ScrollingCredits
        className="absolute inset-0"
        credits={transform ?? []}
      />
    )
  },
}

const meta: Meta<typeof ScrollingCredits> = {
  title: "UI/Attributions/ScrollingCredits",
  component: ScrollingCredits,
}
export default meta
