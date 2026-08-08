/**
 * Does the study nudge actually reach a desktop?
 *
 * The contract harness (`packages/contract-harness`) answers whether the two
 * sides still *fit* — it sends the client's expected requests to a real
 * `file_host` and checks the responses. It is server-to-server by design, and
 * it structurally cannot see the last hop: a push leaves the server, crosses a
 * push service, and is handled by `public/sw.js` inside a browser. Every
 * contract in that suite can be green while no notification is ever shown.
 *
 * This is that last hop, and it is the one with no other coverage at all.
 * `public/sw.js` is a plain `public/` asset — never bundled, never imported,
 * never type-checked, unreachable from a unit test — so today the only thing
 * standing between a typo in it and a silently dead feature is somebody
 * noticing they stopped being reminded to study.
 *
 * What is real here: the worker file as shipped, read off disk; Chromium's own
 * push delivery; and the notifications the browser genuinely created, read back
 * through `registration.getNotifications()`. What is synthesised: the click,
 * because no CDP command clicks a notification. See `harness.ts`.
 *
 * The payload shape is `nudge::payload::NudgePayload` in `paulgsc/server` —
 * `{ title, body, url, tag }`, four keys, no more. These tests are this
 * repository's half of that agreement.
 */

import type { BrowserContext } from "@playwright/test"
import { expect, test } from "@playwright/test"

import type { Harness } from "./harness"
import {
  clickNotification,
  nudgeTagFromClientSource,
  startNudgeHarness,
} from "./harness"

/** What `file_host` sends for a decided `LessonReady`. */
function nudgePayload(
  origin: string,
  overrides: Record<string, unknown> = {}
): string {
  return JSON.stringify({
    title: "Today's session is ready",
    body: "Hangul drill · 2 activities · ~10 min",
    url: `${origin}/sessions/session-abc`,
    tag: "some-ui.study-nudge",
    ...overrides,
  })
}

let harness: Harness

test.beforeEach(async ({ browser }) => {
  const context: BrowserContext = await browser.newContext()
  harness = await startNudgeHarness(context)
})

test.afterEach(async () => {
  await harness.close()
})

test.describe("the study-nudge service worker", () => {
  test("installs and activates from the file public/ actually serves", () => {
    // `startNudgeHarness` fails if it does not, so reaching here is the
    // assertion. Stated as its own test because it is the cheapest and most
    // valuable one: a top-level throw in sw.js takes the whole feature with
    // it, and nothing else in this repository would notice.
    expect(harness.worker().url()).toBe(`${harness.origin}/sw.js`)
  })

  test("renders a pushed nudge into the four keys the server sends", async () => {
    await harness.push(nudgePayload(harness.origin))

    await expect.poll(harness.notifications).toHaveLength(1)
    const [shown] = await harness.notifications()

    expect(shown.title).toBe("Today's session is ready")
    expect(shown.body).toBe("Hangul drill · 2 activities · ~10 min")
    expect(shown.tag).toBe("some-ui.study-nudge")
    // The deep link is what makes a click land in the session rather than on
    // the dashboard root — the difference between a reminder that works and
    // one that makes you go and find the thing yourself.
    expect(shown.data?.url).toBe(`${harness.origin}/sessions/session-abc`)
  })

  test("offers both actions, which the server's payload contract assumes", async () => {
    await harness.push(nudgePayload(harness.origin))
    await expect.poll(harness.notifications).toHaveLength(1)

    const [shown] = await harness.notifications()
    expect(shown.actions.map((a) => a.action)).toEqual(["start", "later"])
  })

  test("a second nudge replaces the first rather than stacking under it", async () => {
    // The property the server depends on when it reuses one tag all day: a
    // person who was away for six hours should come back to one reminder,
    // not six. This is the browser's behaviour, asserted through the real
    // handler rather than assumed from the spec.
    await harness.push(nudgePayload(harness.origin))
    await expect.poll(harness.notifications).toHaveLength(1)

    await harness.push(
      nudgePayload(harness.origin, { body: "a second, later nudge" })
    )

    // Polled on the *content*, not the count. Polling the count would be
    // satisfied instantly by the first notification still standing there,
    // and the test would pass without the second push having arrived at all.
    await expect
      .poll(async () => (await harness.notifications())[0]?.body)
      .toBe("a second, later nudge")

    expect(
      await harness.notifications(),
      "a second nudge stacked instead of replacing the first"
    ).toHaveLength(1)
  })

  test("the tag the worker falls back to is the one the page half holds", async () => {
    // The tag exists in three hand-maintained copies — this worker, the page
    // half in src/lib/study-nudge/service-worker.ts, and `nudge::payload` in
    // paulgsc/server — none of which can import from another. This closes
    // two of the three mechanically.
    //
    // The payload deliberately omits `tag`. With one present the worker uses
    // it (`parsed.tag || fallback.tag`) and its own constant never surfaces,
    // so a version of this test that sent a full payload would pass with the
    // constant set to anything at all — which is exactly what an earlier
    // draft of it did.
    await harness.push(
      JSON.stringify({
        title: "Today's session is ready",
        body: "Hangul drill",
        url: `${harness.origin}/sessions/session-abc`,
      })
    )
    await expect.poll(harness.notifications).toHaveLength(1)

    const [shown] = await harness.notifications()
    expect(shown.tag).toBe(nudgeTagFromClientSource())
  })

  test.describe("a push that says nothing useful still shows something", () => {
    // A `push` handler that resolves without showing a notification is
    // reported to the user agent as a broken worker, and Chrome revokes the
    // subscription over repeated offences. So the degenerate cases are not
    // cosmetic: getting them wrong turns one malformed send into a browser
    // that is permanently unsubscribed.

    test("with no payload at all — some services send a bare wakeup", async () => {
      await harness.push(null)

      await expect.poll(harness.notifications).toHaveLength(1)
      const [shown] = await harness.notifications()
      expect(shown.title).toBe("Time to study")
      expect(shown.body).toBe("Your session is ready.")
    })

    test("with a payload that is not JSON", async () => {
      await harness.push("<html>a proxy error page</html>")

      await expect.poll(harness.notifications).toHaveLength(1)
      expect((await harness.notifications())[0].title).toBe("Time to study")
    })

    test("with JSON that is missing every field", async () => {
      await harness.push(JSON.stringify({ unrelated: true }))

      await expect.poll(harness.notifications).toHaveLength(1)
      const [shown] = await harness.notifications()
      expect(shown.title).toBe("Time to study")
      // Falls back to the scope, so the click still lands somewhere real.
      expect(shown.data?.url).toBe(`${harness.origin}/`)
    })
  })

  test("clicking the body opens the session the notification named", async () => {
    await harness.push(nudgePayload(harness.origin))
    await expect.poll(harness.notifications).toHaveLength(1)

    const { opened } = await clickNotification(harness.worker(), "")

    expect(opened).toEqual([`${harness.origin}/sessions/session-abc`])
  })

  test("clicking Start now does the same thing as clicking the body", async () => {
    await harness.push(nudgePayload(harness.origin))
    await expect.poll(harness.notifications).toHaveLength(1)

    const { opened } = await clickNotification(harness.worker(), "start")

    expect(opened).toEqual([`${harness.origin}/sessions/session-abc`])
  })

  test("Later dismisses and reaches nothing", async () => {
    // This is a regression guard with history: an earlier revision of this
    // branch had "Later" POST to a snooze endpoint, and the server then
    // deleted that endpoint along with the cooldown it wrote to. Pacing is
    // engagement decay now, and a dismissal is not one of the signals that
    // moves it — so a request from here is not merely useless, it is a 404
    // from a worker that must not be seen failing.
    await harness.push(nudgePayload(harness.origin))
    await expect.poll(harness.notifications).toHaveLength(1)

    const { fetches, opened } = await clickNotification(
      harness.worker(),
      "later"
    )

    expect(fetches).toEqual([])
    expect(opened).toEqual([])
  })

  test("every click closes the notification it answered", async () => {
    await harness.push(nudgePayload(harness.origin))
    await expect.poll(harness.notifications).toHaveLength(1)

    await clickNotification(harness.worker(), "later")

    // A notification that survives being answered is one a person has to
    // dismiss twice, which is precisely the friction this feature exists to
    // remove.
    await expect.poll(harness.notifications).toHaveLength(0)
  })
})
