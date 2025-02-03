import type { Meta, StoryObj } from "@storybook/react"
import { useFetch } from "some-ui-utils"

import { ScrollingCredits } from "."

type Story = StoryObj<typeof ScrollingCredits>

const FetchWrapper = () => {
  const url = "http://nixos.local:3000/"
  const { data, error } = useFetch(url)

  if (error)
    return <div>Foo Foo Foo! Error: {JSON.stringify(error.message)}</div>
  if (!data) return <div>Loading...</div>

  return <ScrollingCredits data={data} />
}

export const Default: Story = {
  render: () => <FetchWrapper />,
}

export default {
  title: "UI/Attributions/ScrollingCredits",
  component: ScrollingCredits,
} as Meta
