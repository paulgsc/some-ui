import type { Meta as MetaObj, StoryObj } from "@storybook/react"

import { AntSvg } from "."

type Story = StoryObj<typeof AntSvg>
type Meta = MetaObj<typeof AntSvg>

export const Default: Story = {}

export default {
  title: "UI/Shared/Icons/AntSvg",
  component: AntSvg,
} as Meta
