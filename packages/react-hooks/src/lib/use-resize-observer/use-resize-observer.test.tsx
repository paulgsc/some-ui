// @vitest-environment jsdom
import { useRef } from "react"
import { act, cleanup, render } from "@testing-library/react"
import fc from "fast-check"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { useResizeObserver } from "./use-resize-observer"

type Entry = {
  contentRect: { width: number; height: number }
  contentBoxSize: Array<{ inlineSize: number; blockSize: number }>
}
type Callback = (entries: Array<Entry>) => void

/** jsdom has no ResizeObserver. */
class FakeResizeObserver {
  static instances: Array<FakeResizeObserver> = []
  private disconnected = false

  constructor(private readonly cb: Callback) {
    FakeResizeObserver.instances.push(this)
  }
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {
    this.disconnected = true
  }

  fire(width: number, height: number): void {
    if (this.disconnected) return
    this.cb([
      {
        contentRect: { width, height },
        contentBoxSize: [{ inlineSize: width, blockSize: height }],
      },
    ])
  }
}

beforeEach(() => {
  FakeResizeObserver.instances = []
  vi.stubGlobal("ResizeObserver", FakeResizeObserver)
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

const Probe = ({
  onSize,
}: {
  onSize: (s: { width?: number; height?: number }) => void
}): React.JSX.Element => {
  const ref = useRef<HTMLDivElement>(null)
  const size = useResizeObserver({ ref })
  onSize(size)
  return <div ref={ref} />
}

const ProbeWithCallback = ({
  onResize,
}: {
  onResize: (s: { width?: number; height?: number }) => void
}): React.JSX.Element => {
  const ref = useRef<HTMLDivElement>(null)
  useResizeObserver({ ref, onResize })
  return <div ref={ref} />
}

describe("useResizeObserver: remount correctness (fast-check)", () => {
  // Each mount reports its own last-fired size, never an earlier mount's.
  const mountArb = fc.array(
    fc.record({
      width: fc.integer({ min: 0, max: 4000 }),
      height: fc.integer({ min: 0, max: 4000 }),
    }),
    { minLength: 1, maxLength: 4 }
  )
  const sequenceArb = fc.array(mountArb, { minLength: 2, maxLength: 6 })

  it("reports each mount's own last size, never a previous mount's", () => {
    fc.assert(
      fc.property(sequenceArb, (mounts) => {
        let lastSize: { width?: number; height?: number } = {}

        for (const sizes of mounts) {
          const before = FakeResizeObserver.instances.length
          const { unmount, rerender } = render(
            <Probe onSize={(s) => (lastSize = s)} />
          )

          expect(FakeResizeObserver.instances.length).toBe(before + 1)
          const observer = FakeResizeObserver.instances[before]!

          for (const size of sizes) {
            act(() => observer.fire(size.width, size.height))
            rerender(<Probe onSize={(s) => (lastSize = s)} />)
          }

          const expected = sizes[sizes.length - 1]!
          expect(lastSize).toEqual(expected)

          unmount()
        }
      }),
      { numRuns: 200 }
    )
  })
})

describe("useResizeObserver: onResize", () => {
  it("reports each new size through onResize", () => {
    const onResize = vi.fn()
    render(<ProbeWithCallback onResize={onResize} />)
    const observer = FakeResizeObserver.instances[0]!

    act(() => observer.fire(120, 40))
    act(() => observer.fire(120, 40))

    expect(onResize).toHaveBeenCalledTimes(1)
    expect(onResize).toHaveBeenCalledWith({ width: 120, height: 40 })
  })
})
