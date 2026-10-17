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
import { useConfirmSheet } from "@some-ui/shared"
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
  const { ask, sheet } = useConfirmSheet()
  useIntentEffect(share, ({ outcome, sent }) => {
    if (outcome !== "shared" || sent.length === 0) return
    ask({
      title: "Did they arrive?",
      description: `Once they have, ${counted(sent.length)} can leave this phone.`,
      confirm: "They arrived: let them go",
      keep: "Keep them to share again",
      onConfirm: () => handOff(sent),
    })
  })
  return (
    <>
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
      {sheet}
    </>
  )
}
