import type { JSX } from "react"
import { useEffect, useRef } from "react"

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

  const frameStyle = frame
    ? {
        width: "180px",
        height: "180px",
        background: "#0a1a0a",
        border: "1px solid #00ff41",
        borderRadius: "4px",
        overflow: "hidden",
        "--face-text": "#4a7c4a",
        "--face-text-active": "#00ff41",
        "--face-text-secondary": "#2a4a2a",
        "--face-font": "'Courier New', monospace",
      }
    : undefined

  return <div ref={containerRef} style={frameStyle} />
}
