// The MIT License (MIT)

// Copyright (c) 2020 Julien CARON

// Permission is hereby granted, free of charge, to any person obtaining a copy
// of this software and associated documentation files (the "Software"), to deal
// in the Software without restriction, including without limitation the rights
// to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
// copies of the Software, and to permit persons to whom the Software is
// furnished to do so, subject to the following conditions:

// The above copyright notice and this permission notice shall be included in all
// copies or substantial portions of the Software.

// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
// IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
// FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
// AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
// LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
// OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
// SOFTWARE.

import { useEffect, useRef, useState, type RefObject } from "react"

import { useIsMounted } from "../use-is-mounted"

type Size = {
  width: number | undefined
  height: number | undefined
}

type UseResizeObserverOptions<T extends Element = Element> = {
  /** The ref of the element to observe. Nullable to match `useRef<T>(null)`. */
  ref: RefObject<T | null>
  /** With `onResize`, the hook does not re-render on resize; the callback gets the size. */
  onResize?: (size: Size) => void
  /** @default 'content-box' */
  box?: "border-box" | "content-box" | "device-pixel-content-box"
}

const initialSize: Size = {
  width: undefined,
  height: undefined,
}

/**
 * Observes an element's size with `ResizeObserver`.
 * @see https://usehooks-ts.com/react-hook/use-resize-observer
 */
export function useResizeObserver<T extends Element = Element>(
  options: UseResizeObserverOptions<T>
): Size {
  const { ref, box = "content-box" } = options
  const [{ width, height }, setSize] = useState<Size>(initialSize)
  const isMounted = useIsMounted()
  const previousSize = useRef<Size>({ ...initialSize })
  const onResize = useRef<((size: Size) => void) | undefined>(undefined)
  // Latest `onResize` for the observer without making it a dependency;
  // written in an effect, not during render, per react-hooks/refs.

  useEffect(() => {
    onResize.current = options.onResize
  })

  useEffect(() => {
    if (typeof window === "undefined" || !("ResizeObserver" in window)) return

    const observer = new ResizeObserver(([entry]) => {
      const boxProp =
        box === "border-box"
          ? "borderBoxSize"
          : box === "device-pixel-content-box"
            ? "devicePixelContentBoxSize"
            : "contentBoxSize"

      const newWidth = extractSize(entry, boxProp, "inlineSize")
      const newHeight = extractSize(entry, boxProp, "blockSize")

      const hasChanged =
        previousSize.current.width !== newWidth ||
        previousSize.current.height !== newHeight

      if (hasChanged && isMounted()) {
        const newSize: Size = { width: newWidth, height: newHeight }
        previousSize.current.width = newWidth
        previousSize.current.height = newHeight

        if (onResize.current) {
          onResize.current(newSize)
        } else {
          setSize(newSize)
        }
      }
    })

    if (ref.current !== null) observer.observe(ref.current, { box })

    return (): void => {
      observer.disconnect()
    }
  }, [box, ref, isMounted])

  return { width, height }
}

/** @private */
type BoxSizesKey = keyof Pick<
  ResizeObserverEntry,
  "borderBoxSize" | "contentBoxSize" | "devicePixelContentBoxSize"
>

function extractSize(
  entry: ResizeObserverEntry | undefined,
  box: BoxSizesKey,
  sizeType: keyof ResizeObserverSize
): number | undefined {
  if (!entry) return undefined

  const [size] = entry[box]
  if (!size) {
    if (box === "contentBoxSize") {
      return entry.contentRect[sizeType === "inlineSize" ? "width" : "height"]
    }
    return undefined
  }

  return size[sizeType]
}
