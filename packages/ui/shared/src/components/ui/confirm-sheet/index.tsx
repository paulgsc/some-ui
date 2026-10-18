import type { JSX } from "react"
import { useState } from "react"

import { Button } from "../button"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "../sheet"

/** One question a ConfirmSheet asks, and what a yes does. */
export type ConfirmRequest = {
  title: string
  description: string
  /** The button that goes ahead: says what happens ("Let it go"). */
  confirm: string
  /** The button that keeps things as they are. Defaults to "Keep it". */
  keep?: string
  onConfirm: () => void
}

/**
 * A question before something that cannot be undone, as a sheet from the
 * bottom of the phone in the app's own theme, shown while `open`. A yes runs
 * `onConfirm`; either answer, or dismissing it, closes it (`onOpenChange`).
 * For a question held outside the component; `useConfirmSheet` holds its own.
 */
export const ConfirmSheet = ({
  request,
  open,
  onOpenChange,
}: {
  request: ConfirmRequest | null
  open: boolean
  onOpenChange: (open: boolean) => void
}): JSX.Element => {
  // The last question stays put while the sheet slides away, so its words do
  // not blank out mid-animation; `open` alone says whether it shows.
  const [last, setLast] = useState(request)
  if (request !== null && request !== last) setLast(request)
  const shown = request ?? last
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="rounded-t-3xl px-5 pt-6 pb-8">
        <SheetHeader className="px-0 text-left">
          <SheetTitle className="text-xl">{shown?.title}</SheetTitle>
          <SheetDescription className="text-base">
            {shown?.description}
          </SheetDescription>
        </SheetHeader>
        <div className="mt-6 flex flex-col gap-2.5">
          <Button
            variant="destructive"
            size="lg"
            className="h-12 rounded-2xl text-base"
            onClick={() => {
              shown?.onConfirm()
              onOpenChange(false)
            }}
          >
            {shown?.confirm}
          </Button>
          <Button
            variant="outline"
            size="lg"
            className="h-12 rounded-2xl text-base"
            onClick={() => onOpenChange(false)}
          >
            {shown?.keep ?? "Keep it"}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  )
}

/**
 * `ConfirmSheet` with its question held here: `ask` opens it; render `sheet`
 * once, anywhere in the component.
 */
export function useConfirmSheet(): {
  ask: (request: ConfirmRequest) => void
  sheet: JSX.Element
} {
  const [request, setRequest] = useState<ConfirmRequest | null>(null)
  const [open, setOpen] = useState(false)
  const ask = (next: ConfirmRequest): void => {
    setRequest(next)
    setOpen(true)
  }
  return {
    ask,
    sheet: (
      <ConfirmSheet request={request} open={open} onOpenChange={setOpen} />
    ),
  }
}
