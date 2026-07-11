import type { Meta as MetaObj, StoryObj } from "@storybook/react-vite"

import { NeonText } from "."

type Story = StoryObj<typeof NeonText>
type Meta = MetaObj<typeof NeonText>

export const Default: Story = {
  args: {
    className: "w-full max-w-xl h-40",
  },
  render: (args) => (
    <main className="w-screen">
      <NeonText {...args} />
    </main>
  ),
}

const meta = {
  title: "UI/NeonSign/Components/NeonText",
  component: NeonText,
} satisfies Meta

export default meta
