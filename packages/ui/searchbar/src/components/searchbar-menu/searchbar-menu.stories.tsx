import type { Meta as MetaObj, StoryObj } from "@storybook/react"

import SearchBarContextMenu from "./searchbar-menu"

type Meta = MetaObj<typeof SearchBarContextMenu>
type Story = StoryObj<typeof SearchBarContextMenu>

export const Default: Story = {}

export default { component: SearchBarContextMenu } as Meta
