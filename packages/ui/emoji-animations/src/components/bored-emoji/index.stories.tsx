import type { Meta as MetaObj, StoryObj } from "@storybook/react-vite"

import BoredEmoji from "."

type Meta = MetaObj<typeof BoredEmoji>
type Story = StoryObj<typeof BoredEmoji>

const meta = {
  title: "Animations/Components/Bored Emoji",
  component: BoredEmoji,
} satisfies Meta

export default meta

export const Complete: Story = {
  args: {
    isSleeping: true,
  },
}
