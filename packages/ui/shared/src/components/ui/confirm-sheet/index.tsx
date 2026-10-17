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
 * bottom of the phone in the app's own theme, where `window.confirm` showed
 * the WebView's grey box with OK and Cancel. `ask` opens it; render `sheet`
 * once, anywhere in the component. A yes runs `onConfirm` and closes it.
 */
export function useConfirmSheet(): {
  ask: (request: ConfirmRequest) => void
  sheet: JSX.Element
} {
  const [request, setRequest] = useState<ConfirmRequest | null>(null)
  const close = (): void => setRequest(null)
  const sheet = (
    <Sheet open={request !== null} onOpenChange={(open) => !open && close()}>
      <SheetContent side="bottom" className="rounded-t-3xl px-5 pt-6 pb-8">
        <SheetHeader className="px-0 text-left">
          <SheetTitle className="text-xl">{request?.title}</SheetTitle>
          <SheetDescription className="text-base">
            {request?.description}
          </SheetDescription>
        </SheetHeader>
        <div className="mt-6 flex flex-col gap-2.5">
          <Button
            variant="destructive"
            size="lg"
            className="h-12 rounded-2xl text-base"
            onClick={() => {
              request?.onConfirm()
              close()
            }}
          >
            {request?.confirm}
          </Button>
          <Button
            variant="outline"
            size="lg"
            className="h-12 rounded-2xl text-base"
            onClick={close}
          >
            {request?.keep ?? "Keep it"}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  )
  return { ask: setRequest, sheet }
}
