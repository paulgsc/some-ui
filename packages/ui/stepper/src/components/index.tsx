import { useState } from "react"
import type { FC } from "react"
import { Button, Card, CardContent, SvgIcons } from "some-ui-shared"
import { cn } from "some-ui-utils"

type Step = {
    id: number;
    label: string;
    status: 'complete' | 'current' | 'upcoming';
}

type StepperProps = {
  steps: Array<Step>
  initialStep?: number
}

const Stepper: FC<StepperProps> = ({ steps = [], initialStep = 1 }) => {
  const [currentStep, setCurrentStep] = useState(initialStep)

  if (steps.length === 0) {
    return <></>
  }

  return (
    <Card className="mx-auto w-full max-w-4xl">
      <CardContent className="pt-6">
        <div className="relative flex justify-between">
          {steps.map((step, index) => (
            <div key={index} className="flex flex-col items-center">
              <div className="flex size-10 items-center justify-center rounded-full border-2 border-primary bg-background">
                {index < currentStep - 1 ? (
                  <SvgIcons.check className="size-6 text-primary" />
                ) : (
                  <span
                    className={cn(
                      "text-sm font-medium",
                      index === currentStep - 1
                        ? "text-primary"
                        : "text-muted-foreground"
                    )}
                  >
                    {index + 1}
                  </span>
                )}
              </div>
              <Button
                variant="link"
                className={cn(
                  "mt-2 text-xs",
                  index === currentStep - 1
                    ? "font-medium text-primary"
                    : "text-muted-foreground"
                )}
                onClick={() => {
                  setCurrentStep(index + 1)
                }}
              >
                {step.label}
              </Button>
              {index < steps.length - 1 && (
                <div
                  className="absolute inset-x-0 top-5 -z-10 h-[2px] bg-muted"
                  style={{
                    left: `calc(${(index + 1) * (100 / (steps.length - 1))}% - ${10 / (steps.length - 1)}rem)`,
                    width: `calc(${100 / (steps.length - 1)}% - ${20 / (steps.length - 1)}rem)`,
                  }}
                />
              )}
            </div>
          ))}
        </div>
        <Card className="mt-6">
          <CardContent className="pt-6">
            <p className="text-muted-foreground">
              {steps[currentStep - 1]?.content || "No content available"}
            </p>
          </CardContent>
        </Card>
        <div className="mt-6 flex justify-between">
          <Button
            onClick={() => {
              setCurrentStep((prev) => Math.max(prev - 1, 1))
            }}
            disabled={currentStep === 1}
          >
            Previous
          </Button>
          <Button
            onClick={() => {
              setCurrentStep((prev) => Math.min(prev + 1, steps.length))
            }}
            disabled={currentStep === steps.length}
          >
            Next
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
export default Stepper
