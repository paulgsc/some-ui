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

export default {
  title: "UI/Resume/Components/TechnicalBlockAssessment",
  component: TechnicalBlockAssessment,
} as Meta
