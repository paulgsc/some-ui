import type { Meta as MetaObj, StoryObj } from "@storybook/react-vite"

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

const meta = {
  title: "UI/Shared/Components/Tatu",
  component: Tatu,
} satisfies Meta

export default meta
