/**
 * The diagnostics page: what it renders, and its wiring to the shared session
 * loader (whose ordering rules are tested in `@some-extension/common`), over
 * a fake `storage.local` that can hold a read, which is what makes the window
 * between a session switch and its read observable at all.
 *
 * The module renders on import and holds module-scope state, so each test
 * re-imports it against a fresh fake `storage.local`.
 */

import {
  indexStorageKey,
  sessionStorageKey,
  type IndexEntry,
} from "@filter/lib/content/coverage-observability"
import { ext } from "@filter/platform/content"
import {
  fakeStorage,
  type FakeStorage,
  type FakeStorageOptions,
} from "@some-extension/common/testing"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const NOW = 1_700_000_000_000

/**
 * `ext` is the `browser` global the vitest setup stubs; the page's index
 * resolves `storage.local` through it.
 */
function installFakeStorage(options: FakeStorageOptions = {}): FakeStorage {
  const fake = fakeStorage(options)
  Reflect.set(ext, "storage", { local: fake.area })
  return fake
}

function entry(id: string, title: string, updatedAt: number): IndexEntry {
  return {
    sessionId: id,
    origin: "https://example.com",
    title,
    tabState: "auto",
    updatedAt,
  }
}

/** Publish index entries the way each tab does: one key per session. */
function listSessions(
  store: Map<string, unknown>,
  entries: Array<IndexEntry>
): void {
  for (const e of entries) store.set(indexStorageKey(e.sessionId), e)
}

function seedSession(
  store: Map<string, unknown>,
  id: string,
  marker: string
): void {
  store.set(sessionStorageKey(id), {
    version: 1,
    namespace: "some-filter",
    events: [
      {
        seq: 1,
        t: NOW,
        kind: "session.start",
        severity: "info",
        detail: { marker },
      },
    ],
    metrics: { counters: {}, aggregates: {} },
    snapshots: {},
    dropped: 0,
    updatedAt: NOW,
  })
}

/** Import (or re-import) the page against the current fake storage. */
async function mountPage(): Promise<void> {
  document.body.innerHTML = '<div id="app"></div>'
  vi.resetModules()
  await import("@filter/debug/index")
}

function picker(): HTMLSelectElement {
  const select = document.querySelector("select")
  if (!select) throw new Error("no session picker rendered")
  return select
}

function buttonLabels(): Array<string> {
  return [...document.querySelectorAll("button")].map((b) => b.textContent)
}

function timelineText(): string {
  return document.querySelector("table.sf-events")?.textContent ?? ""
}

function change(select: HTMLSelectElement, value: string): void {
  select.value = value
  select.dispatchEvent(new Event("change"))
}

function clickButton(label: string): void {
  const button = [...document.querySelectorAll("button")].find(
    (b) => b.textContent === label
  )
  expect(button, `no "${label}" button`).toBeDefined()
  button?.click()
}

beforeEach(() => {
  document.body.innerHTML = ""
})

afterEach(() => {
  Reflect.deleteProperty(ext, "storage")
})

describe("the diagnostics page", () => {
  it("lists recorded sessions and shows the selected one's timeline", async () => {
    const { store } = installFakeStorage()
    listSessions(store, [entry("s1", "First", NOW)])
    seedSession(store, "s1", "marker-one")

    await mountPage()
    await vi.waitFor(() => {
      expect(timelineText()).toContain("marker-one")
    })
    expect(picker().options).toHaveLength(1)
    expect(picker().options[0]?.text).toContain("First")
    expect(buttonLabels()).toContain("Export JSON")
  })

  it("says a listed session has no recording, rather than loading forever", async () => {
    const { store } = installFakeStorage()
    listSessions(store, [entry("s1", "First", Date.now())])

    await mountPage()
    await vi.waitFor(() => {
      expect(document.body.textContent).toContain("No recording stored")
    })
    expect(document.body.textContent).not.toContain("Loading diagnostics")
    expect(buttonLabels()).not.toContain("Export JSON")
  })
})

describe("Refresh sessions", () => {
  it("discovers a recording created after the page opened, and renders it", async () => {
    const { store } = installFakeStorage()
    listSessions(store, [entry("s1", "First", NOW)])
    seedSession(store, "s1", "marker-one")

    await mountPage()
    await vi.waitFor(() => {
      expect(timelineText()).toContain("marker-one")
    })
    expect(picker().options).toHaveLength(1)

    // A second tab records while this page is open.
    listSessions(store, [entry("s2", "Second", NOW + 1000)])
    seedSession(store, "s2", "marker-two")

    clickButton("Refresh sessions")

    await vi.waitFor(() => {
      expect(picker().options).toHaveLength(2)
    })
    // It also selects the newest, which is what "Refresh sessions" means.
    await vi.waitFor(() => {
      expect(timelineText()).toContain("marker-two")
    })
  })
})

describe("the picker", () => {
  it("drops the old bundle and the Export button the moment it changes, before the read resolves", async () => {
    const { store, held } = installFakeStorage({
      hold: (key) => key.startsWith("sf.observability.session."),
    })
    listSessions(store, [
      entry("s1", "First", NOW + 1),
      entry("s2", "Second", NOW),
    ])
    seedSession(store, "s1", "marker-one")
    seedSession(store, "s2", "marker-two")

    await mountPage()
    await vi.waitFor(() => {
      expect(held).toHaveLength(1)
    })
    held[0]?.release()
    await vi.waitFor(() => {
      expect(timelineText()).toContain("marker-one")
    })
    expect(buttonLabels()).toContain("Export JSON")

    change(picker(), "s2")
    await Promise.resolve()

    expect(timelineText()).not.toContain("marker-one")
    expect(buttonLabels()).not.toContain("Export JSON")

    await vi.waitFor(() => {
      expect(held.length).toBeGreaterThan(1)
    })
    held[held.length - 1]?.release()
    await vi.waitFor(() => {
      expect(timelineText()).toContain("marker-two")
    })
    expect(picker().value).toBe("s2")
    expect(buttonLabels()).toContain("Export JSON")
  })
})

describe("a failed read", () => {
  it("shows the Unavailable panel, and Refresh recovers from it", async () => {
    let failBundleReads = true
    const { store } = installFakeStorage({
      fail: (key) =>
        failBundleReads && key.startsWith("sf.observability.session."),
    })
    listSessions(store, [entry("s1", "First", NOW)])
    seedSession(store, "s1", "marker-one")

    await mountPage()
    await vi.waitFor(() => {
      expect(document.body.textContent).toContain("Unavailable")
    })

    failBundleReads = false
    clickButton("Refresh")
    await vi.waitFor(() => {
      expect(timelineText()).toContain("marker-one")
    })
    expect(document.body.textContent).not.toContain("Unavailable")
  })
})
