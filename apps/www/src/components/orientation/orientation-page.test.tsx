/** @vitest-environment jsdom */
import {
  createMemoryHistory,
  createRootRoute,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router"
import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, expect, it, vi } from "vitest"

import { OrientationPage } from "./orientation-page"

vi.mock("@/components/theme-switcher", (): { ThemeSwitcher: () => null } => ({
  ThemeSwitcher: () => null,
}))

afterEach(cleanup)

it("introduces the work with one heading and the four ways in", async () => {
  const router = createRouter({
    routeTree: createRootRoute({ component: OrientationPage }),
    history: createMemoryHistory({ initialEntries: ["/"] }),
  })
  await router.load()
  render(<RouterProvider router={router} />)
  expect(screen.getByTestId("orientation-page")).toBeTruthy()
  expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1)
  const hrefs = screen
    .getAllByRole("link")
    .map((link) => link.getAttribute("href"))
  for (const end of ["/resume", "/auth", "/extensions", "/mission"]) {
    expect(hrefs.some((href) => href?.endsWith(end))).toBe(true)
  }
})
