/**
 * @vitest-environment jsdom
 *
 * QO1: the scene library is fetched once per page, however many pickers
 * mount, unmount and mount again while it is on its way.
 */

import { queryClientWrapper } from "@/test-support/query-client"
import { cleanup, renderHook, waitFor } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

import { useSceneLibrary } from "@/components/composer/scene-editor/use-scene-library"

const SCENE = [{ type: "text", content: "안녕" }]

/** A `fetch` that answers only when the test says. */
function pendingFetch(): {
  readonly urls: Array<string>
  readonly answerAll: () => void
} {
  const urls: Array<string> = []
  const waiting: Array<() => void> = []
  vi.stubGlobal("fetch", (input: string) => {
    urls.push(input)
    const body =
      input === "/scenes/manifest.json"
        ? ["/scenes/a.json", "/scenes/b.json"]
        : SCENE
    return new Promise<Response>((resolve) => {
      waiting.push(() => resolve(Response.json(body)))
    })
  })
  return {
    urls,
    answerAll: (): void => {
      for (const answer of waiting.splice(0)) answer()
    },
  }
}

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe("QO1: the scene library is loaded once per page", () => {
  it("every picker joins one load: mounted together, gone and back while it is on its way, or after", async () => {
    const network = pendingFetch()
    const wrapper = queryClientWrapper()

    const first = renderHook(() => useSceneLibrary(), { wrapper })
    const second = renderHook(() => useSceneLibrary(), { wrapper })
    first.unmount()
    const third = renderHook(() => useSceneLibrary(), { wrapper })
    expect(third.result.current.loading).toBe(true)

    // The manifest, then each scene file, each answered while every picker
    // still waits.
    await waitFor(() => {
      expect(network.urls).toEqual(["/scenes/manifest.json"])
    })
    network.answerAll()
    await waitFor(() => {
      expect(network.urls).toHaveLength(3)
    })
    network.answerAll()

    await waitFor(() => {
      expect(third.result.current.loading).toBe(false)
    })
    expect(
      second.result.current.getLibraryItems().map(({ key }) => key)
    ).toEqual(["a", "b"])
    const later = renderHook(() => useSceneLibrary(), { wrapper })
    expect(later.result.current.getLibraryItems()).toHaveLength(2)
    expect([...network.urls].sort()).toEqual([
      "/scenes/a.json",
      "/scenes/b.json",
      "/scenes/manifest.json",
    ])
  })

  it("a load that failed is asked for again by the next picker, and a whole one is not", async () => {
    let manifestDown = true
    const urls: Array<string> = []
    vi.stubGlobal("fetch", (input: string) => {
      urls.push(input)
      if (input === "/scenes/manifest.json" && manifestDown)
        return Promise.resolve(new Response("down", { status: 503 }))
      const body =
        input === "/scenes/manifest.json" ? ["/scenes/a.json"] : SCENE
      return Promise.resolve(Response.json(body))
    })
    const wrapper = queryClientWrapper()

    const first = renderHook(() => useSceneLibrary(), { wrapper })
    await waitFor(() => {
      expect(first.result.current.loading).toBe(false)
    })
    expect(first.result.current.getLibraryItems()).toEqual([])
    first.unmount()

    manifestDown = false
    const second = renderHook(() => useSceneLibrary(), { wrapper })
    await waitFor(() => {
      expect(second.result.current.getLibraryItems()).toHaveLength(1)
    })
    second.unmount()

    const fetched = urls.length
    const third = renderHook(() => useSceneLibrary(), { wrapper })
    expect(third.result.current.getLibraryItems()).toHaveLength(1)
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(urls).toHaveLength(fetched)
  })
})
