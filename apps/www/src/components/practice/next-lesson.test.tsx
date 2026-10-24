/**
 * @vitest-environment jsdom
 *
 * "Next lesson": one press makes a Korean session at its defaults, starts
 * it, and opens the player asked to play the lesson at once.
 */

import { withQueryClient } from "@/test-support/query-client"
import type * as ReactRouterModule from "@tanstack/react-router"
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react"
import { afterEach, expect, it, vi } from "vitest"

import { STORAGE_KEY } from "@/lib/tenant/sessions-repository"

const navigateSpy = vi.fn()

vi.mock(
  "@tanstack/react-router",
  async (importOriginal): Promise<typeof ReactRouterModule> => {
    const actual = await importOriginal<typeof ReactRouterModule>()
    return { ...actual, useNavigate: () => navigateSpy }
  }
)

const { NextLesson } = await import("@/components/practice/next-lesson")

afterEach(() => {
  cleanup()
  navigateSpy.mockClear()
  localStorage.clear()
})

it("makes one Korean session, starts it, and opens it on the lesson", async () => {
  render(withQueryClient(<NextLesson />))
  fireEvent.click(screen.getByRole("button", { name: "Next lesson" }))

  await waitFor(() => expect(navigateSpy).toHaveBeenCalledTimes(1))
  const stored: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]")
  expect(stored).toMatchObject([
    { status: "active", activities: [{ activityId: "topik" }] },
  ])
  expect(navigateSpy).toHaveBeenCalledWith({
    to: "/sessions/$sessionId",
    params: { sessionId: expect.any(String) },
    search: { next: true },
  })
})
