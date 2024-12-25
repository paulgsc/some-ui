import { useState } from "react"
import type { Meta as MetaObj, StoryFn } from "@storybook/react"
import { cn } from "some-ui-utils"

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

export const NavBarMotion: Story = () => {
  const [activeTab, setActiveTab] = useState(0)

  const handleTabChange = (tabId: number) => {
    setActiveTab(tabId)
    confetti({
      particleCount: 100,
      spread: 70,
      origin: { y: 0.3 },
      colors: ["#818CF8", "#C7D2FE", "#E0E7FF"],
    })
  }

  return (
    <NavBarStepper className="">
      <NavBarStepperList className="m-0 size-full border border-red-500">
        {items.map((item, index) => (
          <NavBarStepperListItem
            key={index}
            className={cn("h-24 bg-green-500 before:bg-red-500")}
            stepId={index}
            activeStep={activeTab}
          >
            <NavBarStepperBtn
              stepId={index}
              handleClickStep={handleTabChange}
              isActiveCell={index === activeTab}
            >
              <span className=" relative z-20">{`item: ${index} active: ${index === activeTab}`}</span>
            </NavBarStepperBtn>
          </NavBarStepperListItem>
        ))}
      </NavBarStepperList>
    </NavBarStepper>
  )
}
