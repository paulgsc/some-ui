/**
 * Sharing reflections out through the share sheet. Device build only, like
 * this module (`build.paths.ts`).
 *
 * Android says "shared" once the person picks an app, even if they back out
 * of it, so a share counts only once the person says it arrived
 * (`DeviceReflectionsArrival`).
 */
import type { JSX, ReactNode } from "react"
import type { ButtonProps } from "@some-ui/shared"
import { Share2 } from "lucide-react"

import type { ReflectionPick } from "@/lib/agent-export"
import { shareReflections } from "@/lib/agent-export"
import { useAsyncIntent } from "@/lib/intent"
import { IntentButton } from "@/lib/intent/render"

type Labelled =
  | {
      label: ReactNode
      /** The button's name when `label` alone does not say whose these are. */
      title?: string
    }
  /** The icon alone, named by `title`. */
  | { label?: undefined; title: string }

export const DeviceShareReflections = ({
  sessionIds,
  only,
  label,
  title,
  size = "sm",
  variant,
  className,
}: ReflectionPick &
  Labelled & {
    size?: ButtonProps["size"]
    variant?: ButtonProps["variant"]
    className?: string
  }): JSX.Element => {
  const share = useAsyncIntent(() => shareReflections({ sessionIds, only }), {
    presentation: "interactive",
  })
  const icon = (
    <Share2
      className={label === undefined ? "size-3.5" : "mr-1.5 size-3.5"}
      aria-hidden
    />
  )
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
          {icon}
          {label}
        </>
      }
      workingLabel={label === undefined ? icon : "Preparing..."}
    />
  )
}
