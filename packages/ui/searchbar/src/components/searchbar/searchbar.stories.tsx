import type { Meta as MetaObj, StoryObj } from "@storybook/react"

import SearchBar from "./searchbar"

type Meta = MetaObj<typeof SearchBar>
type Story = StoryObj<typeof SearchBar>

export const Default: Story = {
  args: {
    param: "foo",
  },
}

export default { component: SearchBar } as Meta
