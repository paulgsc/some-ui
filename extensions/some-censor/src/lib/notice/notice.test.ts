// @vitest-environment node
import { STOP_WORDS } from "@censor/lib/settings/words"
import { describe, expect, it } from "vitest"

import type { ActionPort } from "./notice"
import {
  createNotices,
  parseStopped,
  stoppedMessage,
  stoppedOn,
} from "./notice"

/** A toolbar button that keeps each tab's badge and title. */
function button(
  colour: () => Promise<void> = () => Promise.resolve()
): ActionPort & {
  readonly text: Map<number, string>
  readonly title: Map<number, string | null>
} {
  const text = new Map<number, string>()
  const title = new Map<number, string | null>()
  return {
    text,
    title,
    setBadgeText: ({ tabId, text: t }): Promise<void> => {
      if (tabId !== undefined) text.set(tabId, t ?? "")
      return Promise.resolve()
    },
    setBadgeBackgroundColor: colour,
    setTitle: ({ tabId, title: t }): Promise<void> => {
      if (tabId !== undefined) title.set(tabId, t)
      return Promise.resolve()
    },
    getBadgeText: ({ tabId }): Promise<string> =>
      Promise.resolve(tabId === undefined ? "" : (text.get(tabId) ?? "")),
  }
}

describe("the stopped message (R13)", () => {
  it("reads back what was sent, and nothing else", () => {
    expect(parseStopped(stoppedMessage(true))).toBe(true)
    expect(parseStopped(stoppedMessage(false))).toBe(false)
    expect(parseStopped({ kind: "other", stopped: true })).toBeNull()
    expect(parseStopped({ kind: "boyo/stopped" })).toBeNull()
    expect(parseStopped(null)).toBeNull()
    expect(parseStopped("boyo/stopped")).toBeNull()
  })
})

describe("the toolbar button's notice (R13)", () => {
  it("shows on one tab, and comes off with the button's own title back", async () => {
    const action = button()
    const notice = createNotices(action)
    await notice(7, true)
    expect(action.text.get(7)).toBe(STOP_WORDS.badge)
    expect(action.title.get(7)).toBe(STOP_WORDS.title)
    expect(await stoppedOn(action, 7)).toBe(true)
    expect(await stoppedOn(action, 8), "another tab").toBe(false)

    await notice(7, false)
    expect(action.text.get(7)).toBe("")
    expect(action.title.get(7)).toBeNull()
    expect(await stoppedOn(action, 7)).toBe(false)
  })

  it("draws the last message a tab sent, however long a call takes", async () => {
    let release = (): void => undefined
    const slow = new Promise<void>((resolve) => {
      release = resolve
    })
    const action = button(() => slow)
    const notice = createNotices(action)
    const shown = notice(7, true)
    const cleared = notice(7, false)
    release()
    await Promise.all([shown, cleared])
    expect(action.text.get(7)).toBe("")
    expect(action.title.get(7)).toBeNull()
  })
})
