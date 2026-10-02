/**
 * What the built app sends when a learner has chosen the device
 * (docs/learner-data-authority.md, LA1 and LA4), observed in a real browser.
 *
 * Three claims, each about *requests that left the page*, which is the one
 * thing no unit test can see:
 *
 * 1. On the lan build with a reachable `file_host`, a fresh profile reads
 *    corpus routes and nothing else: no session probe, no signals, no
 *    presence, no push, no sessions, no shelf. Whatever did reach the server
 *    was a GET of a lesson or round, and none carried the cookie.
 * 2. With `file_host` down, the learner's sessions are still there, and a
 *    reload still shows them, and nothing asked the server for them.
 * 3. The Pages build cannot reach any other origin at all: its `connect-src`
 *    policy is present, enforced, and no route trips it.
 *
 * Controls come first in each claim where "nothing" could be a blind spot: the
 * stand-in server is shown to see a cookie when one is sent, and the Pages
 * policy is shown to block a real request.
 */

import { expect, test } from "@playwright/test"
import type { BrowserContext } from "@playwright/test"

import { builtApp, FILE_HOST_PORT, serveBuild, startFileHost } from "./harness"
import type { BuildName, Listening, Received } from "./harness"

/** Every route a learner on the device can open without an account. */
const LOCAL_ROUTES = [
  "/",
  "/app",
  "/sessions",
  "/sessions/new",
  "/settings",
  "/profile",
  "/jobs",
  "/extensions",
  "/mission",
  "/auth",
]

/**
 * What a request may be, in local mode, to reach `file_host`: a GET of a
 * lesson, round or run. Everything else on the server carries a learner's
 * state or an operator's.
 */
function isCorpusRead(r: Received): boolean {
  if (r.method !== "GET") return false
  const path = r.path.split("?")[0] ?? ""
  if (path.includes("/operator/")) return false
  return (
    path.startsWith("/api/v1/curriculum/") ||
    path.startsWith("/api/v1/leetype/rounds")
  )
}

const LEARNER_STATE =
  /\/api\/v1\/(sessions|auth|signals|presence|push|shelf|subjects|outcomes|tabs|now-playing|utter|activities|mood_events)/

function watch(context: BrowserContext): Array<string> {
  const urls: Array<string> = []
  context.on("request", (request) => {
    const url = request.url()
    if (/^(data|blob|about):/.test(url)) return
    urls.push(`${request.method()} ${url}`)
  })
  return urls
}

function skipUnlessBuilt(name: BuildName): { dir: string } {
  const built = builtApp(name)
  if ("why" in built) {
    // CI must not pass by measuring nothing; a laptop may lack the build.
    if (process.env["CI"]) throw new Error(built.why)
    test.skip(true, built.why)
    return { dir: "" }
  }
  return built
}

type FileHost = Listening & { received: Array<Received> }

/** A value set in `beforeAll`; reading it earlier is a bug in the spec. */
function held<T>(get: () => T | undefined): () => T {
  return () => {
    const value = get()
    if (value === undefined) throw new Error("used before it was started")
    return value
  }
}

declare global {
  // eslint-disable-next-line @typescript-eslint/consistent-type-definitions -- TS global augmentation requires `interface`, not `type`
  interface Window {
    __policyViolations?: Array<string>
  }
}

test.describe("the lan build, learning on the device", () => {
  let served: Listening | undefined
  let stub: FileHost | undefined
  const app = held(() => served)
  const host = held(() => stub)

  test.beforeAll(async () => {
    served = await serveBuild(skipUnlessBuilt("lan").dir, "/")
  })

  test.afterAll(async () => {
    await served?.close()
  })

  test.describe("with file_host reachable", () => {
    test.beforeAll(async () => {
      stub = await startFileHost()
    })
    test.afterAll(async () => {
      await stub?.close()
    })

    test("reads the corpus and sends nothing that is the learner's", async ({
      context,
      page,
    }) => {
      await context.addCookies([
        { name: "probe", value: "1", domain: "127.0.0.1", path: "/" },
      ])
      const seen = watch(context)

      for (const route of LOCAL_ROUTES) {
        await page.goto(`${app().origin}${route}`)
        await page.waitForLoadState("networkidle")
        // Not a blank page: something rendered, so the routes were measured.
        await expect(page.locator("#app")).not.toBeEmpty()
      }

      expect(seen.length).toBeGreaterThan(LOCAL_ROUTES.length)

      // 1. Nothing left for any host but this one and the stand-in file_host.
      const away = seen.filter(
        (line) =>
          !line.includes(app().origin) &&
          !line.includes(`127.0.0.1:${String(FILE_HOST_PORT)}`)
      )
      expect(away).toEqual([])

      // 2. Nothing the server was sent is the learner's.
      expect(host().received.filter((r) => LEARNER_STATE.test(r.path))).toEqual(
        []
      )
      expect(host().received.filter((r) => !isCorpusRead(r))).toEqual([])

      // 3. And none of it carried the cookie ...
      expect(host().received.filter((r) => r.cookie !== undefined)).toEqual([])

      // ... which this proves a request *could*, so "none" is not a blind spot.
      const before = host().received.length
      await page.evaluate(async (port) => {
        await fetch(`http://127.0.0.1:${String(port)}/control`, {
          credentials: "include",
        })
      }, FILE_HOST_PORT)
      expect(host().received.length).toBe(before + 1)
      expect(host().received.at(-1)?.cookie).toContain("probe=1")
    })
  })

  test("keeps the learner's sessions, through a reload, with file_host down", async ({
    context,
    page,
  }) => {
    // Nothing listens on 3000 here: the stand-in above is closed.
    const record = {
      id: "local-1",
      name: "Korean review",
      status: "scheduled",
      activities: [],
      scenes: [],
      layoutMode: "basic",
      totalDurationMs: 600_000,
      createdAt: "2026-03-14T09:00:00.000Z",
      updatedAt: "2026-03-14T09:00:00.000Z",
    }
    await page.addInitScript(
      (value) => {
        if (!window.localStorage.getItem("some-ui.tenant.sessions.v1")) {
          window.localStorage.setItem("some-ui.tenant.sessions.v1", value)
        }
      },
      JSON.stringify([record])
    )
    const seen = watch(context)

    await page.goto(`${app().origin}/sessions`)
    await expect(page.getByText("Korean review").first()).toBeVisible()
    await page.reload()
    await expect(page.getByText("Korean review").first()).toBeVisible()

    expect(seen.filter((line) => LEARNER_STATE.test(line))).toEqual([])
  })
})

test.describe("the Pages build", () => {
  const BASE = "/some-ui/"
  let served: Listening | undefined
  let stub: FileHost | undefined
  const app = held(() => served)
  const host = held(() => stub)

  test.beforeAll(async () => {
    served = await serveBuild(skipUnlessBuilt("pages").dir, BASE)
    stub = await startFileHost()
  })

  test.afterAll(async () => {
    await served?.close()
    await stub?.close()
  })

  test("reaches no other origin, and its policy is enforced", async ({
    context,
    page,
  }) => {
    const violations: Array<string> = []
    await page.addInitScript(() => {
      window.__policyViolations = []
      document.addEventListener("securitypolicyviolation", (event) => {
        window.__policyViolations?.push(event.blockedURI)
      })
    })
    const seen = watch(context)

    for (const route of ["", "app", "extensions", "sessions", "settings"]) {
      await page.goto(`${app().origin}${BASE}${route}`)
      await page.waitForLoadState("networkidle")
      await expect(page.locator("#app")).not.toBeEmpty()
      violations.push(
        ...((await page.evaluate(() => window.__policyViolations)) ?? [])
      )
    }

    expect(seen.filter((line) => !line.includes(app().origin))).toEqual([])
    expect(violations).toEqual([])
    expect(host().received).toEqual([])

    // The control: the policy is in the document, and it stops a real request.
    await expect(
      page.locator('meta[http-equiv="Content-Security-Policy"]')
    ).toHaveAttribute("content", "connect-src 'self'")
    const outcome = await page.evaluate(async (port) => {
      try {
        await fetch(`http://127.0.0.1:${String(port)}/control`)
        return "sent"
      } catch {
        return "blocked"
      }
    }, FILE_HOST_PORT)
    expect(outcome).toBe("blocked")
    expect(host().received).toEqual([])
    const afterControl =
      (await page.evaluate(() => window.__policyViolations)) ?? []
    expect(afterControl.some((v) => v.includes("/control"))).toBe(true)
  })
})
