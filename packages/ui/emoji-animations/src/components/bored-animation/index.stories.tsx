import type { Meta as MetaObj, StoryObj } from "@storybook/react"

import BoredAnimation from "."

type Meta = MetaObj<typeof BoredAnimation>
type Story = StoryObj<typeof BoredAnimation>

export default {
  title: "Animations/Components/Bored",
  component: BoredAnimation,
} as Meta

export const Complete: Story = {}

export const GridLayout: Story = {
  args: {
    className: "z-10 size-fit",
  },
  render: (args) => {
    return (
      <div className="group z-0 grid h-screen w-screen grid-rows-3 ">
        {/* Place the component in the [1, 2] grid cell */}
        <div />
        <div className="z-0 grid grid-cols-3 items-center">
          <div className="col-start-3 flex size-full justify-end pe-8">
            <BoredAnimation {...args} />
          </div>
        </div>
        <div />
      </div>
    )
  },
}
