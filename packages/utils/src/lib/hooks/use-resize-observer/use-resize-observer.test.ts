import { act, renderHook } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { useResizeObserver } from "./use-resize-observer"

describe("useResizeObserver", () => {
  let mockResizeObserver: {
    observe: vi.Mock
    disconnect: vi.Mock
  }

  beforeEach(() => {
    mockResizeObserver = {
      observe: vi.fn(),
      disconnect: vi.fn(),
    }
    global.ResizeObserver = vi.fn().mockImplementation(() => mockResizeObserver)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it("should initialize with undefined width and height", () => {
    const { result } = renderHook(() =>
      useResizeObserver({ ref: { current: document.createElement("div") } })
    )
    expect(result.current).toEqual({ width: undefined, height: undefined })
  })

  it("should observe the provided ref", () => {
    const ref = { current: document.createElement("div") }
    renderHook(() => useResizeObserver({ ref }))
    expect(mockResizeObserver.observe).toHaveBeenCalledWith(ref.current, {
      box: "content-box",
    })
  })

  it("should update size when ResizeObserver calls the callback", () => {
    const ref = { current: document.createElement("div") }
    const { result } = renderHook(() => useResizeObserver({ ref }))

    act(() => {
      const [[callback]] = (global.ResizeObserver as unknown as vi.Mock).mock
        .calls
      callback([
        {
          contentBoxSize: [{ inlineSize: 100, blockSize: 50 }],
          contentRect: { width: 100, height: 50 },
        },
      ])
    })

    expect(result.current).toEqual({ width: 100, height: 50 })
  })

  it("should handle 'border-box' model", () => {
    const ref = { current: document.createElement("div") }
    const { result } = renderHook(() =>
      useResizeObserver({ ref, box: "border-box" })
    )

    act(() => {
      const [[callback]] = (global.ResizeObserver as unknown as vi.Mock).mock
        .calls
      callback([
        {
          borderBoxSize: [{ inlineSize: 110, blockSize: 60 }],
          contentRect: { width: 100, height: 50 },
        },
      ])
    })

    expect(result.current).toEqual({ width: 110, height: 60 })
  })

  it("should handle 'content-box' model", () => {
    const ref = { current: document.createElement("div") }
    const { result } = renderHook(() =>
      useResizeObserver({ ref, box: "content-box" })
    )

    act(() => {
      const [[callback]] = (global.ResizeObserver as unknown as vi.Mock).mock
        .calls
      callback([
        {
          contentBoxSize: [{ inlineSize: 100, blockSize: 50 }],
          contentRect: { width: 100, height: 50 },
        },
      ])
    })

    expect(result.current).toEqual({ width: 100, height: 50 })
  })

  it("should handle 'device-pixel-content-box' model", () => {
    const ref = { current: document.createElement("div") }
    const { result } = renderHook(() =>
      useResizeObserver({ ref, box: "device-pixel-content-box" })
    )

    act(() => {
      const [[callback]] = (global.ResizeObserver as unknown as vi.Mock).mock
        .calls
      callback([
        {
          devicePixelContentBoxSize: [{ inlineSize: 200, blockSize: 100 }],
          contentRect: { width: 100, height: 50 },
        },
      ])
    })

    expect(result.current).toEqual({ width: 200, height: 100 })
  })

  it("should call onResize callback if provided", () => {
    const ref = { current: document.createElement("div") }
    const onResize = vi.fn()
    renderHook(() => useResizeObserver({ ref, onResize }))

    act(() => {
      const [[callback]] = (global.ResizeObserver as unknown as vi.Mock).mock
        .calls
      callback([
        {
          contentBoxSize: [{ inlineSize: 100, blockSize: 50 }],
          contentRect: { width: 100, height: 50 },
        },
      ])
    })

    expect(onResize).toHaveBeenCalledWith({ width: 100, height: 50 })
  })

  it("should not update state if onResize is provided", () => {
    const ref = { current: document.createElement("div") }
    const onResize = vi.fn()
    const { result } = renderHook(() => useResizeObserver({ ref, onResize }))

    act(() => {
      const [[callback]] = (global.ResizeObserver as unknown as vi.Mock).mock
        .calls
      callback([
        {
          contentBoxSize: [{ inlineSize: 100, blockSize: 50 }],
          contentRect: { width: 100, height: 50 },
        },
      ])
    })

    expect(result.current).toEqual({ width: undefined, height: undefined })
  })

  it("should handle non-array box sizes", () => {
    const ref = { current: document.createElement("div") }
    const { result } = renderHook(() => useResizeObserver({ ref }))

    act(() => {
      const [[callback]] = (global.ResizeObserver as unknown as vi.Mock).mock
        .calls
      callback([
        {
          contentBoxSize: { inlineSize: 100, blockSize: 50 },
          contentRect: { width: 100, height: 50 },
        },
      ])
    })

    expect(result.current).toEqual({ width: 100, height: 50 })
  })

  it("should handle missing box sizes", () => {
    const ref = { current: document.createElement("div") }
    const { result } = renderHook(() => useResizeObserver({ ref }))

    act(() => {
      const [[callback]] = (global.ResizeObserver as unknown as vi.Mock).mock
        .calls
      callback([
        {
          contentBoxSize: [],
          contentRect: { width: 100, height: 50 },
        },
      ])
    })

    expect(result.current).toEqual({ width: 100, height: 50 })
  })

  it("should disconnect observer on unmount", () => {
    const ref = { current: document.createElement("div") }
    const { unmount } = renderHook(() => useResizeObserver({ ref }))

    unmount()

    expect(mockResizeObserver.disconnect).toHaveBeenCalled()
  })

  it("should not observe if ref is null", () => {
    const ref = { current: null }
    renderHook(() => useResizeObserver({ ref }))

    expect(mockResizeObserver.observe).not.toHaveBeenCalled()
  })

  it("should handle ResizeObserver not being available", () => {
    const originalResizeObserver = global.ResizeObserver
    // @ts-expect-error ignore ts error
    delete global.ResizeObserver

    const ref = { current: document.createElement("div") }
    const { result } = renderHook(() => useResizeObserver({ ref }))

    expect(result.current).toEqual({ width: undefined, height: undefined })

    global.ResizeObserver = originalResizeObserver
  })

  it("should not update size if component is unmounted", () => {
    const ref = { current: document.createElement("div") }
    const { result, unmount } = renderHook(() => useResizeObserver({ ref }))

    unmount()

    act(() => {
      const [[callback]] = (global.ResizeObserver as unknown as vi.Mock).mock
        .calls
      callback([
        {
          contentBoxSize: [{ inlineSize: 100, blockSize: 50 }],
          contentRect: { width: 100, height: 50 },
        },
      ])
    })

    expect(result.current).toEqual({ width: undefined, height: undefined })
  })
})
