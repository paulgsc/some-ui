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
  const { setCurrStepId, currStepId } = useAccordionStepper({
    totalSteps: 3,
    autoplay,
  })
  return (
    <Card
      className={cn(
        "flex size-full max-w-lg flex-col items-start justify-start gap-y-2.5 bg-slate-200 bg-gradient-to-br p-2.5"
      )}
    >
      <CardTitle className="py-2.5 ps-4 font-semibold capitalize tracking-wide">
        {steps.meta.title}
      </CardTitle>
      <Accordion
        type="single"
        collapsible
        className="w-full max-w-lg bg-slate-200 bg-gradient-to-br"
        value={currStepId}
        onValueChange={(val) => {
          const step = (/^step_\d+$/.test(val) ? val : "step_0") as StepKey
          setCurrStepId(step)
        }}
      >
        {steps.data.map((step, i) => {
          const curr = parseInt(currStepId.split("_")[1], 0)
          const icon = curr > i ? "done" : curr === i ? "progress" : "milestone"
          return (
            <AccordionItem
              key={`stepper_item_${i}`}
              value={`step_${i}`}
              className=""
              icon={icon}
            >
              <AccordionTrigger>{step.title}</AccordionTrigger>
              <AccordionContent>{step.content}</AccordionContent>
            </AccordionItem>
          )
        })}
      </Accordion>
    </Card>
  )
}
