import type { Meta as MetaObj, StoryObj } from "@storybook/react-vite"

import { StudyScene } from "."

type Story = StoryObj<typeof StudyScene>
type Meta = MetaObj<typeof StudyScene>

export const Default: Story = {}

export default {
  title: "UI/Makjang/Components/StudyScene",
  component: StudyScene,
} as Meta
