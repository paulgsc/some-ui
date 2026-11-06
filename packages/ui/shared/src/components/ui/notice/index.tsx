/**
 * What the app says about what was just done (a refusal, a warning, "saved",
 * "loading"), said over the screen and never in it: a person who tapped is
 * still using the screen, so its layout holds and the words land on the plane
 * above it, as a toast does (HS1, `docs/ui-fit/README.md` 2i).
 *
 * `Notice` shows while it is mounted, so a call site reads as it would in the
 * flow (`{refused && <Notice tone="danger">…</Notice>}`). It lands on the
 * plane of the nearest `NoticeLayer` (the shell's, under its header), or,
 * under none, on one the first notice puts at the top of the page.
 *
 * A notice nothing else takes away is `dismissible`: it keeps its own closed
 * state, so a call site keys it by what it says (`key={line}`) and a new line
 * is said again. `onDismiss` is for a close that changes real state. Its role
 * follows its tone (`danger` is an alert, the rest are status) unless given.
 */
import type { JSX, ReactNode } from "react"
import { createContext, useContext, useState } from "react"
import { X } from "lucide-react"
import { createPortal } from "react-dom"

import { cn } from "../../../lib/utils"
import { Button } from "../button"

const PLANE_CLASSES =
  "pointer-events-none fixed inset-x-0 z-[60] mx-auto flex w-full max-w-md flex-col gap-2 px-4"

/** The plane of the nearest `NoticeLayer`; `null` until it is mounted. */
const PlaneContext = createContext<HTMLElement | null | undefined>(undefined)

/**
 * A screen layout's plane for notices, placed by `className` (the www shell
 * puts it under its header), around the screens whose notices land on it.
 * Everything on it floats over them and takes no room in them.
 */
export const NoticeLayer = ({
  className,
  children,
}: {
  className?: string
  children: ReactNode
}): JSX.Element => {
  const [plane, setPlane] = useState<HTMLElement | null>(null)
  return (
    <PlaneContext.Provider value={plane}>
      <div
        ref={setPlane}
        data-notice-plane=""
        className={cn(PLANE_CLASSES, className)}
      />
      {children}
    </PlaneContext.Provider>
  )
}

let atTop: HTMLElement | null = null

/** One plane at the top of the page, for notices under no `NoticeLayer`. */
function topPlane(): HTMLElement {
  if (!atTop?.isConnected) {
    atTop = document.createElement("div")
    atTop.dataset["noticePlane"] = ""
    atTop.className = cn(PLANE_CLASSES, "top-3")
    document.body.append(atTop)
  }
  return atTop
}

const TONES = {
  neutral: "text-foreground",
  warning: "border-warning/50 text-warning",
  danger: "border-destructive/50 text-destructive",
} as const

/** A button the notice holds: what to do about what it says. */
export type NoticeAction = {
  label: ReactNode
  onClick: () => void
  disabled?: boolean
}

export type NoticeProps = {
  children: ReactNode
  /** Defaults to `alert` for a `danger` tone and `status` otherwise. */
  role?: "alert" | "status"
  tone?: keyof typeof TONES
  /**
   * Shown with a close button, and closed until it is mounted again: for a
   * notice nothing else takes away. Key it by what it says.
   */
  dismissible?: boolean
  /** Shown as a close button: for a close that changes real state. */
  onDismiss?: () => void
  action?: NoticeAction | undefined
  className?: string
}

export const Notice = ({
  children,
  role,
  tone = "neutral",
  dismissible = false,
  onDismiss,
  action,
  className,
}: NoticeProps): JSX.Element | null => {
  const layer = useContext(PlaneContext)
  const [closed, setClosed] = useState(false)
  if (closed) return null
  const plane = layer === undefined ? topPlane() : layer
  if (plane === null) return null
  const closes = dismissible || onDismiss !== undefined
  return createPortal(
    <div
      role={role ?? (tone === "danger" ? "alert" : "status")}
      data-notice=""
      className={cn(
        "bg-background pointer-events-auto flex items-start gap-2 rounded-lg border px-3 py-2 text-sm shadow-lg",
        TONES[tone],
        className
      )}
    >
      <div className="min-w-0 flex-1">
        {children}
        {action === undefined ? null : (
          <div className="mt-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={action.disabled}
              onClick={action.onClick}
            >
              {action.label}
            </Button>
          </div>
        )}
      </div>
      {closes ? (
        <button
          type="button"
          aria-label="Dismiss"
          onClick={() => {
            if (dismissible) setClosed(true)
            onDismiss?.()
          }}
          className="text-muted-foreground -m-1 shrink-0 p-1"
        >
          <X aria-hidden className="size-4" />
        </button>
      ) : null}
    </div>,
    plane
  )
}
