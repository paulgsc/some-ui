// Copyright (c) 2026 paulgsc — MIT License

import { POPUP_READS, type PopupRead } from "@suspender/popup/hydrate"
import { READ_FAILED, SECTION_FAILED } from "@suspender/popup/words"
import { afterEach, describe, expect, it, vi } from "vitest"

/** How a read fails: its promise rejects, or it throws before returning one. */
type Failure = "rejects" | "throws"

const SECTIONS = [".tab-status", ".action-menu", ".settings", ".popup__footer"]

/** The four `browser` calls the popup reads, keyed by what they read. */
function stubReads(failing: ReadonlySet<PopupRead>, how: Failure): void {
  const answer =
    <T>(read: PopupRead, value: T) =>
    (): Promise<T> => {
      if (!failing.has(read)) return Promise.resolve(value)
      if (how === "throws") throw new Error(`${read} unavailable`)
      return Promise.reject(new Error(`${read} unavailable`))
    }
  vi.mocked(browser.tabs.query).mockImplementation(
    answer("tab", [
      {
        id: 1,
        index: 0,
        title: "A page",
        url: "https://example.com/",
        discarded: false,
        active: true,
        highlighted: true,
        pinned: false,
        incognito: false,
      },
    ])
  )
  vi.mocked(browser.storage.local.get).mockImplementation(
    answer("settings", { number: 9 })
  )
  vi.mocked(browser.storage.session.get).mockImplementation(
    answer("kept-awake", {})
  )
  vi.stubGlobal("browser", {
    ...browser,
    commands: {
      getAll: answer("shortcuts", [
        { description: "Suspend this tab", shortcut: "Alt+Shift+S" },
      ]),
    },
  })
  vi.mocked(browser.runtime.sendMessage).mockResolvedValue(undefined)
}

/** Opens the popup afresh and waits for its reads to settle. */
async function openPopup(): Promise<HTMLElement> {
  document.body.innerHTML = '<div id="app"></div>'
  vi.resetModules()
  await import("@suspender/popup/index")
  await vi.waitFor(() => {
    expect(document.querySelector(".popup__footer")).not.toBeNull()
  })
  const root = document.getElementById("app")
  if (!root) throw new Error("no #app")
  return root
}

function noticeLines(root: HTMLElement): Array<string> {
  return [...root.querySelectorAll(".popup__trouble p")].map(
    (p) => p.textContent
  )
}

/** Every subset of the four reads: all 16 combinations. */
const COMBINATIONS: Array<Array<PopupRead>> = Array.from(
  { length: 2 ** POPUP_READS.length },
  (_, mask) => POPUP_READS.filter((_, bit) => (mask >> bit) & 1)
)

afterEach(() => {
  vi.doUnmock("@suspender/popup/components/action-menu")
})

describe("SLP1: the popup shows its controls when a read fails, and says which one", () => {
  for (const how of ["rejects", "throws"] as const) {
    it.each(
      COMBINATIONS.map((failing) => [failing.join(", ") || "none", failing])
    )(`reads failing (${how}): %s`, async (_, failing) => {
      stubReads(new Set(failing), how)

      const root = await openPopup()

      for (const section of SECTIONS) {
        expect(root.querySelector(section)).not.toBeNull()
      }
      expect(noticeLines(root)).toEqual(failing.map((r) => READ_FAILED[r]))
      const reports = vi
        .mocked(browser.runtime.sendMessage)
        .mock.calls.map(([message]) => message)
      expect(reports).toEqual(
        failing.length === 0
          ? []
          : [{ method: "popup-trouble", reads: failing, sections: [] }]
      )
    })
  }

  it("shows the defaults for settings it couldn't read, and the rest as read", async () => {
    /** "Keep loaded", the third number field: 9 as stubbed, 6 by default. */
    const keepLoaded = (root: HTMLElement): string | undefined =>
      [
        ...root.querySelectorAll<HTMLInputElement>(".settings__input--number"),
      ][2]?.value

    stubReads(new Set(), "rejects")
    expect(keepLoaded(await openPopup())).toBe("9")

    stubReads(new Set(["settings"]), "rejects")
    const root = await openPopup()
    expect(keepLoaded(root)).toBe("6")
    expect(root.textContent).toContain("A page")
  })

  it("shows the rest when one section throws while rendering, and names it", async () => {
    stubReads(new Set(), "rejects")
    vi.doMock("@suspender/popup/components/action-menu", () => ({
      ActionMenu: (): never => {
        throw new Error("render failed")
      },
    }))

    const root = await openPopup()

    expect(root.querySelector(".action-menu")).toBeNull()
    for (const section of [".tab-status", ".settings", ".popup__footer"]) {
      expect(root.querySelector(section)).not.toBeNull()
    }
    expect(noticeLines(root)).toEqual([SECTION_FAILED.actions])
    expect(browser.runtime.sendMessage).toHaveBeenCalledWith({
      method: "popup-trouble",
      reads: [],
      sections: ["actions"],
    })
  })
})
