import type { Meta as MetaObj, StoryObj } from "@storybook/react-vite"

import { TVStaticAnimation } from "."

type Story = StoryObj<typeof TVStaticAnimation>
type Meta = MetaObj<typeof TVStaticAnimation>

export const Default: Story = {
  args: {},
}

const meta = {
  title: "UI/Slideshow/Components/TVStaticAnimation",
  component: TVStaticAnimation,
} satisfies Meta

export default meta
