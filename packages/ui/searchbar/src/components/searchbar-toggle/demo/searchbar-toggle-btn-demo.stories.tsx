import type { Meta as MetaObj, StoryObj } from "@storybook/react"
import { SvgIcons } from "some-ui-shared"

import SearchBarToggleDemo from "./searchbar-toggle-btn-demo"

type Meta = MetaObj<typeof SearchBarToggleDemo>
type Story = StoryObj<typeof SearchBarToggleDemo>

export const Default: Story = {
  args: {
    children: (
      <SvgIcons.cross className="size-3 shrink-0 text-muted-foreground transition-transform hover:scale-105 hover:text-pink-500" />
    ),
    variant: "secondary",
  },
}

export default { component: SearchBarToggleDemo } as Meta
