// @vitest-environment jsdom
import { StrictMode } from "react"
import { act, cleanup, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"

import type { ActivityHost } from "./host-hold"
import { followHost } from "./host-hold"
import { useHostHold } from "./use-host-hold"

afterEach(cleanup)

/** A host whose hold a test moves by hand. */
function fakeHost(
  initial = false
): ActivityHost & { set: (held: boolean) => void } {
  let held = initial
  const listeners = new Set<() => void>()
  const places = new Map<string, unknown>()
  return {
    held: () => held,
    subscribe: (listener) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    recall: (key) => places.get(key),
    keep: (key, place) => places.set(key, place),
    set: (next): void => {
      held = next
      listeners.forEach((listener) => listener())
    },
  }
}

function recorder(): {
  calls: Array<"hold" | "release">
  hold: () => void
  release: () => void
} {
  const calls: Array<"hold" | "release"> = []
  return {
    calls,
    hold: () => calls.push("hold"),
    release: () => calls.push("release"),
  }
}

describe("followHost", () => {
  it("tells the target the state at once, then only each change", () => {
    const host = fakeHost(true)
    const target = recorder()
    const stop = followHost(host, target)
    host.set(true)
    host.set(false)
    host.set(false)
    host.set(true)
    stop()
    host.set(false)
    expect(target.calls).toEqual(["hold", "release", "hold"])
  })

  it("catches a target connected again up on what it missed", () => {
    const host = fakeHost(false)
    const target = recorder()
    followHost(host, target)()
    host.set(true)
    host.set(false)
    followHost(host, target)()
    expect(target.calls).toEqual(["release", "release"])
  })
})

describe("useHostHold", () => {
  const Probe = ({
    host,
    target,
  }: {
    host: ActivityHost | undefined
    target: ReturnType<typeof recorder>
  }): React.JSX.Element => (
    <p>{useHostHold(host, target) ? "held" : "playing"}</p>
  )

  it("renders the host's hold and forwards it to the runtime", () => {
    const host = fakeHost()
    const target = recorder()
    render(
      <StrictMode>
        <Probe host={host} target={target} />
      </StrictMode>
    )
    expect(screen.getByText("playing")).toBeTruthy()
    act(() => host.set(true))
    expect(screen.getByText("held")).toBeTruthy()
    act(() => host.set(false))
    expect(screen.getByText("playing")).toBeTruthy()
    // StrictMode connects twice; each connection starts from the state.
    expect(target.calls).toEqual(["release", "release", "hold", "release"])
  })

  it("plays on its own with no host", () => {
    const target = recorder()
    render(<Probe host={undefined} target={target} />)
    expect(screen.getByText("playing")).toBeTruthy()
    expect(target.calls).toEqual(["release"])
  })
})
