/**
 * @vitest-environment jsdom
 *
 * The one-time contract, which is the whole difference between a helpful
 * first-use notice and a banner a returning person has to dismiss forever.
 */

import { withQueryClient } from "@/test-support/query-client"
import { getActivity } from "@some-ui/activity-catalog"
import { act, cleanup, render, screen, waitFor } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import { markSignedIn } from "@/lib/auth"
import {
  AudioActivityHint,
  AudioActivityNotice,
} from "@/components/audio/audio-activity-notice"

const renderNotice = (
  id: Parameters<typeof getActivity>[0]
): ReturnType<typeof render> =>
  render(withQueryClient(<AudioActivityNotice activity={getActivity(id)} />))

beforeEach(() => {
  window.localStorage.clear()
  // The audio preferences come from the tenant settings query, disabled
  // without a session (`lib/tenant/hooks.ts`).
  markSignedIn()
})

afterEach(() => {
  // No vitest `globals`, so Testing Library registers no auto-cleanup.
  cleanup()
  window.localStorage.clear()
})

describe("AudioActivityNotice", () => {
  it("discloses what the activity does to a person's ears", async () => {
    renderNotice("topik")

    await waitFor(() =>
      expect(screen.getByText(/uses korean pronunciation/i)).toBeDefined()
    )
    // And points at the place the full picture lives, so the notice can be
    // dismissed without losing the ability to change one's mind.
    expect(screen.getByText(/speaker icon in the header/i)).toBeDefined()
  })

  it("never shows again once acknowledged", async () => {
    const view = renderNotice("topik")
    await waitFor(() => expect(screen.getByRole("alert")).toBeDefined())

    await act(async () => {
      screen.getByRole("button", { name: /got it|enable audio/i }).click()
      await Promise.resolve()
    })

    await waitFor(() => expect(screen.queryByRole("alert")).toBeNull())

    // A fresh mount is the case that matters - "dismissed" has to outlive
    // the component, not just hide it.
    view.unmount()
    renderNotice("topik")
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

    renderNotice("honeycomb")

    // Different activities have different audio semantics - pronunciation
    // versus game sounds - so acknowledging one says nothing about another.
    await waitFor(() =>
      expect(screen.getByText(/uses game sound effects/i)).toBeDefined()
    )
  })

  it("renders nothing for an activity with no audio at all", () => {
    renderNotice("leetype")

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
