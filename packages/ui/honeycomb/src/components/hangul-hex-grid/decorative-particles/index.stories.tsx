import type { Meta, StoryObj } from "@storybook/react-vite"

import { DecorativeParticles } from "."

const meta: Meta<typeof DecorativeParticles> = {
  title: "UI/Honeycomb/Hangul/Components/DecorativeParticles",
  component: DecorativeParticles,
  parameters: { layout: "fullscreen" },
  decorators: [
    (Story) => (
      <div className="relative h-[500px] w-full overflow-hidden bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof DecorativeParticles>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {}
