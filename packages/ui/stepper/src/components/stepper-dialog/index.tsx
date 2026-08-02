import type { JSX } from "react"
import { Button, Dialog, DialogContent, DialogTrigger } from "@some-ui/shared"
import { TimelineEditor } from "some-ui-input"

export const StepperDialog = (): JSX.Element => {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="outline">Share</Button>
      </DialogTrigger>
      <DialogContent className="inset-0 m-0 size-full max-h-none !max-w-none translate-x-0 translate-y-0 p-0">
        <TimelineEditor />
      </DialogContent>
    </Dialog>
  )
}
