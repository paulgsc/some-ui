import type { Meta as MetaObj, StoryObj } from "@storybook/react"

import SelectMenu from "./select-menu"

type Meta = MetaObj<typeof SelectMenu>
type Story = StoryObj<typeof SelectMenu>

export const Default: Story = {}

export default { component: SelectMenu } as Meta
