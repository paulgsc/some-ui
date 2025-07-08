import { TimelineEditor } from "some-ui-input"
import {
  Button,
  Dialog,
  DialogContent,
  DialogOverlay,
  DialogPortal,
  DialogTrigger,
} from "some-ui-shared"

export const StepperDialog = () => {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="outline">Share</Button>
      </DialogTrigger>
      <DialogPortal>
        {/* This is the full screen overlay */}
        <DialogOverlay className="absolute relative inset-0" />
        {/* This replaces the centered flexbox */}
        <DialogContent
          className="absolute inset-0"
          // optionally remove focus outline, animations, etc.
        >
          <TimelineEditor />
        </DialogContent>
      </DialogPortal>
    </Dialog>
  )
}
