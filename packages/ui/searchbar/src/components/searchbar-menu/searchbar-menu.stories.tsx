import type { Meta as MetaObj, StoryObj } from "@storybook/react"

import SearchBarContextMenu from "./searchbar-menu"

type Meta = MetaObj<typeof SearchBarContextMenu>
type Story = StoryObj<typeof SearchBarContextMenu>

export const Default: Story = {
  args: {
    config: {
      defaultValue: "blog",
      menu: ["blog", "events", "navigation", "updates"],
    },
    param: "foo",
  },
}

export default { component: SearchBarContextMenu } as Meta
