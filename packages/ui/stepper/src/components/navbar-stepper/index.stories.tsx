import type { Meta as MetaObj, StoryFn } from "@storybook/react"

import {
  NavBarStepper,
  NavBarStepperBtn,
  NavBarStepperList,
  NavBarStepperListItem,
} from "."

type Meta = MetaObj<typeof NavBarStepper>
type Story = StoryFn<typeof NavBarStepper>

export default {
  title: "NavBar Stepper",
  component: NavBarStepper,
  subcomponents: {
    NavBarStepperList,
    NavBarStepperListItem,
    NavBarStepperBtn,
  },
} as Meta

export const NavBarStepperCard: Story = () => (
  <NavBarStepper className="h-24">
    <p> Stepper Card</p>
  </NavBarStepper>
)

const items = ["foo", "bar", "zar", "foobar"]

export const NavBarStepperSimpleText: Story = () => (
  <NavBarStepper className="">
    <NavBarStepperList className="">
      {items.map((item, index) => (
        <NavBarStepperListItem key={index} className="">
          {item}
        </NavBarStepperListItem>
      ))}
    </NavBarStepperList>
  </NavBarStepper>
)
