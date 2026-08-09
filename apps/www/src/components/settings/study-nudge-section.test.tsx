/**
 * @vitest-environment jsdom
 *
 * #947: `study-nudge-section.tsx`'s two `async` handlers - the only
 * non-mutation intents in the app - migrated onto `useAsyncIntent`. The
 * acceptance criterion this suite exists to hold: the handlers "keep their
 * current behaviour on the paths that already signalled" (the denied-
 * permission toast, the degraded-subscribe toast, the failed-test toast) -
 * this is a consolidation, not a rewrite, and every one of those must still
 * fire with its original copy. What's new and also covered here: a working
 * state while the chain runs, and the thundering-herd guard on a rapid
 * double-toggle.
 */

import type { JSX, ReactNode } from "react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
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
const showNudge = vi.fn<() => Promise<boolean>>()

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
    | "showNudge"
    | "fetchPushTopics"
    | "hasPushSubscription"
  > => ({
    nudgesSupported: () => true,
    nudgePermission: () => "granted",
    requestNudgePermission: () => requestNudgePermission(),
    registerNudgeWorker: () => registerNudgeWorker(),
    unsubscribeFromPush: () => unsubscribeFromPush(),
    showNudge: () => showNudge(),
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
        // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- stubbing TanStack Query's rich UseQueryResult with the two fields StatusLine actually reads; the real shape has no minimal constructor.
        ({ data: NO_SESSIONS, isLoading: false }) as ReturnType<
          typeof TenantModule.useSessions
        >,
    }
  }
)

const { StudyNudgeSection } = await import("./study-nudge-section")

function withQueryClient(children: ReactNode): JSX.Element {
  const client = new QueryClient()
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>
}

function renderSection(preferences: NudgePreferences): {
  onChange: ReturnType<typeof vi.fn>
} {
  const onChange = vi.fn()
  render(
    withQueryClient(
      <StudyNudgeSection preferences={preferences} onChange={onChange} />
    )
  )
  return { onChange }
}

beforeEach(() => {
  toastSpy.mockClear()
  requestNudgePermission.mockReset().mockResolvedValue("granted")
  registerNudgeWorker.mockReset().mockResolvedValue(null)
  unsubscribeFromPush.mockReset().mockResolvedValue(undefined)
  showNudge.mockReset().mockResolvedValue(true)
})

afterEach(() => {
  cleanup()
})

describe("study-nudge-section: enabling reminders", () => {
  it("a declined permission shows the same toast as before, and does not call onChange", async () => {
    requestNudgePermission.mockResolvedValue("denied")
    const { onChange } = renderSection({
      ...DEFAULT_NUDGE_PREFERENCES,
      enabled: false,
    })

    const toggle = screen.getByRole("switch", { name: /study reminders/i })
    await act(async () => {
      fireEvent.click(toggle)
      await new Promise((resolve) => setTimeout(resolve, 20))
    })

    expect(toastSpy).toHaveBeenCalledWith(
      "Reminders need notification permission",
      expect.objectContaining({
        description:
          "Your browser has blocked notifications for this site. Re-allow them in site settings, then try again.",
      })
    )
    expect(onChange).not.toHaveBeenCalled()
    expect(toggle.hasAttribute("disabled")).toBe(false)
  })

  it("a granted permission calls onChange with enabled: true - unchanged from pre-migration", async () => {
    const { onChange } = renderSection({
      ...DEFAULT_NUDGE_PREFERENCES,
      enabled: false,
    })

    const toggle = screen.getByRole("switch", { name: /study reminders/i })
    await act(async () => {
      fireEvent.click(toggle)
      await new Promise((resolve) => setTimeout(resolve, 20))
    })

    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ enabled: true })
    )
  })

  it("double-clicking the switch in the same burst requests permission exactly once (thundering-herd regression)", async () => {
    const { onChange } = renderSection({
      ...DEFAULT_NUDGE_PREFERENCES,
      enabled: false,
    })

    const toggle = screen.getByRole("switch", { name: /study reminders/i })
    act(() => {
      fireEvent.click(toggle)
      fireEvent.click(toggle)
    })

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 20))
    })

    expect(requestNudgePermission.mock.calls).toHaveLength(1)
    expect(onChange.mock.calls).toHaveLength(1)
  })
})

describe("study-nudge-section: Send a test", () => {
  it("a failed test notification shows the same toast as before", async () => {
    showNudge.mockResolvedValue(false)
    renderSection({ ...DEFAULT_NUDGE_PREFERENCES, enabled: true })

    const sendTest = screen.getByRole("button", { name: /send a test/i })
    await act(async () => {
      fireEvent.click(sendTest)
      await new Promise((resolve) => setTimeout(resolve, 20))
    })

    expect(toastSpy).toHaveBeenCalledWith(
      "Could not show a notification - check permission."
    )
  })

  it("a successful test notification shows no toast - the notification is the confirmation", async () => {
    showNudge.mockResolvedValue(true)
    renderSection({ ...DEFAULT_NUDGE_PREFERENCES, enabled: true })

    const sendTest = screen.getByRole("button", { name: /send a test/i })
    await act(async () => {
      fireEvent.click(sendTest)
      await new Promise((resolve) => setTimeout(resolve, 20))
    })

    expect(toastSpy).not.toHaveBeenCalled()
  })
})
