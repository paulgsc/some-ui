/**
 * @vitest-environment jsdom
 *
 * Settings' voice notes and home, once kept (LA14): it never says notes wait
 * for one this phone can't send. It names why instead: let go once a share
 * arrived in Drive, gone from this phone, no room for a copy, or this
 * phone's own failure, each with Send now where trying again can help.
 */
import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

import type { KeptState } from "@/lib/home-link/kept-model"
import { INITIAL_KEPT } from "@/lib/home-link/kept-model"
import type { LaneCounts } from "@/lib/home-link/lanes"
import type { Unsendable } from "@/lib/home-link/voice-copy"
import { SHEET, VOICE_UNSENT } from "@/lib/home-link/words"
import { VoiceHomeChoice } from "@/components/settings/device-voice-home"

const lane = vi.hoisted(
  (): { run: KeptState; waiting: number; unsent: Unsendable } => ({
    run: { running: false, again: false, last: null },
    waiting: 0,
    unsent: { inDrive: 0, gone: 0 },
  })
)

vi.mock("@/lib/home-link", () => ({ useHomeLink: (): null => null }))
vi.mock("@/lib/home-link/lanes", () => ({
  askLane: (): void => undefined,
  keepOnHome: (): boolean => true,
  pairingOf: (): string => "https://home.example/api/v1",
  useLaneChoices: (): unknown => ({
    shared: new Map([["voice", { since: 0, earlier: false }]]),
    stopped: new Map(),
  }),
  useLaneRun: (): KeptState => lane.run,
}))
vi.mock("@/lib/home-link/voice", () => ({
  useUnsendable: (): Unsendable => lane.unsent,
  voiceLane: {
    useCounts: (): LaneCounts => ({
      held: { voice: 0 },
      refused: { voice: 0 },
      waiting: lane.waiting,
      away: null,
      hidden: 0,
      pulled: true,
      offered: lane.waiting,
    }),
  },
}))

afterEach(() => {
  cleanup()
  lane.run = INITIAL_KEPT
  lane.waiting = 0
  lane.unsent = { inDrive: 0, gone: 0 }
})

const ran = (last: KeptState["last"]): KeptState => ({
  ...INITIAL_KEPT,
  last,
})

describe("Settings' voice notes, kept on home", () => {
  it("names notes it can't send, and says nothing waits when nothing else does", () => {
    lane.run = ran({ kind: "synced", at: 1 })
    lane.unsent = { inDrive: 2, gone: 1 }
    render(<VoiceHomeChoice />)
    expect(screen.getByRole("status").textContent).toBe(
      "Kept on home. Up to date."
    )
    expect(screen.getByText(VOICE_UNSENT.inDrive(2))).toBeTruthy()
    expect(screen.getByText(VOICE_UNSENT.gone(1))).toBeTruthy()
    expect(screen.queryByText(/wait/)).toBeNull()
    expect(screen.queryByRole("button", { name: SHEET.sendNow })).toBeNull()
  })

  it("says a copy found no room on this phone, with what waits and Send now", () => {
    lane.run = ran({ kind: "failed", why: "room" })
    lane.waiting = 2
    render(<VoiceHomeChoice />)
    expect(screen.getByRole("status").textContent).toBe(
      "This phone has no room for more copies until home takes the ones waiting. 2 voice notes wait on this phone and go next time."
    )
    expect(screen.getByRole("button", { name: SHEET.sendNow })).toBeTruthy()
  })

  it("says a copy that failed as this phone's fault, not as waiting", () => {
    lane.run = ran({ kind: "failed", why: "fault" })
    lane.waiting = 1
    render(<VoiceHomeChoice />)
    expect(screen.getByRole("status").textContent).toBe(
      "Something on this phone went wrong. 1 voice note waits on this phone and goes next time."
    )
  })
})
