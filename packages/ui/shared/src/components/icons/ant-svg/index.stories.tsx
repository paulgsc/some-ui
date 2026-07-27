import type { Meta as MetaObj, StoryObj } from "@storybook/react-vite"

import { AntSvg } from "."

type Story = StoryObj<typeof AntSvg>
type Meta = MetaObj<typeof AntSvg>

export const Default: Story = {}

const meta = {
  title: "UI/Shared/Icons/AntSvg",
  component: AntSvg,
} satisfies Meta

export default meta
