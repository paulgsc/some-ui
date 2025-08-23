import { useEffect, useRef, useState } from "react"

export function useElementSize<T extends HTMLElement>() {
  const ref = useRef<T | null>(null)
  const [size, setSize] = useState({ width: 0, height: 0 })

  useEffect(() => {
    const el = ref.current
    if (!el) return

    const update = () => {
      setSize({
        width: el.clientWidth || el.offsetWidth || 0,
        height: el.clientHeight || el.offsetHeight || 0,
      })
    }

    update()

    let ro: ResizeObserver | null = null
    if (typeof ResizeObserver !== "undefined") {
      ro = new ResizeObserver(update)
      ro.observe(el)
    } else {
      // Fallback
      window.addEventListener("resize", update)
    }

    return () => {
      if (ro) ro.disconnect()
      else window.removeEventListener("resize", update)
    }
  }, [])

  return { ref, size }
}
