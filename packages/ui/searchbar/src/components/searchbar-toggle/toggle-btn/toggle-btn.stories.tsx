import type { Meta as MetaObj, StoryObj } from "@storybook/react"
import { SvgIcons } from "some-ui-shared"

import { CloseSearchBarBtn } from "./toggle-btn"

type Meta = MetaObj<typeof CloseSearchBarBtn>
type Story = StoryObj<typeof CloseSearchBarBtn>

export const Default: Story = {
  args: {
    children: (
      <SvgIcons.cross className="size-3 shrink-0 text-muted-foreground transition-transform hover:scale-105 hover:text-pink-500" />
    ),
    variant: "secondary",
  },
}

export default { component: CloseSearchBarBtn } as Meta
