import type { Meta as MetaObj, StoryObj } from "@storybook/react"

import FootballFieldDraggable from "."

type Meta = MetaObj<typeof FootballFieldDraggable>
type Story = StoryObj<typeof FootballFieldDraggable>

export const Default: Story = {}

export default { component: FootballFieldDraggable } as Meta
