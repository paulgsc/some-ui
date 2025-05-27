import type { Meta as MetaObj, StoryObj } from "@storybook/react"

import { Tatu } from "."

type Story = StoryObj<typeof Tatu>
type Meta = MetaObj<typeof Tatu>

export const Default: Story = {
  render: () => (
    <main className="absolute inset-0 flex items-center justify-center bg-gray-800">
      <Tatu />
    </main>
  ),
}

export default {
  title: "UI/Shared/Components/Tatu",
  component: Tatu,
} as Meta
