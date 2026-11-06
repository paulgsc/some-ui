/**
 * @vitest-environment jsdom
 *
 * The shell's page body on the phone (PULL0, #2457): a page route can be
 * dragged down to check again, a bounded one cannot (D2), and the web builds
 * never can (D4). vitest runs the lan profile, so `MOBILE_APP` is mocked to
 * the Android app's here and the device build's flag stubbed, as that build
 * sets it; nothing else renders this branch before the APK is built.
 */
import type { JSX } from "react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import {
  createMemoryHistory,
  createRootRoute,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { ARM_PX, PULL_WORDS } from "@/lib/pull-refresh"
import { PageBody } from "@/components/page-body"

const profile = vi.hoisted(() => ({ mobile: true }))

vi.mock("@/lib/build-profile", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  get MOBILE_APP(): boolean {
    return profile.mobile
  },
}))

let client: QueryClient

beforeEach(() => {
  profile.mobile = true
  vi.stubEnv("VITE_DEVICE_BACKEND", "true")
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
})

afterEach(() => {
  cleanup()
  vi.unstubAllEnvs()
  client.clear()
})

async function mount(bounded: boolean): Promise<HTMLElement> {
  const Shell = (): JSX.Element => (
    <PageBody bounded={bounded} bare={false}>
      <p>The page</p>
    </PageBody>
  )
  const router = createRouter({
    routeTree: createRootRoute({ component: Shell }),
    history: createMemoryHistory({ initialEntries: ["/"] }),
  })
  render(
    <QueryClientProvider client={client}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  )
  const page = await screen.findByText("The page")
  return page
}

/** The pull's indicator, where the body mounts it; null where it doesn't. */
const indicator = (): Element | null =>
  document.querySelector("[data-pull-indicator]")

const touch = (y: number): { touches: Array<Partial<Touch>> } => ({
  touches: [{ clientX: 100, clientY: y, identifier: 0 }],
})

describe("the phone's page body", () => {
  it("lets a page route be dragged down, listening on the page scroller", async () => {
    const page = await mount(false)
    expect(indicator()?.textContent).toBe("")

    // A drag on the route's own content reaches the pull: it listens on the
    // body that holds the route, not only on the indicator.
    fireEvent.touchStart(page, touch(50))
    fireEvent.touchMove(page, touch(70))
    fireEvent.touchMove(page, touch(50 + ARM_PX * 3))
    expect(indicator()?.textContent).toBe(PULL_WORDS.armed)
  })

  it("keeps a bounded route's drags for itself", async () => {
    const page = await mount(true)
    expect(indicator()).toBeNull()
    fireEvent.touchStart(page, touch(50))
    fireEvent.touchMove(page, touch(50 + ARM_PX * 3))
    expect(screen.queryByText(PULL_WORDS.armed)).toBeNull()
  })

  it("is not in the web builds, which have the browser's reload", async () => {
    profile.mobile = false
    await mount(false)
    expect(indicator()).toBeNull()
  })

  it("is not without the device build, which folds it away", async () => {
    vi.stubEnv("VITE_DEVICE_BACKEND", "")
    await mount(false)
    expect(indicator()).toBeNull()
  })
})
