import type { JSX, ReactNode } from "react"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@some-ui/shared"

/** A bottom sheet for reflecting or handing off; its body mounts only open. */
export const ReflectionSheet = ({
  open,
  onOpenChange,
  title,
  description,
  children,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: ReactNode
  description: ReactNode
  children: ReactNode
}): JSX.Element => (
  <Sheet open={open} onOpenChange={onOpenChange}>
    <SheetContent
      side="bottom"
      data-scroll-intent="reflections"
      className={
        // scroll-intent: reflections — a session's list of them, or the
        // hand-off list, can outgrow a phone held sideways; the sheet
        // scrolls rather than clipping a Let go button.
        "max-h-[90dvh] gap-0 overflow-y-auto pb-[max(1.5rem,env(safe-area-inset-bottom))]"
      }
    >
      <SheetHeader className="px-0 text-left">
        <SheetTitle>{title}</SheetTitle>
        <SheetDescription>{description}</SheetDescription>
      </SheetHeader>
      <div className="mt-4">{open && children}</div>
    </SheetContent>
  </Sheet>
)
