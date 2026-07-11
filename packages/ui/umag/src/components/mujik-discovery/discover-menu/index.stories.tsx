import type { Meta as MetaObj, StoryObj } from "@storybook/react-vite"

import { DropdownMenuDemo } from "."

type Story = StoryObj<typeof DropdownMenuDemo>
type Meta = MetaObj<typeof DropdownMenuDemo>

export const Default: Story = {
  args: {},
  render: () => (
    <main className="flex w-full justify-center">
      <DropdownMenuDemo />
    </main>
  ),
}

const meta = {
  title: "UI/Umag/Components/DropdownMenuDemo",
  component: DropdownMenuDemo,
} satisfies Meta

export default meta
