import type { Meta as MetaObj, StoryObj } from "@storybook/react-vite"

import AccordionDemo from "."

type Meta = MetaObj<typeof AccordionDemo>
type Story = StoryObj<typeof AccordionDemo>

export const Default: Story = {
  args: {
    param: "foo",
  },
}

export default {
  title: "AccordionDemo",
  component: AccordionDemo,
} as Meta
