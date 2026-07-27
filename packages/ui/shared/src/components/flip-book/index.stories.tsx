import type { Meta as MetaObj, StoryObj } from "@storybook/react-vite"

import AccordionDemo from "."

type Meta = MetaObj<typeof AccordionDemo>
type Story = StoryObj<typeof AccordionDemo>

export const Default: Story = {
  args: {
    param: "foo",
  },
}

const meta = {
  title: "AccordionDemo",
  component: AccordionDemo,
} satisfies Meta

export default meta
