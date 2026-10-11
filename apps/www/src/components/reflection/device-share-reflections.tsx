/**
 * Sharing reflections out through the share sheet. Device build only, like
 * this module (`build.paths.ts`): render it behind an inline
 * `import.meta.env.VITE_DEVICE_BACKEND === "true"`.
 */
import type { JSX, ReactNode } from "react"
import type { ButtonProps } from "@some-ui/shared"
import { Share2 } from "lucide-react"

import { shareReflections } from "@/lib/agent-export"
import { useAsyncIntent } from "@/lib/intent"
import { IntentButton } from "@/lib/intent/render"

export const DeviceShareReflections = ({
  sessionIds,
  label,
  size = "sm",
  variant,
  className,
}: {
  sessionIds: ReadonlyArray<string>
  label: ReactNode
  size?: ButtonProps["size"]
  variant?: ButtonProps["variant"]
  className?: string
}): JSX.Element => {
  const share = useAsyncIntent(() => shareReflections(sessionIds), {
    presentation: "interactive",
  })
  return (
    <IntentButton
      state={share.state}
      onPress={() => share.start(undefined)}
      size={size}
      variant={variant}
      className={className}
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
