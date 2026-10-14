/**
 * The diagnostics page: what it renders, and its wiring to the shared session
 * loader (whose ordering rules are tested in `@some-extension/common`).
 *
 * "The export writes the wrong session's file" is the one failure a page whose
 * output feeds QC2 (#1384) must not have, so the picker gets a harness that
 * can hold a read.
 *
 * The module renders on import and holds module-scope state, so each test
 * re-imports it against a fresh fake `storage.local`.
 */

import {
  indexStorageKey,
  sessionStorageKey,
  type IndexEntry,
} from "@censor/lib/content/observability"
import { ext } from "@censor/platform/content"
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

function entry(id: string, ordinal: number, updatedAt: number): IndexEntry {
  return {
    sessionId: id,
    origin: "https://www.youtube.com",
    surface: "home",
    sessionOrdinal: ordinal,
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
  forms: Array<string>
): void {
  store.set(sessionStorageKey(id), {
    version: 1,
    namespace: "some-censor",
    events: [{ seq: 1, t: NOW, kind: "session.start", severity: "info" }],
    metrics: { counters: {}, aggregates: {} },
    snapshots: { [`dates.home`]: forms },
    dropped: 0,
    updatedAt: NOW,
  })
}

/** Import (or re-import) the page against the current fake storage. */
async function mountPage(): Promise<void> {
  document.body.innerHTML = '<div id="app"></div>'
  vi.resetModules()
  await import("@censor/debug/index")
}

function picker(): HTMLSelectElement {
  const select = document.querySelector("select")
  if (!select) throw new Error("no session picker rendered")
  return select
}

function buttonLabels(): Array<string> {
  return [...document.querySelectorAll("button")].map((b) => b.textContent)
}

function corpusText(): string {
  return document.querySelector("table.bc-corpus")?.textContent ?? ""
}

function change(select: HTMLSelectElement, value: string): void {
  select.value = value
  select.dispatchEvent(new Event("change"))
}

beforeEach(() => {
  document.body.innerHTML = ""
})

afterEach(() => {
  Reflect.deleteProperty(ext, "storage")
})

describe("the diagnostics page", () => {
  it("says a listed session has no recording, rather than loading forever", async () => {
    const { store } = installFakeStorage()
    listSessions(store, [entry("s1", 1, Date.now())])

    await mountPage()
    await vi.waitFor(() => {
      expect(document.body.textContent).toContain("No recording stored")
    })
    expect(document.body.textContent).not.toContain("Loading diagnostics")
    expect(buttonLabels()).not.toContain("Export JSON")
  })

  it("lists recorded sessions and shows the selected one's corpus", async () => {
    const { store } = installFakeStorage()
    listSessions(store, [entry("s1", 1, NOW)])
    seedSession(store, "s1", ["3 days ago"])

    await mountPage()
    await vi.waitFor(() => {
      expect(corpusText()).toContain("3 days ago")
    })
    expect(picker().options).toHaveLength(1)
  })

  it("labels sessions without a page title — on YouTube that is the video title (#1382)", async () => {
    const { store } = installFakeStorage()
    document.title = "Never Gonna Give You Up - YouTube"
    listSessions(store, [entry("s1", 4, NOW)])
    seedSession(store, "s1", ["3 days ago"])

    await mountPage()
    await vi.waitFor(() => {
      expect(picker().options).toHaveLength(1)
    })

    const label = picker().options[0]?.text ?? ""
    expect(label).not.toContain("Never Gonna Give You Up")
    expect(label).toContain("https://www.youtube.com")
    expect(label).toContain("home")
    expect(label).toContain("session 4")
  })
})

describe("the picker", () => {
  it("drops the old bundle and the Export button the moment it changes, before the read resolves", async () => {
    const { store, held } = installFakeStorage({
      hold: (key) => key.startsWith("bc.observability.session."),
    })
    listSessions(store, [entry("s1", 1, NOW + 1), entry("s2", 2, NOW)])
    seedSession(store, "s1", ["3 days ago"])
    seedSession(store, "s2", ["2 weeks ago"])

    await mountPage()
    await vi.waitFor(() => {
      expect(held).toHaveLength(1)
    })
    held[0]?.release()
    await vi.waitFor(() => {
      expect(corpusText()).toContain("3 days ago")
    })
    expect(buttonLabels()).toContain("Export JSON")

    // s2's read is held: exactly the window in which an export would have
    // written s1's file while the page named s2.
    change(picker(), "s2")

    expect(corpusText()).not.toContain("3 days ago")
    expect(buttonLabels()).not.toContain("Export JSON")

    await vi.waitFor(() => {
      expect(held.length).toBeGreaterThan(1)
    })
    held[held.length - 1]?.release()
    await vi.waitFor(() => {
      expect(corpusText()).toContain("2 weeks ago")
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
        failBundleReads && key.startsWith("bc.observability.session."),
    })
    listSessions(store, [entry("s1", 1, NOW)])
    seedSession(store, "s1", ["3 days ago"])

    await mountPage()
    await vi.waitFor(() => {
      expect(document.body.textContent).toContain("Unavailable")
    })

    failBundleReads = false
    const refresh = [...document.querySelectorAll("button")].find(
      (b) => b.textContent === "Refresh"
    )
    refresh?.click()
    await vi.waitFor(() => {
      expect(corpusText()).toContain("3 days ago")
    })
    expect(document.body.textContent).not.toContain("Unavailable")
  })
})

describe("Refresh sessions", () => {
  it("discovers a recording created after the page opened, and renders it", async () => {
    const { store } = installFakeStorage()
    listSessions(store, [entry("s1", 1, NOW)])
    seedSession(store, "s1", ["3 days ago"])

    await mountPage()
    await vi.waitFor(() => {
      expect(corpusText()).toContain("3 days ago")
    })
    expect(picker().options).toHaveLength(1)

    // A second tab records while this page is open.
    listSessions(store, [entry("s2", 2, NOW + 1000), entry("s1", 1, NOW)])
    seedSession(store, "s2", ["2 weeks ago"])

    const refresh = [...document.querySelectorAll("button")].find(
      (b) => b.textContent === "Refresh sessions"
    )
    expect(refresh).toBeDefined()
    refresh?.click()

    await vi.waitFor(() => {
      expect(picker().options).toHaveLength(2)
    })
    // It also selects the newest, which is what "Refresh sessions" means.
    await vi.waitFor(() => {
      expect(corpusText()).toContain("2 weeks ago")
    })
  })
})
