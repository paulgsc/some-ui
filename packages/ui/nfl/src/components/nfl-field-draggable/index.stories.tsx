import type { Meta as MetaObj, StoryObj } from "@storybook/react-vite"

import FootballFieldDraggable from "."

type Meta = MetaObj<typeof FootballFieldDraggable>
type Story = StoryObj<typeof FootballFieldDraggable>

export const Default: Story = {}

const meta = { component: FootballFieldDraggable } satisfies Meta

export default meta
