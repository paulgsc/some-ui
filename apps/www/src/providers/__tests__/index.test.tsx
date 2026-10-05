/**
 * @vitest-environment jsdom
 *
 * `AppProviders` must not mount `StudyNudgeWatcher` (worker registration,
 * push reconciliation, polling) until the data authority is decided, rather
 * than mounting it and hoping its internals no-op.
 */

import type { JSX, ReactNode } from "react"
import { render } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"

const studyNudgeWatcherSpy = vi.fn()

vi.mock("@/providers/study-nudge", () => ({
  StudyNudgeWatcher: (): null => {
    studyNudgeWatcherSpy()
    return null
  },
}))

// Reads the viewport (`useIsMobile`), which this file has no reason to
// stand up; its position has its own test (toaster.test.tsx).
vi.mock("@/providers/toaster", () => ({
  AppToaster: (): null => null,
}))

vi.mock("@/providers/tts", () => ({
  TTSProvider: ({ children }: { children?: ReactNode }): ReactNode => children,
}))

let kind: "pending" | "local" | "account" = "local"
vi.mock("@/lib/authority", () => ({
  useAuthority: (): { kind: typeof kind; epoch: number } => ({
    kind,
    epoch: 0,
  }),
}))

vi.mock("@/lib/auth", () => ({
  onAccountChange: (): (() => void) => () => undefined,
}))

describe("AppProviders: StudyNudgeWatcher waits for the authority to be decided", () => {
  // A fresh element each time: re-rendering the same object is a no-op.
  const tree = (): JSX.Element => (
    <AppProvidersUnderTest>
      <div>routed content</div>
    </AppProvidersUnderTest>
  )
  let AppProvidersUnderTest: (props: { children: ReactNode }) => JSX.Element

  it("is skipped while undecided, and runs for the device and for the account", async () => {
    ;({ AppProviders: AppProvidersUnderTest } = await import(
      "@/providers/index"
    ))

    kind = "pending"
    const { rerender } = render(tree())
    expect(studyNudgeWatcherSpy).not.toHaveBeenCalled()

    kind = "local"
    rerender(tree())
    expect(studyNudgeWatcherSpy).toHaveBeenCalled()

    studyNudgeWatcherSpy.mockClear()
    kind = "account"
    rerender(tree())
    expect(studyNudgeWatcherSpy).toHaveBeenCalled()
  })
})
