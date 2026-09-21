/**
 * The diagnostics page's load/render behaviour (#1408).
 *
 * some-censor's page was modelled on this one and inherited two bugs its
 * review found — "Refresh sessions" rendering nothing, and a session switch
 * leaving the previous session's bundle rendered with Export live — plus a
 * third one step out (two reads settling out of order). The fixes are ported
 * back here with the same harness: a fake `storage.local` that defers reads
 * on demand, which is what makes the intermediate window observable at all.
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
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const NOW = 1_700_000_000_000

type Held = { key: string; release: () => void }

/**
 * The key a whole-area read (`get(null)`, the index enumeration on an engine
 * without `getKeys()`) is presented to `hold`/`fail` under.
 */
const WHOLE_AREA = "*"

/** A fake `storage.local`; `hold` defers a key's read until released. */
function installFakeStorage(
  hold?: (key: string) => boolean,
  fail?: (key: string) => boolean
): {
  store: Map<string, unknown>
  held: Array<Held>
} {
  const store = new Map<string, unknown>()
  const held: Array<Held> = []
  const asList = (keys: string | Array<string> | null): Array<string> =>
    keys === null ? [...store.keys()] : typeof keys === "string" ? [keys] : keys
  const probes = (keys: string | Array<string> | null): Array<string> =>
    keys === null ? [WHOLE_AREA] : typeof keys === "string" ? [keys] : keys
  Reflect.set(ext, "storage", {
    local: {
      get: (
        keys: string | Array<string> | null
      ): Promise<Record<string, unknown>> => {
        const probe = probes(keys)
        if (probe.some((k) => fail?.(k) === true)) {
          return Promise.reject(
            new Error(`storage unavailable: ${probe.join(",")}`)
          )
        }
        const value: Record<string, unknown> = {}
        for (const k of asList(keys)) if (store.has(k)) value[k] = store.get(k)
        const holdKey = probe.find((k) => hold?.(k) === true)
        if (holdKey !== undefined) {
          return new Promise((resolve) => {
            held.push({ key: holdKey, release: () => resolve(value) })
          })
        }
        return Promise.resolve(value)
      },
      set: (items: Record<string, unknown>): Promise<void> => {
        for (const [k, v] of Object.entries(items)) store.set(k, v)
        return Promise.resolve()
      },
      remove: (keys: string | Array<string>): Promise<void> => {
        for (const k of asList(keys)) store.delete(k)
        return Promise.resolve()
      },
    },
  })
  return { store, held }
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

/** Publish index entries the way each tab does: one key per session (#1398). */
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
})

describe("Refresh sessions (#1408)", () => {
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

describe("switching sessions never shows one session under another's name (#1408)", () => {
  it("drops the old bundle and the Export button the moment the picker changes, before the read resolves", async () => {
    const { store, held } = installFakeStorage((key) =>
      key.startsWith("sf.observability.session.")
    )
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

    // Switch to s2; its read is held, so this is exactly the window in which
    // an export would have written s1's file while the page named s2.
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
    expect(buttonLabels()).toContain("Export JSON")
  })

  it("shows the last selection when two reads settle out of order, not the last to arrive", async () => {
    const { store, held } = installFakeStorage((key) =>
      key.startsWith("sf.observability.session.")
    )
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

    // Select s2 while s1's initial read is still outstanding, then let s1's
    // read finish *after* s2's — the stale one arriving last.
    change(picker(), "s2")
    await vi.waitFor(() => {
      expect(held).toHaveLength(2)
    })
    held[1]?.release()
    await vi.waitFor(() => {
      expect(timelineText()).toContain("marker-two")
    })

    held[0]?.release()
    await Promise.resolve()
    await Promise.resolve()
    await Promise.resolve()

    expect(timelineText()).toContain("marker-two")
    expect(timelineText()).not.toContain("marker-one")
  })

  it("does not let a slow Refresh reset the selection the user has since made", async () => {
    let holdNextIndexRead = false
    const { store, held } = installFakeStorage((key) => {
      if (key !== WHOLE_AREA || !holdNextIndexRead) return false
      holdNextIndexRead = false
      return true
    })
    // s1 is the most recent, so a stale load(true) would snap back to it.
    listSessions(store, [
      entry("s1", "First", NOW + 1000),
      entry("s2", "Second", NOW),
    ])
    seedSession(store, "s1", "marker-one")
    seedSession(store, "s2", "marker-two")

    await mountPage()
    await vi.waitFor(() => {
      expect(timelineText()).toContain("marker-one")
    })

    // "Refresh sessions" starts a load(true) whose index read hangs.
    holdNextIndexRead = true
    clickButton("Refresh sessions")
    await vi.waitFor(() => {
      expect(held).toHaveLength(1)
    })

    // The user overtakes it by picking s2, which loads and renders normally.
    change(picker(), "s2")
    await vi.waitFor(() => {
      expect(timelineText()).toContain("marker-two")
    })

    // Now the overtaken refresh finally resolves.
    held[0]?.release()
    await Promise.resolve()
    await Promise.resolve()
    await Promise.resolve()

    // A rerender that does *not* reload — a timeline filter change — is where
    // a reset selection would surface.
    const kindSelect =
      document.querySelector<HTMLSelectElement>(".sf-filter select")
    expect(kindSelect).not.toBeNull()
    if (kindSelect) change(kindSelect, "")

    // render() here is async (health is recomputed before anything is
    // appended), so the repaint lands a few microtasks later.
    await vi.waitFor(() => {
      expect(picker().value).toBe("s2")
    })
    expect(timelineText()).toContain("marker-two")
    expect(timelineText()).not.toContain("marker-one")
  })
})

describe("retrying after a failed read", () => {
  it("clears the Unavailable panel as soon as the retry starts, not when it finishes", async () => {
    let failBundleReads = false
    let holdNextBundleRead = false
    const isBundleKey = (key: string): boolean =>
      key.startsWith("sf.observability.session.")

    const { store, held } = installFakeStorage(
      (key) => {
        if (!isBundleKey(key) || !holdNextBundleRead) return false
        holdNextBundleRead = false
        return true
      },
      (key) => isBundleKey(key) && failBundleReads
    )
    listSessions(store, [entry("s1", "First", NOW)])
    seedSession(store, "s1", "marker-one")

    await mountPage()
    await vi.waitFor(() => {
      expect(timelineText()).toContain("marker-one")
    })

    failBundleReads = true
    clickButton("Refresh")
    await vi.waitFor(() => {
      expect(document.body.textContent).toContain("Unavailable")
    })

    failBundleReads = false
    holdNextBundleRead = true
    clickButton("Refresh")
    await Promise.resolve()

    expect(document.body.textContent).not.toContain("Unavailable")

    await vi.waitFor(() => {
      expect(held).toHaveLength(1)
    })
    held[0]?.release()
    await vi.waitFor(() => {
      expect(timelineText()).toContain("marker-one")
    })
  })
})
