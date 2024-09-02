import type { Meta as MetaObj, StoryObj } from "@storybook/react"

import SearchBarFormDemo from "./searchbar-form-demo"

type Meta = MetaObj<typeof SearchBarFormDemo>
type Story = StoryObj<typeof SearchBarFormDemo>

export const Default: Story = {
  args: {
    config: {
      defaultValue: "",
      menu: ["foo", "bar"],
    },
    param: "foo",
  },
}

export default { component: SearchBarFormDemo } as Meta
