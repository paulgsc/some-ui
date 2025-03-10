import { useGetCredits } from "@attributions/data/fetched-attribution-data"
import type { Meta, StoryObj } from "@storybook/react"

import { ScrollingCredits } from "."

type Story = StoryObj<typeof ScrollingCredits>

export const Default: Story = {
  render: () => {
    const params = {
      range: "Sheet1!A1:G6",
    }
    const { data, isLoading, error } = useGetCredits({ ...params })
    if (isLoading) return <div>Loading...</div>
    if (error) return <div>error...{`${error}`}</div>
    const transform = data?.map(({ source_type, thanks, ...rest }) => ({
      sourceType: source_type,
      thankYouMessage: thanks,
      ...rest,
    }))
    return <ScrollingCredits credits={transform ?? []} />
  },
}

export default {
  title: "UI/Attributions/ScrollingCredits",
  component: ScrollingCredits,
} as Meta
