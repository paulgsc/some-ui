import type { ComponentType } from "react"
import { withQueryClient } from "@/test-support/query-client"
import { act, fireEvent, render, screen } from "@testing-library/react"

/** Clicks inside act's async form, which flushes the microtask-queued
 * mutation state update (see test-support/file-host-sabotage.ts). */
export async function click(element: HTMLElement): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/require-await -- act's async form is what flushes the update; nothing local to await
  await act(async () => {
    fireEvent.click(element)
  })
}

/** Renders a new-session composer for honeycomb and walks the wizard to its
 * review step. `Composer` is passed in so it is imported after the caller's
 * `vi.mock`s. */
export async function renderAtReviewStep(
  Composer: ComponentType<{ initialActivity: "honeycomb" }>
): Promise<void> {
  render(withQueryClient(<Composer initialActivity="honeycomb" />))
  for (let i = 0; i < 3; i += 1) {
    await click(screen.getByRole("button", { name: /continue/i }))
  }
}
