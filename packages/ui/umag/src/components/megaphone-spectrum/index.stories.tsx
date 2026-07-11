import type { Meta as MetaObj, StoryObj } from "@storybook/react-vite"

import { MegaphoneSpectrum } from "."

type Story = StoryObj<typeof MegaphoneSpectrum>
type Meta = MetaObj<typeof MegaphoneSpectrum>

export const Default: Story = {
  args: {
    isActive: true,
  },
}

const meta = {
  title: "UI/Umag/Components/MegaphoneSpectrum",
  component: MegaphoneSpectrum,
} satisfies Meta

export default meta
