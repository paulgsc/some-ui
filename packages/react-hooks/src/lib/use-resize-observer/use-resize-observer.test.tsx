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

/**
 * jsdom has no ResizeObserver. `fire(..., true)` can deliver to a
 * disconnected observer, modelling a notification already queued as an
 * unmount's cleanup runs.
 */
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

  fire(width: number, height: number, force = false): void {
    if (this.disconnected && !force) return
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

describe("useResizeObserver: post-unmount callback guard", () => {
  // A notification queued as the component unmounts must not reach either
  // reporting path (state or `onResize`).

  it("does not call setSize (observable via onSize never firing again) after unmount", () => {
    let lastSize: { width?: number; height?: number } = {}
    const onSize = vi.fn((s: { width?: number; height?: number }) => {
      lastSize = s
    })
    const { unmount } = render(<Probe onSize={onSize} />)
    const observer = FakeResizeObserver.instances[0]!

    unmount()
    onSize.mockClear()
    const sizeAtUnmount = lastSize

    act(() => observer.fire(999, 999, true))

    expect(onSize).not.toHaveBeenCalled()
    expect(lastSize).toEqual(sizeAtUnmount)
  })

  it("does not call onResize after unmount", () => {
    const onResize = vi.fn()
    const { unmount } = render(<ProbeWithCallback onResize={onResize} />)
    const observer = FakeResizeObserver.instances[0]!

    unmount()
    onResize.mockClear()

    act(() => observer.fire(999, 999, true))

    expect(onResize).not.toHaveBeenCalled()
  })
})
