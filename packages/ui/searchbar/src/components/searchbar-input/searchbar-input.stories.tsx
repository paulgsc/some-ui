import type { Meta as MetaObj, StoryObj } from "@storybook/react-vite"

import { SearchbarInput } from "./searchbar-input"

type Meta = MetaObj<typeof SearchbarInput>
type Story = StoryObj<typeof SearchbarInput>

export const Default: Story = {}

export default { component: SearchbarInput } as Meta
