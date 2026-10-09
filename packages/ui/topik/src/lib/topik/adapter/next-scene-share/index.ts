/**
 * The next scene's prompt, out through the phone's share sheet
 * (docs/makjang/README.md, "Sharing the next scene"): the port the host
 * injects, and the runtime that holds one share's state so the button only
 * reads it (docs/monorepo-boundaries.md, "the component is not the
 * coordinator").
 *
 * The port is the host's: Android's share sheet is a native plugin, which
 * topik does not import. It runs through `callForeign`, so it never
 * rejects, and `unavailable` withdraws the button.
 */

import type { ForeignOutcome } from "@some-ui/intent-kit"

/** Hands one text file to the share sheet. Backing out is `cancelled`. */
export type FileShare = (file: {
  name: string
  text: string
}) => Promise<ForeignOutcome<"shared" | "cancelled">>

export type ShareState =
  | { kind: "idle" }
  | { kind: "sharing" }
  | { kind: "shared" }
  | { kind: "failed"; summary: string }
  /** No share sheet in this build: the button goes. */
  | { kind: "withdrawn" }

export class ShareRuntime {
  private state: ShareState = { kind: "idle" }
  private readonly listeners = new Set<() => void>()
  /** The share whose outcome still counts; a later one, or `dispose`, moves it. */
  private latest = 0

  constructor(private readonly share: FileShare) {}

  getSnapshot = (): ShareState => this.state

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  /** Shares `file`; `onShared` runs once the person sent it somewhere. */
  start = (
    file: { name: string; text: string },
    onShared?: () => void
  ): void => {
    if (this.state.kind === "sharing" || this.state.kind === "withdrawn") return
    this.latest += 1
    const call = this.latest
    this.set({ kind: "sharing" })
    void this.share(file).then((outcome) => {
      if (call !== this.latest) return
      if (outcome.status === "succeeded") {
        if (outcome.value === "shared") onShared?.()
        this.set({ kind: outcome.value === "shared" ? "shared" : "idle" })
      } else if (outcome.status === "failed") {
        this.set(
          outcome.error.kind === "unavailable"
            ? { kind: "withdrawn" }
            : { kind: "failed", summary: outcome.error.summary }
        )
      } else {
        this.set({ kind: "idle" })
      }
    })
  }

  /** A result arriving after this changes nothing. */
  dispose = (): void => {
    this.latest += 1
    if (this.state.kind === "sharing") this.state = { kind: "idle" }
  }

  private set(state: ShareState): void {
    this.state = state
    for (const listener of this.listeners) listener()
  }
}
