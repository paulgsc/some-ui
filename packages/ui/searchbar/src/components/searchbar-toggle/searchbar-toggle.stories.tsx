import type { Meta as MetaObj, StoryObj } from "@storybook/react"
import { SvgIcons } from "some-ui-shared"

import { CloseSearchBarBtn } from "./searchbar-toggle"

type Meta = MetaObj<typeof CloseSearchBarBtn>
type Story = StoryObj<typeof CloseSearchBarBtn>

export const Default: Story = {
  args: {
    children: (
      <SvgIcons.cross className="text-muted-foreground size-3 shrink-0 transition-transform hover:scale-105 hover:text-pink-500" />
    ),
    variant: "secondary",
  },
}

export default { component: CloseSearchBarBtn } as Meta
