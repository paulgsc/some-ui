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

import { CUBES } from "@/landing/render"
import { LANDING_WORDS } from "@/landing/words"
import { expect, test } from "@playwright/test"
import type { BrowserContext, Page } from "@playwright/test"

import { builtApp, FILE_HOST_PORT, serveBuild, startFileHost } from "./harness"
import type { BuildName, Listening, Received } from "./harness"

/** Every route a learner on the device can open without an account. */
const LOCAL_ROUTES = [
  "/",
  "/app",
  "/sessions",
  "/sessions/new",
  "/settings",
  "/settings/appearance",
  "/settings/account",
  "/practice/settings",
  "/profile",
  "/extensions",
  "/mission",
  "/assurance",
  "/job-run",
  "/auth",
]

/**
 * What a request may be, in local mode, to reach `file_host`: a GET of a
 * lesson. Everything else on the server carries a learner's state or an
 * operator's.
 */
function isCorpusRead(r: Received): boolean {
  if (r.method !== "GET") return false
  const path = r.path.split("?")[0] ?? ""
  if (path.includes("/operator/")) return false
  return path.startsWith("/api/v1/curriculum/")
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
      stub = await startFileHost(app().origin)
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

test.describe("the lan build, with an account", () => {
  let served: Listening | undefined
  let stub: FileHost | undefined
  const app = held(() => served)
  const host = held(() => stub)

  test.beforeAll(async () => {
    served = await serveBuild(skipUnlessBuilt("lan").dir, "/")
    // A live session, a push identity, and nothing else.
    stub = await startFileHost(app().origin, {
      "/auth/session": { expiresAt: Date.now() + 3_600_000 },
      "/sessions": [],
      "/push/vapid-key": { public_key: "", topics: ["lesson-ready"] },
    })
  })

  test.afterAll(async () => {
    await served?.close()
    await stub?.close()
  })

  const BEHAVIOUR = /\/api\/v1\/(signals|presence|push)/

  /** Returns what the account was sent, after a visit to every route. */
  async function visitAsAccount(
    page: Page,
    remembered: { choice: string; reporting?: boolean }
  ): Promise<Array<Received>> {
    host().received.length = 0
    await page.addInitScript((value) => {
      window.localStorage.setItem("some-ui.authority.v1", value)
    }, JSON.stringify(remembered))
    for (const route of [
      "/app",
      "/sessions",
      "/settings",
      "/settings/appearance",
      "/settings/account",
      "/practice/settings",
    ]) {
      await page.goto(`${app().origin}${route}`)
      await page.waitForLoadState("networkidle")
      await expect(page.locator("#app")).not.toBeEmpty()
    }
    return [...host().received]
  }

  test("tells the server nothing about behaviour until the person opts in", async ({
    page,
  }) => {
    const received = await visitAsAccount(page, { choice: "account" })

    // The account is in use: the session was checked and its sessions read ...
    expect(received.some((r) => r.path.endsWith("/auth/session"))).toBe(true)
    expect(received.some((r) => r.path.endsWith("/sessions"))).toBe(true)
    // ... and nothing about when or what they study, nor a push identity.
    expect(received.filter((r) => BEHAVIOUR.test(r.path))).toEqual([])
    await expect(
      page.getByRole("switch", { name: /reminders and progress sync/i })
    ).not.toBeChecked()
  })

  test("reaches for push once the person has opted in, which is the control for the test above", async ({
    page,
  }) => {
    const received = await visitAsAccount(page, {
      choice: "account",
      reporting: true,
    })
    expect(received.some((r) => r.path.endsWith("/push/vapid-key"))).toBe(true)
    await expect(
      page.getByRole("switch", { name: /reminders and progress sync/i })
    ).toBeChecked()
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
    stub = await startFileHost(app().origin)
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

    const collect = async (): Promise<void> => {
      violations.push(
        ...((await page.evaluate(() => window.__policyViolations)) ?? [])
      )
    }
    // Anything that runs: a script element that is not JSON-LD data.
    const scripts = page.locator('script:not([type="application/ld+json"])')

    // The landing at the root is static: it loads, runs nothing, and asks
    // nothing of another origin either (`seen`, below).
    await page.goto(`${app().origin}${BASE}`)
    await expect(page.locator("h1")).toBeVisible()
    await expect(scripts).toHaveCount(0)
    // Built with none of its media (C1059): every slot draws its
    // placeholder, and the build did not fail for want of one.
    await expect(page.locator("article[data-slot] .media")).toHaveCount(0)
    await expect(
      page.locator('.block--cube[data-cube="0"] .face .title-card')
    ).toHaveCount(LANDING_WORDS.projects.length)
    await expect(
      page.locator('article[data-slot="still"] .drawing')
    ).toHaveCount(2)
    // Nothing on a card is a link or a control (C1064, C1065).
    await expect(
      page.locator("article[data-slot] a, article[data-slot] button")
    ).toHaveCount(0)
    // A clip is never a player (C1064), and is hidden from a reader who
    // prefers less motion.
    await expect(
      page.locator("video[controls], video:not([aria-hidden=true])")
    ).toHaveCount(0)
    expect(
      await page.evaluate(() =>
        [...document.styleSheets].some((sheet) =>
          [...sheet.cssRules].some(
            (rule) =>
              rule instanceof CSSMediaRule &&
              rule.conditionText.includes("prefers-reduced-motion: reduce") &&
              [...rule.cssRules].some(
                (inner) =>
                  inner instanceof CSSStyleRule &&
                  inner.selectorText === "video.media" &&
                  inner.style.display === "none"
              )
          )
        )
      )
    ).toBe(true)
    // On a wide screen the cubes turn, and each project is read out once
    // (C1112).
    await page.setViewportSize({ width: 1280, height: 800 })
    await expect(
      page.getByRole("heading", {
        level: 3,
        name: LANDING_WORDS.projects[0].title,
      })
    ).toHaveCount(1)
    expect(
      await page.evaluate(() =>
        document
          .getAnimations()
          .map((a) => (a instanceof CSSAnimation ? a.animationName : ""))
          .filter((name) => name === "turn-cube")
      )
    ).toHaveLength(CUBES)
    // For a reader who prefers less motion nothing turns, types or breathes.
    await page.emulateMedia({ reducedMotion: "reduce" })
    expect(await page.evaluate(() => document.getAnimations().length)).toBe(0)
    await page.emulateMedia({ reducedMotion: null })
    await collect()

    // The résumé is static too (C1055): every version's page is there whole,
    // with no script.
    for (const version of ["", "qa/"]) {
      await page.goto(`${app().origin}${BASE}resume/${version}`)
      await expect(page.locator("main h1, main h2").first()).toBeVisible()
      await expect(scripts).toHaveCount(0)
      await collect()
    }

    // The authorship record is the site's one script: it draws the record its
    // link carries.
    await page.goto(`${app().origin}${BASE}authorship?r=AB`)
    await page.waitForLoadState("networkidle")
    await expect(page.locator("#record")).not.toBeEmpty()
    await collect()

    // A page the public site doesn't have answers its static 404.html.
    await page.goto(`${app().origin}${BASE}app`)
    await expect(page.locator("h1")).toHaveText(/\S/)
    await expect(scripts).toHaveCount(0)
    await collect()

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
