// Copyright (c) 2026 paulgsc — MIT License

import { READ_FAILED, SECTION_FAILED } from "@suspender/popup/words"
import { POPUP_READS, type PopupRead } from "@suspender/types/messages"
import { afterEach, describe, expect, it, vi } from "vitest"

const SECTIONS = [".tab-status", ".action-menu", ".settings", ".popup__footer"]

/** The four `browser` calls the popup reads, keyed by what they read. */
function stubReads(failing: ReadonlySet<PopupRead>): void {
  const answer =
    <T>(read: PopupRead, value: T) =>
    (): Promise<T> =>
      failing.has(read)
        ? Promise.reject(new Error("unavailable"))
        : Promise.resolve(value)
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

/** The trouble reports the popup sent the worker. */
const troubleReports = (): Array<unknown> =>
  vi
    .mocked(browser.runtime.sendMessage)
    .mock.calls.map(([message]): unknown => message)
    .filter(
      (message) =>
        typeof message === "object" &&
        message !== null &&
        "method" in message &&
        message.method === "popup-trouble"
    )

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
  // Each read is an async function, so a synchronous throw inside one is a
  // rejection by the time `settleEach` sees it; `hydrate.test.ts` holds a
  // throw before any promise.
  it.each(
    COMBINATIONS.map((failing) => [failing.join(", ") || "none", failing])
  )("reads failing: %s", async (_, failing) => {
    stubReads(new Set(failing))

    const root = await openPopup()

    for (const section of SECTIONS) {
      expect(root.querySelector(section)).not.toBeNull()
    }
    expect(noticeLines(root)).toEqual(failing.map((r) => READ_FAILED[r]))
    expect(troubleReports()).toEqual(
      failing.length === 0
        ? []
        : [{ method: "popup-trouble", reads: failing, sections: [] }]
    )
  })

  it("tells the worker once per open, however often it shows again", async () => {
    stubReads(new Set(["shortcuts"]))
    const root = await openPopup()
    const toggle = root.querySelectorAll<HTMLInputElement>(
      ".action-menu__toggle-input"
    )[1]
    if (!toggle) throw new Error("no toggle")

    toggle.click()

    expect(noticeLines(root)).toEqual([READ_FAILED.shortcuts])
    expect(troubleReports()).toHaveLength(1)
  })

  it("shows the defaults for settings it couldn't read, and the rest as read", async () => {
    /** "Keep loaded", the third number field: 9 as stubbed, 6 by default. */
    const keepLoaded = (root: HTMLElement): string | undefined =>
      [
        ...root.querySelectorAll<HTMLInputElement>(".settings__input--number"),
      ][2]?.value

    stubReads(new Set())
    expect(keepLoaded(await openPopup())).toBe("9")

    stubReads(new Set(["settings"]))
    const root = await openPopup()
    expect(keepLoaded(root)).toBe("6")
    expect(root.textContent).toContain("A page")
  })

  describe("a whitelist edit after the settings couldn't be read", () => {
    async function addRule(root: HTMLElement, rule: string): Promise<void> {
      const input = root.querySelector<HTMLInputElement>(
        ".settings__whitelist-add input"
      )
      const add = root.querySelector<HTMLButtonElement>(
        ".settings__whitelist-addbtn"
      )
      if (!input || !add) throw new Error("no whitelist field")
      input.value = rule
      add.click()
      await vi.waitFor(() => {
        expect(browser.storage.local.get).toHaveBeenCalledTimes(2)
      })
    }

    it("writes nothing while they still can't be read", async () => {
      stubReads(new Set(["settings"]))
      const root = await openPopup()

      await addRule(root, "new.example")

      expect(browser.storage.local.set).not.toHaveBeenCalled()
      expect(noticeLines(root)).toEqual([READ_FAILED.settings])
    })

    it("adds to the rules as saved, not to the defaults shown", async () => {
      stubReads(new Set(["settings"]))
      const root = await openPopup()
      vi.mocked(browser.storage.local.get).mockResolvedValue({
        whitelist: ["kept.example"],
      })
      vi.mocked(browser.storage.local.set).mockResolvedValue(undefined)

      await addRule(root, "new.example")

      await vi.waitFor(() => {
        expect(browser.storage.local.set).toHaveBeenCalledWith({
          whitelist: ["kept.example", "new.example"],
        })
      })
    })
  })

  it("shows the rest when one section throws while rendering, and names it", async () => {
    stubReads(new Set())
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
