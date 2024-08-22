import type { Meta as MetaObj, StoryObj } from "@storybook/react"

import Foo from "."

type Meta = MetaObj<typeof Foo>
type Story = StoryObj<typeof Foo>

export const Default: Story = {}

export default { component: Foo } as Meta
