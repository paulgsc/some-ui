/**
 * Sharing reflections out through the share sheet. Device build only, like
 * this module (`build.paths.ts`).
 *
 * Android says "shared" once the person picks an app, even if they back out
 * of it, so nothing is let go on that alone: the person says whether they
 * arrived, and only then do they leave the phone (`handOff`).
 */
import type { JSX, ReactNode } from "react"
import type { ButtonProps } from "@some-ui/shared"
import { Share2 } from "lucide-react"

import { handOff, shareReflections } from "@/lib/agent-export"
import { useAsyncIntent, useIntentEffect } from "@/lib/intent"
import { IntentButton } from "@/lib/intent/render"

import { counted } from "./copy"

export const DeviceShareReflections = ({
  sessionIds,
  label,
  title,
  size = "sm",
  variant,
  className,
}: {
  sessionIds: ReadonlyArray<string>
  label: ReactNode
  /** The button's name when `label` alone does not say whose these are. */
  title?: string
  size?: ButtonProps["size"]
  variant?: ButtonProps["variant"]
  className?: string
}): JSX.Element => {
  const share = useAsyncIntent(() => shareReflections(sessionIds), {
    presentation: "interactive",
  })
  useIntentEffect(share.state, ({ outcome, sent }) => {
    if (outcome !== "shared" || sent.length === 0) return
    if (
      confirm(
        `Did they arrive? OK lets ${counted(sent.length)} go from this phone; Cancel keeps them here to share again.`
      )
    )
      handOff(sent)
  })
  return (
    <IntentButton
      state={share.state}
      onPress={() => share.start(undefined)}
      size={size}
      variant={variant}
      className={className}
      title={title}
      idleLabel={
        <>
          <Share2 className="mr-1.5 size-3.5" aria-hidden />
          {label}
        </>
      }
      workingLabel="Preparing..."
    />
  )
}
