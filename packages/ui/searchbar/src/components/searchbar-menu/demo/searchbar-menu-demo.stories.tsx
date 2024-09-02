import type { Meta as MetaObj, StoryObj } from "@storybook/react"

import SearchBarContextMenuDemo from "./searchbar-menu-demo"

type Meta = MetaObj<typeof SearchBarContextMenuDemo>
type Story = StoryObj<typeof SearchBarContextMenuDemo>

export const Default: Story = {}

export default { component: SearchBarContextMenuDemo } as Meta
