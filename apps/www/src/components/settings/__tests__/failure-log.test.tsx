/**
 * @vitest-environment jsdom
 *
 * "What went wrong lately": the kept log, newest first, with a copy of all
 * of it, or a line saying nothing has gone wrong.
 */
import type { ForeignFailure } from "@some-ui/intent-kit"
import { act, cleanup, render, screen, within } from "@testing-library/react"
import { afterEach, expect, it } from "vitest"

import { keepFailure } from "@/lib/failure-log"
import { BOARD_WORDS } from "@/lib/status-board/words"
import { FailureLog } from "@/components/settings/failure-log"

const failure = (summary: string): ForeignFailure => ({
  port: "intent",
  error: { kind: "rejected", retryable: false, summary, cause: null },
})

afterEach(() => {
  cleanup()
  localStorage.clear()
})

it("says nothing has gone wrong, with nothing to copy", () => {
  render(<FailureLog />)
  expect(screen.getByText(BOARD_WORDS.failuresNone)).toBeTruthy()
  expect(screen.queryByRole("button")).toBeNull()
})

it("lists what went wrong newest first, and shows one kept while it is open", () => {
  keepFailure(failure("older"), new Date("2026-10-30T16:29:00Z"))
  render(<FailureLog />)
  act(() => {
    keepFailure(failure("newer"), new Date("2026-10-30T16:30:00Z"))
  })

  const lines = within(screen.getByRole("list"))
    .getAllByRole("listitem")
    .map((item) => item.textContent)
  expect(lines).toHaveLength(2)
  expect(lines[0]).toContain("rejected: newer")
  expect(lines[1]).toContain("rejected: older")
  expect(
    screen.getByRole("button", { name: "Copy" }).getAttribute("title")
  ).toBe(`Copy ${BOARD_WORDS.failuresWhat}`)
})
