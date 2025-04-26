import type { FC } from "react"
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@stepper/components/gemini-stepper/stepper-accordion"
import type { StepKey } from "@stepper/hooks/use-accordion-stepper"
import { useAccordionStepper } from "@stepper/hooks/use-accordion-stepper"
import type { AccordionSteps } from "@stepper/types/accordion-stepper"
import { Card, CardTitle } from "some-ui-shared"
import { cn } from "some-ui-utils"

type GeminiStepperProps = {
  steps: AccordionSteps
  autoplay?: boolean
}

export const GeminiStepper: FC<GeminiStepperProps> = ({
  steps,
  autoplay = false,
}) => {
  const k = 3
  const { visibleSteps, setCurrStepId, currStepId } = useAccordionStepper({
    stepsToShow: k,
    autoplay,
    steps,
  })
  return (
    <Card
      className={cn(
        "relative flex size-full max-w-lg flex-col overflow-clip bg-pink-50 bg-gradient-to-br p-2.5",
        ""
      )}
    >
      <div className="wavy-border absolute inset-x-0 -top-0 z-10 h-10 bg-[oklch(85%_0.12_340/_0.3)]"></div>
      <CardTitle className="z-50 h-fit max-h-24 py-2.5 ps-4 text-lg font-semibold capitalize tracking-wide text-pink-950">
        {steps.meta.title}
      </CardTitle>
      <Accordion
        type="single"
        collapsible
        className="size-full flex-1 shrink-0 overflow-hidden bg-gradient-to-br pb-3"
        value={currStepId}
        onValueChange={(val) => {
          const step = (/^step_\d+$/.test(val) ? val : "step_0") as StepKey
          setCurrStepId(step)
        }}
      >
        {visibleSteps.map((step, i) => {
          const curr = parseInt(currStepId.split("_")[1], 0)
          const icon = curr > i ? "done" : curr === i ? "progress" : "milestone"
          return (
            <AccordionItem
              key={`stepper_item_${i}`}
              value={`step_${i}`}
              className="h-fit w-full"
              icon={icon}
            >
              <AccordionTrigger className="text-md font-bold tracking-wider text-amber-800">
                {step.title}
              </AccordionTrigger>
              <AccordionContent
                className={cn(
                  "inset-shadow-sm strawberry-moon relative w-11/12 rounded-sm px-2 font-semibold text-white"
                )}
              >
                <div className="wavy-border absolute inset-x-0 -top-0 z-10 h-2 bg-pink-50"></div>
                {step.content}
              </AccordionContent>
            </AccordionItem>
          )
        })}
      </Accordion>
    </Card>
  )
}
