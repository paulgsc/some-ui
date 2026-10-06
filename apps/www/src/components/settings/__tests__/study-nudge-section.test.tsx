/**
 * @vitest-environment jsdom
 *
 * `study-nudge-section.tsx`'s two async handlers on `useAsyncIntent`: the
 * paths that already signalled (the denied-permission, degraded-subscribe
 * and failed-test toasts) keep their copy, plus a working state and the
 * thundering-herd guard on a rapid double-toggle.
 */

import { fakeQueryResult, withQueryClient } from "@/test-support/query-client"
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import type { NudgePreferences } from "@/lib/study-nudge"
import { DEFAULT_NUDGE_PREFERENCES } from "@/lib/study-nudge"
import type * as ServiceWorkerModule from "@/lib/study-nudge/service-worker"
import type * as UseStudyNudgeModule from "@/lib/study-nudge/use-study-nudge"
import type * as TenantModule from "@/lib/tenant"
import type { SessionRecord } from "@/lib/tenant"

const NO_SESSIONS: Array<SessionRecord> = []

const toastSpy = vi.fn()
const requestNudgePermission = vi.fn<() => Promise<NotificationPermission>>()
const registerNudgeWorker =
  vi.fn<() => Promise<ServiceWorkerRegistration | null>>()
const unsubscribeFromPush = vi.fn<() => Promise<void>>()
const showTestNudge = vi.fn<() => Promise<boolean>>()

vi.mock("sonner", () => ({
  toast: (...args: Array<unknown>): void => {
    toastSpy(...args)
  },
}))

vi.mock(
  "@/lib/study-nudge/use-study-nudge",
  (): Pick<typeof UseStudyNudgeModule, "clientOwnsNudgeDelivery"> => ({
    clientOwnsNudgeDelivery: () => true,
  })
)

vi.mock(
  "@/lib/study-nudge/service-worker",
  (): Pick<
    typeof ServiceWorkerModule,
    | "nudgesSupported"
    | "nudgePermission"
    | "requestNudgePermission"
    | "registerNudgeWorker"
    | "unsubscribeFromPush"
    | "showTestNudge"
    | "fetchPushTopics"
    | "hasPushSubscription"
  > => ({
    nudgesSupported: () => true,
    nudgePermission: () => "granted",
    requestNudgePermission: () => requestNudgePermission(),
    registerNudgeWorker: () => registerNudgeWorker(),
    unsubscribeFromPush: () => unsubscribeFromPush(),
    showTestNudge: () => showTestNudge(),
    fetchPushTopics: () => Promise.resolve([]),
    hasPushSubscription: () => Promise.resolve(false),
  })
)

vi.mock(
  "@/lib/tenant",
  async (importOriginal): Promise<typeof TenantModule> => {
    const actual = await importOriginal<typeof TenantModule>()
    return {
      ...actual,
      useSessions: () =>
        fakeQueryResult({ data: NO_SESSIONS, isLoading: false }),
    }
  }
)

const { StudyNudgeSection } = await import(
  "@/components/settings/study-nudge-section"
)

function renderSection(enabled: boolean): {
  onChange: ReturnType<typeof vi.fn>
} {
  const onChange = vi.fn()
  const preferences: NudgePreferences = {
    ...DEFAULT_NUDGE_PREFERENCES,
    enabled,
  }
  render(
    withQueryClient(
      <StudyNudgeSection preferences={preferences} onChange={onChange} />
    )
  )
  return { onChange }
}

const toggle = (): HTMLElement =>
  screen.getByRole("switch", { name: /study reminders/i })
const sendTest = (): HTMLElement =>
  screen.getByRole("button", { name: /send a test/i })

const settle = (): Promise<void> =>
  act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 20))
  })

async function clickAndSettle(element: HTMLElement): Promise<void> {
  await act(async () => {
    fireEvent.click(element)
    await new Promise((resolve) => setTimeout(resolve, 20))
  })
}

beforeEach(() => {
  toastSpy.mockClear()
  requestNudgePermission.mockReset().mockResolvedValue("granted")
  registerNudgeWorker.mockReset().mockResolvedValue(null)
  unsubscribeFromPush.mockReset().mockResolvedValue(undefined)
  showTestNudge.mockReset().mockResolvedValue(true)
})

afterEach(() => {
  cleanup()
})

describe("study-nudge-section: enabling reminders", () => {
  it("a declined permission shows the permission toast, and does not call onChange", async () => {
    requestNudgePermission.mockResolvedValue("denied")
    const { onChange } = renderSection(false)

    await clickAndSettle(toggle())

    expect(toastSpy).toHaveBeenCalledWith(
      "Reminders need notification permission",
      expect.objectContaining({
        description:
          "Your browser has blocked notifications for this site. Re-allow them in site settings, then try again.",
      })
    )
    expect(onChange).not.toHaveBeenCalled()
    expect(toggle().hasAttribute("disabled")).toBe(false)
  })

  it("a granted permission calls onChange with enabled: true", async () => {
    const { onChange } = renderSection(false)

    await clickAndSettle(toggle())

    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ enabled: true })
    )
  })

  it("double-clicking the switch in the same burst requests permission exactly once (thundering-herd regression)", async () => {
    const { onChange } = renderSection(false)

    const toggleSwitch = toggle()
    act(() => {
      fireEvent.click(toggleSwitch)
      fireEvent.click(toggleSwitch)
    })

    await settle()

    expect(requestNudgePermission.mock.calls).toHaveLength(1)
    expect(onChange.mock.calls).toHaveLength(1)
  })
})

describe("study-nudge-section: Send a test", () => {
  it("a failed test notification shows the check-permission toast", async () => {
    showTestNudge.mockResolvedValue(false)
    renderSection(true)

    await clickAndSettle(sendTest())

    expect(toastSpy).toHaveBeenCalledWith(
      "Could not show a notification - check permission."
    )
  })

  it("a successful test notification shows no toast - the notification is the confirmation", async () => {
    showTestNudge.mockResolvedValue(true)
    renderSection(true)

    await clickAndSettle(sendTest())

    expect(toastSpy).not.toHaveBeenCalled()
  })
})
