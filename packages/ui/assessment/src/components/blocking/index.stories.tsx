import type { Meta as MetaObj, StoryObj } from "@storybook/react-vite"

import { TechnicalBlockAssessment } from "."

type Story = StoryObj<typeof TechnicalBlockAssessment>
type Meta = MetaObj<typeof TechnicalBlockAssessment>

export const Default: Story = {
  args: {
    songTitle: "Strawberry Moon",
    artist: "IU",
  },
}

const meta = {
  title: "UI/Assessment/Components/TechnicalBlockAssessment",
  component: TechnicalBlockAssessment,
} satisfies Meta

export default meta
