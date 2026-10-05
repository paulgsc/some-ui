/**
 * @vitest-environment jsdom
 *
 * The opt-in that lets an account hear about when a learner studies. It is
 * shown only where there is something to choose, it is off until the person
 * turns it on, and turning it off ends the push subscription at both ends
 * before the setting flips, while the transport that can tell the server is
 * still allowed.
 */

import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { authority } from "@/lib/authority"
import type { NudgePreferences } from "@/lib/study-nudge"
import { DEFAULT_NUDGE_PREFERENCES } from "@/lib/study-nudge"
import type * as ServiceWorkerModule from "@/lib/study-nudge/service-worker"

const subscribeToPush =
  vi.fn<() => Promise<ServiceWorkerModule.PushSubscribeOutcome>>()
const unsubscribeFromPush = vi.fn<() => Promise<void>>()
const reportingWhenUnsubscribing: Array<boolean> = []
let permission: NotificationPermission = "granted"

vi.mock(
  "@/lib/study-nudge/service-worker",
  (): Pick<
    typeof ServiceWorkerModule,
    | "nudgesSupported"
    | "nudgePermission"
    | "subscribeToPush"
    | "unsubscribeFromPush"
  > => ({
    nudgesSupported: () => true,
    nudgePermission: () => permission,
    subscribeToPush: () => subscribeToPush(),
    unsubscribeFromPush: () => unsubscribeFromPush(),
  })
)

const { ReportingControl } = await import(
  "@/components/settings/reporting-control"
)

const remindersOff: NudgePreferences = DEFAULT_NUDGE_PREFERENCES
const remindersOn: NudgePreferences = {
  ...DEFAULT_NUDGE_PREFERENCES,
  enabled: true,
}

async function press(): Promise<void> {
  await act(async () => {
    fireEvent.click(screen.getByRole("switch"))
    await Promise.resolve()
  })
}

beforeEach(() => {
  window.localStorage.clear()
  authority.resetForTests()
  permission = "granted"
  reportingWhenUnsubscribing.length = 0
  subscribeToPush.mockReset().mockResolvedValue("subscribed")
  unsubscribeFromPush.mockReset().mockImplementation(() => {
    reportingWhenUnsubscribing.push(authority.getSnapshot().reporting)
    return Promise.resolve()
  })
})

afterEach(() => {
  cleanup()
})

describe("ReportingControl", () => {
  it("is not offered while learning on the device: there is nothing to choose", () => {
    render(<ReportingControl preferences={remindersOff} />)
    expect(screen.queryByRole("switch")).toBeNull()
  })

  it("is offered on the account, and off until the person turns it on", () => {
    authority.dispatch({ type: "session-started", adopt: true })
    render(<ReportingControl preferences={remindersOff} />)
    expect(screen.getByText(/reminders and progress sync/i)).toBeTruthy()
    expect(screen.getByRole("switch").getAttribute("aria-checked")).toBe(
      "false"
    )
  })

  it("turns reporting on without subscribing when reminders were never asked for", async () => {
    authority.dispatch({ type: "session-started", adopt: true })
    render(<ReportingControl preferences={remindersOff} />)
    await press()

    expect(authority.getSnapshot().reportingAllowed).toBe(true)
    expect(subscribeToPush).not.toHaveBeenCalled()
  })

  it("registers this browser at once when reminders were already on and allowed", async () => {
    authority.dispatch({ type: "session-started", adopt: true })
    render(<ReportingControl preferences={remindersOn} />)
    await press()

    expect(authority.getSnapshot().reportingAllowed).toBe(true)
    expect(subscribeToPush).toHaveBeenCalledTimes(1)
  })

  it("does not ask the browser for anything it was not already permitted", async () => {
    permission = "default"
    authority.dispatch({ type: "session-started", adopt: true })
    render(<ReportingControl preferences={remindersOn} />)
    await press()

    expect(authority.getSnapshot().reporting).toBe(true)
    expect(subscribeToPush).not.toHaveBeenCalled()
  })

  it("ends the subscription at both ends before it stops reporting", async () => {
    authority.dispatch({ type: "session-started", adopt: true })
    authority.setReporting(true)
    render(<ReportingControl preferences={remindersOn} />)
    await press()

    expect(unsubscribeFromPush).toHaveBeenCalledTimes(1)
    // The server was told while reporting was still allowed ...
    expect(reportingWhenUnsubscribing).toEqual([true])
    // ... and only then did it stop.
    expect(authority.getSnapshot().reporting).toBe(false)
  })
})
