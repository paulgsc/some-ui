/**
 * The page's load/render behaviour.
 *
 * #1396 sets the testing bar at some-filter's debug page, which has none —
 * but its own review found two ways this page could show one session while
 * naming another, and "the export writes the wrong session's file" is the one
 * failure a page whose output feeds QC2 (#1384) must not have. So the load
 * path gets a harness even though the bar did not demand one.
 *
 * The module renders on import and holds module-scope state, so each test
 * re-imports it against a fresh fake `storage.local`.
 */

import {
  INDEX_KEY,
  sessionStorageKey,
  type IndexEntry,
} from "@censor/lib/content/observability"
import { ext } from "@censor/platform/content"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const NOW = 1_700_000_000_000

type Held = { key: string; release: () => void }

/** A fake `storage.local`; `hold` defers a key's read until released. */
function installFakeStorage(hold?: (key: string) => boolean): {
  store: Map<string, unknown>
  held: Array<Held>
} {
  const store = new Map<string, unknown>()
  const held: Array<Held> = []
  Reflect.set(ext, "storage", {
    local: {
      get: (key: string): Promise<Record<string, unknown>> => {
        const value = store.has(key) ? { [key]: store.get(key) } : {}
        if (hold?.(key) === true) {
          return new Promise((resolve) => {
            held.push({ key, release: () => resolve(value) })
          })
        }
        return Promise.resolve(value)
      },
      set: (items: Record<string, unknown>): Promise<void> => {
        for (const [k, v] of Object.entries(items)) store.set(k, v)
        return Promise.resolve()
      },
      remove: (key: string): Promise<void> => {
        store.delete(key)
        return Promise.resolve()
      },
    },
  })
  return { store, held }
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
  it("lists recorded sessions and shows the selected one's corpus", async () => {
    const { store } = installFakeStorage()
    store.set(INDEX_KEY, [entry("s1", 1, NOW)])
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
    store.set(INDEX_KEY, [entry("s1", 4, NOW)])
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

describe("switching sessions never shows one session under another's name (#1407's own review)", () => {
  it("drops the old bundle and the Export button the moment the picker changes, before the read resolves", async () => {
    const { store, held } = installFakeStorage((key) =>
      key.startsWith("bc.observability.session.")
    )
    store.set(INDEX_KEY, [entry("s1", 1, NOW + 1), entry("s2", 2, NOW)])
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

    // Switch to s2; its read is held, so this is exactly the window in which
    // an export would have written s1's file while the page named s2.
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
    expect(buttonLabels()).toContain("Export JSON")
  })

  it("shows the last selection when two reads settle out of order, not the last to arrive", async () => {
    const { store, held } = installFakeStorage((key) =>
      key.startsWith("bc.observability.session.")
    )
    store.set(INDEX_KEY, [entry("s1", 1, NOW + 1), entry("s2", 2, NOW)])
    seedSession(store, "s1", ["3 days ago"])
    seedSession(store, "s2", ["2 weeks ago"])

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
      expect(corpusText()).toContain("2 weeks ago")
    })

    held[0]?.release()
    await Promise.resolve()
    await Promise.resolve()

    expect(corpusText()).toContain("2 weeks ago")
    expect(corpusText()).not.toContain("3 days ago")
  })
})

describe("a superseded load commits nothing (#1407's own review, round 2)", () => {
  it("does not let a slow Refresh reset the selection the user has since made — that would name one session while exporting another", async () => {
    let holdNextIndexRead = false
    const { store, held } = installFakeStorage((key) => {
      if (key !== INDEX_KEY || !holdNextIndexRead) return false
      holdNextIndexRead = false
      return true
    })
    // s1 is the most recent, so a stale load(true) would snap back to it.
    store.set(INDEX_KEY, [entry("s1", 1, NOW + 1000), entry("s2", 2, NOW)])
    seedSession(store, "s1", ["3 days ago"])
    seedSession(store, "s2", ["2 weeks ago"])

    await mountPage()
    await vi.waitFor(() => {
      expect(corpusText()).toContain("3 days ago")
    })

    // "Refresh sessions" starts a load(true) whose index read hangs.
    holdNextIndexRead = true
    const refresh = [...document.querySelectorAll("button")].find(
      (b) => b.textContent === "Refresh sessions"
    )
    refresh?.click()
    await vi.waitFor(() => {
      expect(held).toHaveLength(1)
    })

    // The user overtakes it by picking s2, which loads and renders normally.
    change(picker(), "s2")
    await vi.waitFor(() => {
      expect(corpusText()).toContain("2 weeks ago")
    })

    // Now the overtaken refresh finally resolves.
    held[0]?.release()
    await Promise.resolve()
    await Promise.resolve()

    // A rerender that does *not* reload — a timeline filter change is enough —
    // is where a reset selection would surface, drawing the picker on s1 with
    // s2's bundle still behind the Export button.
    const kindSelect =
      document.querySelector<HTMLSelectElement>(".bc-filter select")
    expect(kindSelect).not.toBeNull()
    if (kindSelect) change(kindSelect, "")

    expect(picker().value).toBe("s2")
    expect(corpusText()).toContain("2 weeks ago")
    expect(corpusText()).not.toContain("3 days ago")
  })
})

describe("Refresh sessions (#1407's own review)", () => {
  it("discovers a recording created after the page opened, and renders it", async () => {
    const { store } = installFakeStorage()
    store.set(INDEX_KEY, [entry("s1", 1, NOW)])
    seedSession(store, "s1", ["3 days ago"])

    await mountPage()
    await vi.waitFor(() => {
      expect(corpusText()).toContain("3 days ago")
    })
    expect(picker().options).toHaveLength(1)

    // A second tab records while this page is open.
    store.set(INDEX_KEY, [entry("s2", 2, NOW + 1000), entry("s1", 1, NOW)])
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
