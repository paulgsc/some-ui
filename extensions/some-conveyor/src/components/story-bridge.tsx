import type { JSX } from "react"
// react here is a Storybook/dev-time-only concern — this bridge mounts vanilla
// views inside React purely for stories; the conveyor ships zero React at
// runtime, so react is intentionally not a dependency of this extension.
// eslint-disable-next-line import/no-extraneous-dependencies
import { useEffect, useRef } from "react"
import { CONVEYOR_TOKENS, SteelTheme } from "@conveyor/lib/content/theme-engine"

type VanillaBridgeProps<P> = {
  factory: (props: P) => HTMLElement
  props: P
  frame?: boolean
}

/**
 * VanillaBridge — mounts a vanilla `(props) => HTMLElement` view inside React so
 * Storybook (React/Vite here) can render it. The conveyor ships zero React at
 * runtime; this exists ONLY for stories. Re-renders wholesale on props change.
 */
export const VanillaBridge = <P,>({
  factory,
  props,
  frame = true,
}: VanillaBridgeProps<P>): JSX.Element => {
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const container = containerRef.current

    if (!container) {
      return
    }

    container.innerHTML = ""

    const el = factory(props)
    container.appendChild(el)

    return (): void => {
      el.remove()
    }
  }, [factory, props])

  // Render face views on the steel surface: the canonical --cv-* palette/fonts
  // (the shadow :host equivalent) plus the SteelTheme face/strip contract vars.
  const frameStyle = frame
    ? {
        width: "180px",
        height: "180px",
        background: "var(--cv-steel-650)",
        border: "1px solid var(--cv-steel-550)",
        borderRadius: "4px",
        overflow: "hidden",
        ...CONVEYOR_TOKENS,
        ...SteelTheme.cssVariables,
      }
    : undefined

  return <div ref={containerRef} style={frameStyle} />
}
