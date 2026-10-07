/**
 * F1's count (docs/monorepo-boundaries.md), as pure functions.
 * `scripts/check-foreign-boundary.ts` feeds them `git ls-files` and
 * `scripts/foreign-boundary.allowlist`; these cases pin what a site is. The
 * allowlist machinery is R1's (`site-count.ts`), pinned in
 * react-coordination.test.ts; only F1's reasons are pinned here.
 */

import {
  describeForeignBoundaryViolation,
  findForeignBoundaryViolations,
  foreignSites,
} from "@eslint/foreign-boundary.js"
import { describe, expect, it } from "vitest"

const sites = (source: string): number => foreignSites("src/a.ts", source)

describe("foreignSites", () => {
  it("counts a wait on a native plugin's call, by any import shape", () => {
    expect(
      sites(`
        import { LocalNotifications } from "@capacitor/local-notifications"
        import * as Sqlite from "@capacitor-community/sqlite"
        import Http from "@capacitor/core"
        export async function f() {
          await LocalNotifications.schedule({})
          await Sqlite.CapacitorSQLite.open()
          return Http.get({}).then((r) => r)
        }
      `)
    ).toBe(3)
  })

  it("counts waits on navigator and Notification, unless the file declares its own", () => {
    expect(
      sites(`
        export async function f(t: string) {
          await navigator.clipboard.writeText(t)
          return Notification.requestPermission().catch(() => "denied")
        }
      `)
    ).toBe(2)
    expect(
      sites(`
        const navigator = { clipboard: { writeText: async (_: string) => {} } }
        export async function f(t: string) { await navigator.clipboard.writeText(t) }
      `)
    ).toBe(0)
  })

  it("follows a foreign value through declarations, and what a dynamic import yields", () => {
    expect(
      sites(`
        export async function listen() {
          const { SpeechRecognition } = await import("@capacitor-community/speech-recognition")
          const listening = SpeechRecognition.start({})
          const registration = await navigator.serviceWorker.getRegistration()
          const subscription = await registration?.pushManager.getSubscription()
          await subscription?.unsubscribe()
          const { matches } = await listening
          return matches
        }
      `)
      // Four: not the import itself, since awaiting our own chunk is not a
      // foreign wait, though what it yields is foreign.
    ).toBe(4)
  })

  it("follows where a waited value comes from, not what it is handed", () => {
    expect(
      sites(`
        declare function post(body: unknown): Promise<void>
        export async function f() {
          const subscription = await navigator.serviceWorker.ready
          await post(subscription)
          await Promise.all([post(1), navigator.storage.persist()])
          await (subscription ? navigator.storage.estimate() : null)
        }
      `)
    ).toBe(3)
  })

  it("does not count a wait inside callForeign's start, under any local name", () => {
    const boundary = `
      const port = { name: "p", classify: () => ({ kind: "unknown", retryable: true, summary: "" }), report: () => {} }
      export async function f() {
        return CALL({ port, deadlineMs: 1000, start: async () => {
          const { display } = await LocalNotifications.checkPermissions()
          return display
        } }).outcome
      }
    `
    const plugin = `import { LocalNotifications } from "@capacitor/local-notifications"\n`
    expect(
      sites(
        `${plugin}import { callForeign } from "@some-ui/intent-kit"\n${boundary.replace("CALL", "callForeign")}`
      )
    ).toBe(0)
    expect(
      sites(
        `${plugin}import { callForeign as bounded } from "@some-ui/intent-kit"\n${boundary.replace("CALL", "bounded")}`
      )
    ).toBe(0)
    expect(
      sites(
        `${plugin}import * as Intent from "@some-ui/intent-kit"\n${boundary.replace("CALL", "Intent.callForeign")}`
      )
    ).toBe(0)
    // Only `start` runs under the deadline: an argument awaited to build the
    // call waits before the boundary exists.
    expect(
      sites(
        `${plugin}import { callForeign } from "@some-ui/intent-kit"
        export async function f() {
          return callForeign({ port, deadlineMs: 1000, async start() {
            return LocalNotifications.checkPermissions().then((p) => p.display)
          }, label: await LocalNotifications.getLabel() })
        }`
      )
    ).toBe(1)
    // A lookalike from anywhere else is not the boundary.
    expect(
      sites(
        `${plugin}import { callForeign } from "./mine"\n${boundary.replace("CALL", "callForeign")}`
      )
    ).toBe(1)
  })

  it("ignores types, waits on our own values, and the word in strings or comments", () => {
    expect(
      sites(`
        import type { PermissionStatus } from "@capacitor/local-notifications"
        import { type ScheduleOptions } from "@capacitor/local-notifications"
        // await navigator.clipboard.writeText("")
        const s = "await Notification.requestPermission()"
        export async function f(p: Promise<PermissionStatus>, o: ScheduleOptions) {
          await p
          await new Promise((resolve) => setTimeout(resolve, 10))
          return [s, o]
        }
      `)
    ).toBe(0)
  })
})

describe("findForeignBoundaryViolations", () => {
  it("accepts Unbounded and Grandfathered reasons, and nothing else", () => {
    const actual = new Map([
      ["a.ts", 1],
      ["b.ts", 2],
      ["c.ts", 1],
    ])
    expect(
      findForeignBoundaryViolations(
        actual,
        [
          "# Unbounded: a best-effort hint nobody waits on",
          "1 a.ts",
          "",
          "# Grandfathered: before F1",
          "2 b.ts",
          "",
          "# Coordination: an R1 reason is not an F1 reason",
          "1 c.ts",
        ].join("\n")
      )
    ).toEqual([{ kind: "unreasoned", path: "c.ts", line: 8 }])
  })

  it("points an unlisted wait at callForeign first", () => {
    const [violation] = findForeignBoundaryViolations(
      new Map([["a.ts", 2]]),
      ""
    )
    expect(violation).toEqual({ kind: "unlisted", path: "a.ts", sites: 2 })
    expect(describeForeignBoundaryViolation(violation!)).toMatch(
      /through callForeign from @some-ui\/intent-kit/
    )
  })
})
