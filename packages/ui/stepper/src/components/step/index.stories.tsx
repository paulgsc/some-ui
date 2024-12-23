import type { Meta, Story } from "@storybook/react"

import {
  Step,
  StepDescription,
  StepEnd,
  StepMiddle,
  Stepper,
  StepStart,
  StepTitle,
} from "."

export default {
  title: "Components/Stepper",
  component: Step,
  subcomponents: { StepStart, StepMiddle, StepEnd, StepTitle, StepDescription },
} as Meta

export const StepperCard: Story = () => (
  <Stepper className="h-20 w-full bg-sky-400" />
)

export const StepperWithEmptySteps: Story = () => (
  <Stepper className="m-0.5 flex h-20 w-full flex-1 items-center justify-between pe-1.5 ps-1.5">
    <Step className="size-full rounded-sm border border-black odd:bg-pink-400 even:bg-sky-400">
      Step 1
    </Step>
    <Step className="size-full rounded-sm border border-black odd:bg-pink-400 even:bg-sky-400">
      Step 2
    </Step>
    <Step className="size-full rounded-sm border border-black odd:bg-pink-400 even:bg-sky-400">
      Step 3
    </Step>
    <Step className="size-full rounded-sm border border-black odd:bg-pink-400 even:bg-sky-400">
      Step 4
    </Step>
  </Stepper>
)

export const WithStepSvgs: Story = () => (
  <Stepper className="z-0 m-0.5 flex h-20 w-full flex-1 items-center justify-between gap-0 bg-blue-200 pe-1.5 ps-1.5">
    {Array.from({ length: 4 }, (_, i) => (
      <Step
        key={i}
        className="relative z-0 size-full [&:nth-child(even)]:text-blue-200 [&:nth-child(odd)]:text-gray-300"
      >
        {i === 0 ? (
          <StepStart className="absolute inset-0 z-20 bg-transparent stroke-inherit" />
        ) : i == 3 ? (
          <StepEnd className="absolute inset-0 z-20 bg-transparent" />
        ) : (
          <StepMiddle className="absolute inset-0 z-20 bg-inherit" />
        )}
      </Step>
    ))}
  </Stepper>
)
const NeonSignDemo = () => (
  <div className="flex min-h-screen items-start justify-center bg-none">
    <div className="relative">
      {/* Border container with blue neon effect */}
      <div
        className="relative animate-pulse-slow rounded-lg border-4 border-blue-500 px-8 py-4
                                    [box-shadow:0_0_0.5rem_#3b82f6,inset_0_0_0.5rem_#3b82f6]"
      >
        <span className="text-4xl font-bold tracking-wider">
          {/* Gray letters */}
          <span className="text-gray-500">C</span>
          {/* Red O with neon effect */}
          <span
            className="animate-flicker-fast text-red-500
[text-shadow:0_0_0.5rem_#ef4444,0_0_1.5rem_#ef4444]"
          >
            O
          </span>
          {/* Gray letters */}
          <span className="text-gray-500">DE</span>
          {/* Red PEN with neon effect */}
          <span
            className="animate-flicker text-red-500
                                                                                                                                                                          [text-shadow:0_0_0.5rem_#ef4444,0_0_1.5rem_#ef4444]"
          >
            PEN
          </span>
        </span>
      </div>
    </div>
  </div>
)
export const NeonSign: Story = () => <NeonSignDemo />

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
