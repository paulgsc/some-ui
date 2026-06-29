import type { Meta as MetaObj, StoryObj } from "@storybook/react-vite"

import { SemiTable } from "."

type Story = StoryObj<typeof SemiTable>
type Meta = MetaObj<typeof SemiTable>

export const Default: Story = {}

export default {
  title: "UI/Makjang/Shapes/Tables/SemiTable",
  component: SemiTable,
} satisfies Meta
