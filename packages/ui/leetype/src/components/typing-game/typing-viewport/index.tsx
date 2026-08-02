import type { FC } from "react"
import { useLayoutEffect, useRef } from "react"
import { CodeDisplay } from "@leetype/components/typing-game/code-display"
import type { TextGradient } from "@leetype/types/leetype"
import { cn } from "some-ui-utils"

/**
 * How close to an edge the caret gets before the viewport recentres it.
 *
 * Inherited unchanged from the version of this effect that lived inside
 * `CodeDisplay`. It belongs here because it is a fact about the *box*, not
 * about the glyphs: a renderer should have no opinion about how much room
 * its container likes to keep below the caret.
 */
const CARET_MARGIN_PX = 100

type TypingViewportProps = {
  displayCode: string
  language: string
  roles: Uint8Array
  slotOfDisplay: Int32Array
  slotStatus: Uint8Array
  visibility: Uint8Array
  cursorDisplay: number
  textGradient?: TextGradient
  className?: string
}

/**
 * The one thing in the card that scrolls.
 *
 * The split from `CodeDisplay` is what makes the sticky-prompt layout
 * expressible at all. `CodeDisplay` used to size itself (`h-[500px]`)
 * because it owned its own scroll; this component takes its height from the
 * layout (`min-h-0 flex-1`) and hands the renderer whatever is left.
 *
 * It owns three things the renderer no longer does: the scroll box, the
 * declared scroll intent, and caret-following. It reaches the caret through
 * a ref the display forwards, so the display never has to know why anyone
 * wants its caret node.
 */
export const TypingViewport: FC<TypingViewportProps> = ({
  displayCode,
  language,
  roles,
  slotOfDisplay,
  slotStatus,
  visibility,
  cursorDisplay,
  textGradient,
  className,
}) => {
  const containerRef = useRef<HTMLDivElement>(null)
  const caretRef = useRef<HTMLSpanElement>(null)

  useLayoutEffect(() => {
    const container = containerRef.current
    const caret = caretRef.current
    if (!caret || !container) return

    const containerRect = container.getBoundingClientRect()
    const caretRect = caret.getBoundingClientRect()

    if (
      caretRect.bottom > containerRect.bottom - CARET_MARGIN_PX ||
      caretRect.top < containerRect.top + CARET_MARGIN_PX
    ) {
      caret.scrollIntoView({ behavior: "smooth", block: "center" })
    }
  }, [cursorDisplay])

  return (
    <div
      ref={containerRef}
      // scroll-intent: code-display — the source the player reads and types
      // through is as long as the step is, and the caret is auto-scrolled to
      // follow them. The scroll *is* the interaction here, not a fallback for
      // a box that was handed too much; declared so the ui-fit sweep can tell
      // the two apart (docs/ui-fit).
      data-scroll-intent="code-display"
      className={cn(
        // scroll-intent: code-display — as above; the lint rule reads the
        // comment attached to this class string, not the JSX attribute.
        "min-h-0 flex-1 overflow-auto rounded-lg border border-border bg-secondary p-4",
        className
      )}
    >
      <CodeDisplay
        displayCode={displayCode}
        language={language}
        roles={roles}
        slotOfDisplay={slotOfDisplay}
        slotStatus={slotStatus}
        visibility={visibility}
        cursorDisplay={cursorDisplay}
        caretRef={caretRef}
        textGradient={textGradient}
      />
    </div>
  )
}
