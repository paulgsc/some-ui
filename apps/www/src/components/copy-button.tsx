/**
 * One press copies `text` (`lib/clipboard`): "Copy", then "Copied", or the
 * failure and its retry. `what` names it for the button's title.
 */
import type { JSX } from "react"

import { copyText } from "@/lib/clipboard"
import { useAsyncIntent } from "@/lib/intent"
import { IntentButton } from "@/lib/intent/render"

export const CopyButton = ({
  text,
  what,
}: {
  text: string
  what: string
}): JSX.Element => {
  const copy = useAsyncIntent(() => copyText(text), {
    presentation: "interactive",
  })
  return (
    <IntentButton
      state={copy.state}
      onPress={() => copy.start(undefined)}
      variant="outline"
      size="sm"
      idleLabel="Copy"
      workingLabel="Copying…"
      succeededLabel="Copied"
      title={`Copy ${what}`}
    />
  )
}
