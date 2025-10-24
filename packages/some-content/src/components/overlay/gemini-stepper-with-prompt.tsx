import { GeminiStepper } from "some-ui-stepper"
import { DoxPrompt } from "umag"

type GeminiStepperWithPromptProps = {
  steps: Array<any>
  autoplay: boolean
}

const GeminiStepperWithPrompt = ({
  steps,
  autoplay,
}: GeminiStepperWithPromptProps): React.JSX.Element => {
  return (
    <div className="size-full bg-accent">
      <GeminiStepper steps={steps} autoplay={autoplay} />
      <DoxPrompt className="fixed bottom-24 end-4" />
    </div>
  )
}

export default GeminiStepperWithPrompt
