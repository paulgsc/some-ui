/**
 * The send's line: what changed, in a few words, then why it stopped if it
 * did. Says nothing about what was already there.
 */
import { describe, expect, it } from "vitest"

import { SyncStoppedError } from "@/lib/device-backend/home-sync"
import { emptyLogReport } from "@/lib/home-link/leetype-log"
import type { SendOutcome } from "@/lib/home-link/send"
import { describeSend } from "@/lib/home-link/send"
import { HomeForgotPhoneError } from "@/lib/home-link/sessions"
import { emptyReport } from "@/lib/home-link/shelf"
import { emptyHeldReport } from "@/lib/tenant/sessions-copy"

function outcome(over: Partial<SendOutcome> = {}): SendOutcome {
  return {
    copy: { outcome: { kind: "copied", copied: 0 }, alreadyThere: 0 },
    held: emptyHeldReport(),
    freed: 0,
    shelf: emptyReport(),
    log: emptyLogReport(),
    ended: null,
    ...over,
  }
}

describe("describeSend", () => {
  it("says what changed, and what left the phone", () => {
    const shelf = { ...emptyReport(), sent: 3, kept: 1, replaced: 1 }
    expect(
      describeSend(
        outcome({
          copy: { outcome: { kind: "copied", copied: 5 }, alreadyThere: 7 },
          shelf,
          freed: 6,
        }),
        "home.example"
      )
    ).toBe("Copied 5 sessions. Sent 2 kept items. Cleared 6 from this phone.")
  })

  it("is one line when nothing changed", () => {
    expect(describeSend(outcome(), "home.example")).toBe(
      "home.example is up to date."
    )
  })

  it("says what did not fit or was refused", () => {
    const shelf = {
      ...emptyReport(),
      sent: 1,
      kept: 1,
      refused: 1,
      full: new Map([["topik", 2]]),
    }
    expect(describeSend(outcome({ shelf }), "home.example")).toBe(
      "Sent 1 kept item. 2 didn't fit: home's shelf is full. 1 refused by home.example."
    )
  })

  it("says which LeetType sessions home now holds, and which it didn't take", () => {
    const log = { ...emptyLogReport(), held: 2, refused: 1, differs: 1 }
    expect(describeSend(outcome({ log }), "home.example")).toBe(
      "Copied 2 LeetType sessions. 1 refused by home.example. 1 kept: home's copy didn't match."
    )
  })

  it("says why it ended early", () => {
    const stopped = outcome({
      copy: {
        outcome: {
          kind: "partial",
          copied: 1,
          remaining: 2,
          error: new SyncStoppedError(),
        },
        alreadyThere: 0,
      },
    })
    expect(describeSend(stopped, "home.example")).toBe(
      "Copied 1 session. Stopped: send again to carry on."
    )
    const forgotten = outcome({
      shelf: { ...emptyReport(), forgotten: true },
    })
    expect(describeSend(forgotten, "home.example")).toBe(
      "home.example no longer knows this phone: unpair, then pair again."
    )
  })

  it("says home could not be reached when nothing went", () => {
    expect(
      describeSend(
        outcome({ copy: null, ended: new TypeError("Failed to fetch") }),
        "home.example"
      )
    ).toBe(
      "Couldn't reach home.example. Are you on the home network? Nothing was sent."
    )
    expect(
      describeSend(
        outcome({ ended: new HomeForgotPhoneError() }),
        "home.example"
      )
    ).toBe("home.example no longer knows this phone: unpair, then pair again.")
  })

  it("says home was busy when it turned the send away", () => {
    const busy = new Error("home answered 429")
    expect(
      describeSend(
        outcome({ copy: null, ended: busy, busy: true }),
        "home.example"
      )
    ).toBe("Home is busy right now. Nothing was sent; try again in a minute.")
    const shelf = { ...emptyReport(), sent: 1, kept: 1, unreachable: true }
    expect(describeSend(outcome({ shelf, busy: true }), "home.example")).toBe(
      "Sent 1 kept item. Home is busy right now: send again in a minute to carry on."
    )
    expect(
      describeSend(
        outcome({ copy: null, ended: new SyncStoppedError(), busy: true }),
        "home.example"
      )
    ).toBe("Stopped: send again to carry on.")
  })
})
