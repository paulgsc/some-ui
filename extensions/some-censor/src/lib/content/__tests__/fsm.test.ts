/**
 * The whole machine: `decide()` over a card's evidence, and the projection.
 *
 * The estimator's grammar is `maturity.test.ts`'s; these pin how its bands
 * become a view, and that every way of not knowing is absent.
 */

import type { ViewState } from "@censor/lib/content/fsm"
import { decide, project } from "@censor/lib/content/fsm"
import { DEFAULT_BOUNDARY_DAYS } from "@censor/lib/content/maturity/maturity"
import { tone } from "@censor/lib/content/plate/plate"
import { asChannelId, asVideoId } from "@censor/types/ids"
import { mkSession } from "@some-extension/common"
import { describe, expect, it } from "vitest"

const session = mkSession()
const NOW = Date.UTC(2026, 9, 16)

function view(
  uploadDate: string | null,
  short = false,
  boundaryDays = DEFAULT_BOUNDARY_DAYS
): ViewState["kind"] {
  return decide({ uploadDate, short }, NOW, boundaryDays, session).kind
}

describe("decide", () => {
  it("plates a card at least the boundary old (QM3, QM4)", () => {
    expect(view("2 years ago")).toBe("plated")
    expect(view("10 years ago")).toBe("plated")
    expect(view("Jan 5, 2019")).toBe("plated")
  })

  it("holds a card younger than the boundary (QM1, QM2)", () => {
    expect(view("3 days ago")).toBe("absent")
    expect(view("11 months ago")).toBe("absent")
  })

  it("reads the band against the boundary it is given", () => {
    expect(view("11 months ago", false, 182)).toBe("plated")
  })

  it("holds a card whose age it cannot prove (QM0)", () => {
    expect(view(null)).toBe("absent")
    expect(view("")).toBe("absent")
    expect(view("1.2M views")).toBe("absent")
  })

  it("holds live and upcoming cards (present)", () => {
    expect(view("12K watching")).toBe("absent")
    expect(view("Premieres Dec 1, 2026")).toBe("absent")
  })

  it("holds every Short, whatever its date", () => {
    expect(view("10 years ago", true)).toBe("absent")
  })

  it("keeps the session it is given (F1)", () => {
    expect(
      decide(
        { uploadDate: null, short: false },
        NOW,
        DEFAULT_BOUNDARY_DAYS,
        session
      )
    ).toEqual({
      kind: "absent",
      session,
    })
  })
})

describe("project", () => {
  const inputs = {
    videoId: asVideoId("vid_a"),
    channelId: asChannelId("UC_a"),
    channelName: "《Lost Summer》",
  }

  it("stamps absent and plates nothing that is not rendered", () => {
    expect(project({ kind: "absent", session }, inputs)).toEqual({
      dataBoyo: "absent",
      plate: null,
    })
  })

  it("plates a plated card from its ids and its channel's initial", () => {
    expect(project({ kind: "plated", session }, inputs)).toEqual({
      dataBoyo: "plated",
      plate: { fill: tone("vid_a"), disc: tone("UC_a"), initial: "L" },
    })
  })

  it("tones the disc by name until the channel resolves", () => {
    const unresolved = { ...inputs, channelId: null }
    expect(project({ kind: "plated", session }, unresolved).plate?.disc).toBe(
      tone("《Lost Summer》")
    )
  })
})
