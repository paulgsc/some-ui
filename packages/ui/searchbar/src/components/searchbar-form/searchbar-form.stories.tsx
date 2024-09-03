import type { Meta as MetaObj, StoryObj } from "@storybook/react"

import SearchBarForm from "./searchbar-form"

type Meta = MetaObj<typeof SearchBarForm>
type Story = StoryObj<typeof SearchBarForm>

export const Default: Story = {
  args: {
    config: {
      defaultValue: "",
      menu: ["foo", "bar"],
    },
    param: "foo",
  },
}

export default { component: SearchBarForm } as Meta
