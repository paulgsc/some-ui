import { ScheduledElementsList } from "some-ui-slideshow"
import { DoxPrompt } from "umag"

const ScheduledElementsClient = (): React.JSX.Element => {
  return (
    <div className="size-full">
      <ScheduledElementsList />
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
