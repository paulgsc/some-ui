import type { Meta as MetaObj, StoryObj } from "@storybook/react-vite"

import { NeonCard } from "."

type Story = StoryObj<typeof NeonCard>
type Meta = MetaObj<typeof NeonCard>

export const Default: Story = {
  args: {
    className: "p-8 max-w-md",
    children: (
      <>
        <h1 className="mb-4 text-2xl font-bold text-white">Neon Container</h1>
        <p className="text-gray-300">
          This container has a beautiful neon glow effect that pulses gently.
          You can adjust the glow intensity by passing the glowIntensity prop.
        </p>
      </>
    ),
  },
  render: (args) => (
    <main className="flex h-52 flex-col items-center justify-center bg-black p-24">
      <NeonCard {...args} />
    </main>
  ),
}

export default {
  title: "UI/NeonSign/Components/NeonCard",
  component: NeonCard,
} as Meta
