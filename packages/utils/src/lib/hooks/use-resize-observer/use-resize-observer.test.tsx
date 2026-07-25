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
 * jsdom does not implement ResizeObserver at all - this fake gives full,
 * synchronous control over when/what a "resize" delivers, including firing
 * a callback whose observer has already been disconnect()-ed, to model a
 * real browser's already-queued notification arriving right as an
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
  /** `force` bypasses the disconnected guard - see the class doc comment. */
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
  // Property: across any sequence of mount -> (fire zero or more resize
  // events) -> unmount -> mount -> ..., each mount's own hook instance must
  // report exactly that mount's own last-fired size once its own resize
  // events are done - never a size left over from an earlier, already
  // unmounted instance. 200 randomized sequences, sizes spanning 0 (a
  // legitimate transient viewport during layout) through 4000px.
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
  // Regression coverage: a resize notification already queued by the
  // browser right as a component unmounts must not act on either reporting
  // path. The state-based path (no onResize prop) was already guarded by
  // isMounted(); the onResize-callback path was not - fixed by moving the
  // isMounted() check to guard both uniformly.
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
