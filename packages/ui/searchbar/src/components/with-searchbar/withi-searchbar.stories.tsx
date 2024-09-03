import type { Meta as MetaObj, StoryObj } from "@storybook/react"

import WithSearchBar from "./with-searchbar"

type Meta = MetaObj<typeof WithSearchBar>
type Story = StoryObj<typeof WithSearchBar>

export const Default: Story = {
  args: {
    showSearch: "searchbar",
  },
}

export default { component: WithSearchBar } as Meta
