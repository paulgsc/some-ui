import type { Meta as MetaObj, StoryObj } from "@storybook/react"
import { SvgIcons } from "some-ui-shared"

import { SearchBarToggle } from "./searchbar-toggle"

type Meta = MetaObj<typeof SearchBarToggle>
type Story = StoryObj<typeof SearchBarToggle>

export const Default: Story = {
  args: {
    children: (
      <SvgIcons.cross className="size-3 shrink-0 text-muted-foreground transition-transform hover:scale-105 hover:text-pink-500" />
    ),
    variant: "secondary",
  },
}

export default { component: SearchBarToggle } as Meta
