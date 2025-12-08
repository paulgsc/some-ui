import { ScheduledElementsList } from "some-ui-slideshow"
import { useOrchestrator } from "some-ui-utils"
import { DoxPrompt } from "umag"

const ScheduledElementsClient = (): React.JSX.Element => {
  const {
    state: { current_time, scheduled_elements },
  } = useOrchestrator({
    stream_id: "test",
    scenes: [],
    autoStart: false,
  })

  return (
    <div className="size-full">
      <ScheduledElementsList
        elements={scheduled_elements}
        currentTime={current_time}
      />
      <DoxPrompt className="fixed bottom-24 end-4" />
    </div>
  )
}

const ScheduledElementsWrapper = (): React.JSX.Element => {
  // SSR-safe check
  if (typeof window === "undefined") {
    // Return a placeholder or nothing during SSR
    return <div aria-hidden="true" />
  }

  // Only render the client component in the browser
  return <ScheduledElementsClient />
}

export default ScheduledElementsWrapper
