/**
 * @vitest-environment jsdom
 *
 * The one-time contract, which is the whole difference between a helpful
 * first-use notice and a banner a returning person has to dismiss forever.
 */

import type { JSX, ReactNode } from "react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { act, cleanup, render, screen, waitFor } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import { getActivity } from "@some-ui/activity-catalog"

import { AudioActivityHint, AudioActivityNotice } from "./audio-activity-notice"

function withQueryClient(children: ReactNode): JSX.Element {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>
}

beforeEach(() => {
  window.localStorage.clear()
})

afterEach(() => {
  // Explicit: this app's vitest config doesn't enable `globals`, so Testing
  // Library never registers its own auto-cleanup and rendered trees would
  // otherwise pile up in `document.body` across tests in this file.
  cleanup()
  window.localStorage.clear()
})

describe("AudioActivityNotice", () => {
  it("discloses what the activity does to a person's ears", async () => {
    render(
      withQueryClient(<AudioActivityNotice activity={getActivity("topik")} />)
    )

    await waitFor(() =>
      expect(screen.getByText(/uses korean pronunciation/i)).toBeDefined()
    )
    // And points at the place the full picture lives, so the notice can be
    // dismissed without losing the ability to change one's mind.
    expect(screen.getByText(/speaker icon in the header/i)).toBeDefined()
  })

  it("never shows again once acknowledged", async () => {
    const view = render(
      withQueryClient(<AudioActivityNotice activity={getActivity("topik")} />)
    )
    await waitFor(() => expect(screen.getByRole("alert")).toBeDefined())

    await act(async () => {
      screen.getByRole("button", { name: /got it|enable audio/i }).click()
      await Promise.resolve()
    })

    await waitFor(() => expect(screen.queryByRole("alert")).toBeNull())

    // A fresh mount is the case that matters - "dismissed" has to outlive
    // the component, not just hide it.
    view.unmount()
    render(
      withQueryClient(<AudioActivityNotice activity={getActivity("topik")} />)
    )
    await act(async () => {
      await Promise.resolve()
    })
    expect(screen.queryByRole("alert")).toBeNull()
  })

  it("is acknowledged per activity, not once for the whole app", async () => {
    window.localStorage.setItem(
      "some-ui.audio.activity-notice.v1.topik",
      "true"
    )

    render(
      withQueryClient(
        <AudioActivityNotice activity={getActivity("honeycomb")} />
      )
    )

    // Different activities have different audio semantics - pronunciation
    // versus game sounds - so acknowledging one says nothing about another.
    await waitFor(() =>
      expect(screen.getByText(/uses game sound effects/i)).toBeDefined()
    )
  })

  it("renders nothing for an activity with no audio at all", () => {
    render(
      withQueryClient(<AudioActivityNotice activity={getActivity("leetype")} />)
    )

    expect(screen.queryByRole("alert")).toBeNull()
  })
})

describe("AudioActivityHint", () => {
  it("labels an activity card with what it will play", () => {
    render(<AudioActivityHint activity={getActivity("topik")} />)

    expect(screen.getByText("Uses Korean pronunciation")).toBeDefined()
  })

  it("stays out of the way for a silent activity", () => {
    const { container } = render(
      <AudioActivityHint activity={getActivity("leetype")} />
    )

    expect(container.textContent).toBe("")
  })
})
