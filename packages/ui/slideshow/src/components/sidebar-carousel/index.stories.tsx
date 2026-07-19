import type { Meta as MetaObj, StoryObj } from "@storybook/react-vite"

import { SidebarCarousel } from "."

type Story = StoryObj<typeof SidebarCarousel>
type Meta = MetaObj<typeof SidebarCarousel>

export const Default: Story = {
  args: {
    end: 3,
    className: "bg-red-500 w-full h-96",
  },
  render: (args) => {
    return (
      <main className="flex min-h-screen w-full justify-start ">
        <SidebarCarousel {...args} />
      </main>
    )
  },
}

const meta = {
  title: "UI/SlideShow/Components/SidebarCarousel",
  component: SidebarCarousel,
} satisfies Meta

export default meta
