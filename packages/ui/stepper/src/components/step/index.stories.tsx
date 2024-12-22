import type { Meta, Story } from "@storybook/react"

import {
  Step,
  StepDescription,
  StepEnd,
  StepMiddle,
  StepStart,
  StepTitle,
} from "."

export default {
  title: "Components/Stepper",
  component: Step,
  subcomponents: { StepStart, StepMiddle, StepEnd, StepTitle, StepDescription },
} as Meta

export const BasicStepper: Story = () => (
  <div style={{ display: "flex", gap: "8px" }}>
    <Step>
      <StepStart className="text-red-500" />
      <StepTitle>Start</StepTitle>
    </Step>
    <Step>
      <StepMiddle className="text-blue-500" />
      <StepTitle>Middle</StepTitle>
      <StepDescription>Description for Middle</StepDescription>
    </Step>
    <Step>
      <StepEnd className="text-green-500" />
      <StepTitle>End</StepTitle>
    </Step>
  </div>
)

export const WithIcons: Story = () => (
  <div style={{ display: "flex", gap: "8px" }}>
    <Step>
      <StepStart className="text-red-500" />
      <StepTitle>
        <span role="img" aria-label="rocket">
          🚀
        </span>{" "}
        Start
      </StepTitle>
    </Step>
    <Step>
      <StepMiddle className="text-blue-500" />
      <StepTitle>
        <span role="img" aria-label="gear">
          ⚙️
        </span>{" "}
        Middle
      </StepTitle>
      <StepDescription>
        This step includes additional configuration
      </StepDescription>
    </Step>
    <Step>
      <StepEnd className="text-green-500" />
      <StepTitle>
        <span role="img" aria-label="check">
          ✔️
        </span>{" "}
        End
      </StepTitle>
    </Step>
  </div>
)

export const CustomizedStyling: Story = () => (
  <div
    style={{
      display: "flex",
      gap: "8px",
      backgroundColor: "#f0f0f0",
      padding: "16px",
      borderRadius: "8px",
    }}
  >
    <Step>
      <StepStart className="text-pink-500" />
      <StepTitle>Custom Start</StepTitle>
    </Step>
    <Step>
      <StepMiddle className="text-purple-500" />
      <StepTitle>Custom Middle</StepTitle>
    </Step>
    <Step>
      <StepEnd className="text-orange-500" />
      <StepTitle>Custom End</StepTitle>
    </Step>
  </div>
)
