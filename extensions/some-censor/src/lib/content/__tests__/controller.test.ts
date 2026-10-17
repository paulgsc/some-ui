/**
 * The controller follows the owner's settings in `storage.local` (#1807).
 * The runtime is a stand-in that records what it was told.
 */

import { Controller } from "@censor/lib/content/controller"
import type { Runtime } from "@censor/lib/content/runtime/runtime"
import { SETTINGS_KEY } from "@censor/lib/settings/settings"
import { ext } from "@censor/platform/content"
import {
  fakeStorage,
  type FakeStorage,
  type FakeStorageOptions,
} from "@some-extension/common/testing"
import { afterEach, beforeEach, expect, it, vi } from "vitest"

type Changes = Record<string, { newValue?: unknown }>
type Listener = (changes: Changes, area: string) => void

function install(
  options: FakeStorageOptions = {}
): FakeStorage & { change: (value: unknown) => void } {
  const fake = fakeStorage(options)
  const listeners: Array<Listener> = []
  Reflect.set(ext, "storage", {
    local: fake.area,
    onChanged: { addListener: (l: Listener) => listeners.push(l) },
  })
  const change = (value: unknown): void => {
    for (const l of listeners)
      l({ [SETTINGS_KEY]: { newValue: value } }, "local")
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
})

afterEach(() => {
  Reflect.deleteProperty(ext, "storage")
})

it("applies the stored boundary before the first start", async () => {
  const { store } = install()
  store.set(SETTINGS_KEY, { v: 1, boundary: "2y", enabled: true })
  const { runtime, calls } = recordingRuntime()
  new Controller(runtime).init()
  await vi.waitFor(() => expect(calls).toEqual(["boundary:730", "start"]))
})

it("starts on the defaults when the read fails", async () => {
  install({ fail: (k) => k === SETTINGS_KEY })
  const { runtime, calls } = recordingRuntime()
  new Controller(runtime).init()
  await vi.waitFor(() => expect(calls).toEqual(["boundary:365", "start"]))
})

it("drops a first read that a change overtook", async () => {
  const { store, held, change } = install({ hold: (k) => k === SETTINGS_KEY })
  store.set(SETTINGS_KEY, { v: 1, boundary: "2y", enabled: true })
  const { runtime, calls } = recordingRuntime()
  new Controller(runtime).init()
  change({ v: 1, boundary: "6mo", enabled: false })
  held[0]?.release()
  await new Promise((resolve) => setTimeout(resolve, 0))
  expect(calls).toEqual(["boundary:183", "stop"])
})

it("follows the switch and the boundary after start", async () => {
  const { change } = install()
  const { runtime, calls } = recordingRuntime()
  new Controller(runtime).init()
  await vi.waitFor(() => expect(calls).toContain("start"))
  change({ v: 1, boundary: "6mo", enabled: false })
  change(undefined)
  expect(calls.slice(2)).toEqual([
    "boundary:183",
    "stop",
    "boundary:365",
    "start",
  ])
})
