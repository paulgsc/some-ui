/**
 * The controller follows the owner's settings in `storage.local` (#1807,
 * #1966).
 * The runtime is a stand-in that records what it was told.
 */

import { Controller } from "@censor/lib/content/controller"
import type { Runtime } from "@censor/lib/content/runtime/runtime"
import {
  LOADING_ATTRIBUTE,
  POSTS_ATTRIBUTE,
} from "@censor/lib/content/selectors"
import { MODE_RULES } from "@censor/lib/settings/modes"
import { MODES, SETTINGS_KEY } from "@censor/lib/settings/settings"
import { ext } from "@censor/platform/content"
import {
  fakeStorage,
  type FakeStorage,
  type FakeStorageOptions,
} from "@some-extension/common/testing"
import { afterEach, beforeEach, expect, it, vi } from "vitest"

type Listener = (
  changes: Record<string, { newValue?: unknown }>,
  area: string
) => void

/** A fake `storage` whose writes notify `onChanged`, as the browser's do. */
function install(
  options: FakeStorageOptions = {}
): FakeStorage & { change: (value: unknown) => void } {
  const listeners: Array<Listener> = []
  const fake = fakeStorage({
    ...options,
    onSet: (key) => {
      for (const l of listeners)
        l({ [key]: { newValue: fake.store.get(key) } }, "local")
    },
  })
  Reflect.set(ext, "storage", {
    local: fake.area,
    onChanged: { addListener: (l: Listener) => listeners.push(l) },
  })
  const change = (value: unknown): void => {
    void fake.area.set({ [SETTINGS_KEY]: value })
  }
  return { ...fake, change }
}

function recordingRuntime(): { runtime: Runtime; calls: Array<string> } {
  const calls: Array<string> = []
  let running = false
  const runtime: Runtime = {
    start: () => {
      running = true
      calls.push("start")
    },
    stop: () => {
      running = false
      calls.push("stop")
    },
    scan: () => {},
    setBoundary: (days) => calls.push(`boundary:${String(days)}`),
    setRules: (rules) =>
      calls.push(
        `rules:${MODES.find((m) => MODE_RULES[m].core === rules) ?? "?"}`
      ),
    get state(): never {
      throw new Error("not read here")
    },
    get running() {
      return running
    },
  }
  return { runtime, calls }
}

beforeEach(() => {
  document.body.innerHTML = "<ytd-app></ytd-app>"
  document.documentElement.removeAttribute("data-boyo-off")
})

afterEach(() => {
  Reflect.deleteProperty(ext, "storage")
})

it("applies the stored boundary before the first start", async () => {
  const { store } = install()
  store.set(SETTINGS_KEY, { v: 1, boundary: "2y", enabled: true })
  const { runtime, calls } = recordingRuntime()
  new Controller(runtime).init()
  await vi.waitFor(() =>
    expect(calls).toEqual(["boundary:730", "rules:standard", "start"])
  )
})

it("starts on the defaults when the read fails", async () => {
  install({ fail: (k) => k === SETTINGS_KEY })
  const { runtime, calls } = recordingRuntime()
  new Controller(runtime).init()
  await vi.waitFor(() =>
    expect(calls).toEqual(["boundary:365", "rules:standard", "start"])
  )
})

it("drops a first read that a change overtook", async () => {
  const { store, held, change } = install({ hold: (k) => k === SETTINGS_KEY })
  store.set(SETTINGS_KEY, { v: 1, boundary: "2y", enabled: true })
  const { runtime, calls } = recordingRuntime()
  new Controller(runtime).init()
  change({ v: 1, boundary: "6mo", enabled: false })
  held[0]?.release()
  await new Promise((resolve) => setTimeout(resolve, 0))
  expect(calls).toEqual(["boundary:182", "rules:standard", "stop"])
})

it("follows the switch and the boundary after start", async () => {
  const { change } = install()
  const { runtime, calls } = recordingRuntime()
  new Controller(runtime).init()
  await vi.waitFor(() => expect(calls).toContain("start"))
  const switchedOff = (): boolean =>
    document.documentElement.hasAttribute("data-boyo-off")
  expect(switchedOff()).toBe(false)
  change({ v: 1, boundary: "6mo", enabled: false })
  expect(switchedOff()).toBe(true)
  change(undefined)
  expect(switchedOff()).toBe(false)
  expect(calls.slice(3)).toEqual([
    "boundary:182",
    "rules:standard",
    "stop",
    "boundary:365",
    "rules:standard",
    "start",
  ])
})

it("applies the stored mode to Core and to the page (#1966)", async () => {
  const { store, change } = install()
  store.set(SETTINGS_KEY, { v: 1, boundary: "1y", mode: "strict" })
  const { runtime, calls } = recordingRuntime()
  new Controller(runtime).init()
  await vi.waitFor(() =>
    expect(calls).toEqual(["boundary:365", "rules:strict", "start"])
  )
  const root = document.documentElement
  expect(root.getAttribute(LOADING_ATTRIBUTE)).toBe("blank")
  expect(root.getAttribute(POSTS_ATTRIBUTE)).toBe("hidden")
  change({ v: 1, boundary: "1y", mode: "open" })
  expect(calls.at(-1)).toBe("rules:open")
  expect(root.getAttribute(LOADING_ATTRIBUTE)).toBe("blurred")
  expect(root.getAttribute(POSTS_ATTRIBUTE)).toBe("shown")
})
