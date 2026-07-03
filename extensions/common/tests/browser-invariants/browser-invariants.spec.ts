/**
 * Browser API runtime invariants.
 *
 * These tests pin assumptions that ALL extension workspaces make about the
 * browser API. They are agnostic to any specific extension and must pass
 * before any extension's E2E suite runs (see turbo.json `test:e2e` → `^test:invariants`).
 *
 * Philosophy:
 *   TypeScript type declarations describe INTENDED behaviour. This suite
 *   asserts ACTUAL runtime behaviour. A failure here means a browser update
 *   (or a platform quirk in the CI environment) has invalidated an assumption
 *   baked into extraction code, storage patterns, or event handling — and
 *   the affected extension code must be re-audited before shipping.
 *
 * Organisation:
 *   DOM Core          — textContent, innerHTML, id, className, tagName
 *   DOM Query         — querySelector, querySelectorAll, getElementById
 *   Element Geometry  — getBoundingClientRect, offset dimensions
 *   CSS & Style       — getComputedStyle, style property access
 *   Document Globals  — title, hidden, visibilityState, well-known elements
 *   Window Globals    — innerWidth/Height, devicePixelRatio, location
 *   Storage API       — localStorage get/set/remove null-vs-undefined contract
 *   URL & Search      — URL constructor, URLSearchParams.get null contract
 *   JSON              — parse/stringify including the undefined footgun
 *   MutationObserver  — records type, disconnect idempotency
 *   CustomEvent       — detail round-trip
 *   requestAnimationFrame — callback argument type
 */

import { expect, test } from "@playwright/test"

/* eslint-disable @typescript-eslint/no-unnecessary-condition */
/* eslint-disable extension-charter/no-raw-storage */

// ─────────────────────────────────────────────────────────────────────────────
// DOM Core
// ─────────────────────────────────────────────────────────────────────────────

test.describe("DOM Core", () => {
  test("textContent of a connected element is typeof string", async ({
    page,
  }) => {
    await page.setContent(`
      <div id="empty"></div>
      <div id="text">hello</div>
      <span id="nested"><b>bold</b> tail</span>
    `)
    const result = await page.evaluate(() => {
      const ids = ["empty", "text", "nested"]
      return ids.map((id) => {
        const el = document.getElementById(id)!
        return { id, type: typeof el.textContent }
      })
    })
    for (const { id, type } of result) {
      expect(type, `#${id}.textContent should be typeof string`).toBe("string")
    }
  })

  test("textContent of an empty element is '' not null", async ({ page }) => {
    await page.setContent(`<div id="e"></div>`)
    const tc = await page.evaluate(
      () => document.getElementById("e")!.textContent
    )
    expect(tc).toBe("")
    expect(tc).not.toBeNull()
  })

  test("textContent of a newly created (detached) element is ''", async ({
    page,
  }) => {
    const result = await page.evaluate(() => {
      const tags = [
        "div",
        "span",
        "p",
        "button",
        "a",
        "li",
        "section",
        "article",
        // Custom/YT-specific tags extension code queries
        "yt-formatted-string",
        "ytd-channel-name",
      ]
      return tags.map((tag) => ({
        tag,
        type: typeof document.createElement(tag).textContent,
        value: document.createElement(tag).textContent,
      }))
    })
    for (const { tag, type, value } of result) {
      expect(type, `<${tag}>.textContent should be typeof string`).toBe(
        "string"
      )
      expect(value, `<${tag}>.textContent should be '' not null`).toBe("")
    }
  })

  test("innerHTML is always typeof string", async ({ page }) => {
    await page.setContent(`<div id="e"><span>x</span></div>`)
    const result = await page.evaluate(() => ({
      connected: typeof document.getElementById("e")!.innerHTML,
      detached: typeof document.createElement("div").innerHTML,
    }))
    expect(result.connected).toBe("string")
    expect(result.detached).toBe("string")
  })

  test("id, className, tagName are always typeof string", async ({ page }) => {
    await page.setContent(`<div id="d" class="c foo"></div>`)
    const result = await page.evaluate(() => {
      const el = document.getElementById("d")!
      return {
        id: typeof el.id,
        className: typeof el.className,
        tagName: typeof el.tagName,
        tagNameValue: el.tagName,
      }
    })
    expect(result.id).toBe("string")
    expect(result.className).toBe("string")
    expect(result.tagName).toBe("string")
    // HTML always uppercases tagName
    expect(result.tagNameValue).toBe("DIV")
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// DOM Query
// ─────────────────────────────────────────────────────────────────────────────

test.describe("DOM Query", () => {
  test("querySelector returns null for no match (not undefined or throws)", async ({
    page,
  }) => {
    await page.setContent(`<div></div>`)
    const result = await page.evaluate(() => {
      const el = document.querySelector("#nonexistent-xyz")
      return { isNull: el === null, isUndefined: el === undefined }
    })
    expect(result.isNull).toBe(true)
    expect(result.isUndefined).toBe(false)
  })

  test("querySelectorAll always returns a NodeList (never null), safe to iterate with length 0", async ({
    page,
  }) => {
    await page.setContent(`<div></div>`)
    const result = await page.evaluate(() => {
      const nl = document.querySelectorAll(".no-match-ever")
      return {
        isNull: nl === null,
        length: nl.length,
        isIterable: typeof nl[Symbol.iterator] === "function",
      }
    })
    expect(result.isNull).toBe(false)
    expect(result.length).toBe(0)
    expect(result.isIterable).toBe(true)
  })

  test("getElementById returns null for missing id (not undefined)", async ({
    page,
  }) => {
    await page.setContent(`<div id="real"></div>`)
    const result = await page.evaluate(() => {
      const found = document.getElementById("real")
      const missing = document.getElementById("not-here")
      return {
        foundIsElement: found instanceof HTMLElement,
        missingIsNull: missing === null,
        missingIsUndefined: missing === undefined,
      }
    })
    expect(result.foundIsElement).toBe(true)
    expect(result.missingIsNull).toBe(true)
    expect(result.missingIsUndefined).toBe(false)
  })

  test("Array.from(querySelectorAll) is a plain Array", async ({ page }) => {
    await page.setContent(`<p>a</p><p>b</p><p>c</p>`)
    const result = await page.evaluate(() => {
      const arr = Array.from(document.querySelectorAll("p"))
      return { isArray: Array.isArray(arr), length: arr.length }
    })
    expect(result.isArray).toBe(true)
    expect(result.length).toBe(3)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Element Geometry
// ─────────────────────────────────────────────────────────────────────────────

test.describe("Element Geometry", () => {
  test("getBoundingClientRect never returns null", async ({ page }) => {
    await page.setContent(
      `<div id="visible" style="width:100px;height:50px"></div>`
    )
    const result = await page.evaluate(() => {
      const el = document.getElementById("visible")!
      const rect = el.getBoundingClientRect()
      return { isNull: rect === null, isObject: typeof rect === "object" }
    })
    expect(result.isNull).toBe(false)
    expect(result.isObject).toBe(true)
  })

  test("getBoundingClientRect on a detached element returns all-zero DOMRect", async ({
    page,
  }) => {
    const result = await page.evaluate(() => {
      const el = document.createElement("div")
      const rect = el.getBoundingClientRect()
      return {
        top: rect.top,
        left: rect.left,
        width: rect.width,
        height: rect.height,
        allZero:
          rect.top === 0 &&
          rect.left === 0 &&
          rect.width === 0 &&
          rect.height === 0,
      }
    })
    expect(result.allZero).toBe(true)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// CSS & Style
// ─────────────────────────────────────────────────────────────────────────────

test.describe("CSS & Style", () => {
  test("getComputedStyle never returns null", async ({ page }) => {
    await page.setContent(`<div id="el" style="color:red"></div>`)
    const result = await page.evaluate(() => {
      const el = document.getElementById("el")!
      const cs = window.getComputedStyle(el)
      return { isNull: cs === null, hasGetProperty: typeof cs.getPropertyValue }
    })
    expect(result.isNull).toBe(false)
    expect(result.hasGetProperty).toBe("function")
  })

  test("getPropertyValue on an unset CSS property returns '' not null", async ({
    page,
  }) => {
    await page.setContent(`<div id="el"></div>`)
    const result = await page.evaluate(() => {
      const el = document.getElementById("el")!
      const cs = window.getComputedStyle(el)
      const val = cs.getPropertyValue("--nonexistent-custom-prop")
      return { type: typeof val, value: val, isNull: val === null }
    })
    expect(result.type).toBe("string")
    expect(result.isNull).toBe(false)
  })

  test("el.style.setProperty/getPropertyValue round-trips", async ({
    page,
  }) => {
    const result = await page.evaluate(() => {
      const el = document.createElement("div")
      el.style.setProperty("--my-token", "42px")
      return el.style.getPropertyValue("--my-token")
    })
    expect(result).toBe("42px")
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Document Globals
// ─────────────────────────────────────────────────────────────────────────────

test.describe("Document Globals", () => {
  test("document.title is always typeof string", async ({ page }) => {
    const type = await page.evaluate(() => typeof document.title)
    expect(type).toBe("string")
  })

  test("document.hidden is always boolean", async ({ page }) => {
    const type = await page.evaluate(() => typeof document.hidden)
    expect(type).toBe("boolean")
  })

  test("document.visibilityState is exactly 'visible' or 'hidden'", async ({
    page,
  }) => {
    const val = await page.evaluate(() => document.visibilityState)
    expect(["visible", "hidden"]).toContain(val)
  })

  test("document.documentElement, head, body are never null", async ({
    page,
  }) => {
    const result = await page.evaluate(() => ({
      html: document.documentElement !== null,
      head: document.head !== null,
      body: document.body !== null,
    }))
    expect(result.html).toBe(true)
    expect(result.head).toBe(true)
    expect(result.body).toBe(true)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Window Globals
// ─────────────────────────────────────────────────────────────────────────────

test.describe("Window Globals", () => {
  test("innerWidth and innerHeight are positive finite numbers", async ({
    page,
  }) => {
    const result = await page.evaluate(() => ({
      w: window.innerWidth,
      h: window.innerHeight,
      wType: typeof window.innerWidth,
      hType: typeof window.innerHeight,
    }))
    expect(result.wType).toBe("number")
    expect(result.hType).toBe("number")
    expect(Number.isFinite(result.w)).toBe(true)
    expect(Number.isFinite(result.h)).toBe(true)
    expect(result.w).toBeGreaterThan(0)
    expect(result.h).toBeGreaterThan(0)
  })

  test("devicePixelRatio is a positive number", async ({ page }) => {
    const result = await page.evaluate(() => ({
      val: window.devicePixelRatio,
      type: typeof window.devicePixelRatio,
    }))
    expect(result.type).toBe("number")
    expect(result.val).toBeGreaterThan(0)
  })

  test("window.location.href is always typeof string", async ({ page }) => {
    const type = await page.evaluate(() => typeof window.location.href)
    expect(type).toBe("string")
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Storage API
// ─────────────────────────────────────────────────────────────────────────────

test.describe("Storage API", () => {
  // localStorage throws SecurityError on the default about:blank page (opaque
  // origin, no storage partition). Route a fake response so page.goto lands on
  // a real origin without requiring a running server.
  test.beforeEach(async ({ page }) => {
    await page.route("**/*", (route) =>
      route.fulfill({
        body: "<!DOCTYPE html><html></html>",
        contentType: "text/html",
      })
    )
    await page.goto("https://localhost/__browser-invariants__")
  })

  test("localStorage.getItem for a missing key returns null, not undefined", async ({
    page,
  }) => {
    const result = await page.evaluate(() => {
      const val = localStorage.getItem("__invariant_missing_key__")
      return { isNull: val === null, isUndefined: val === undefined }
    })
    expect(result.isNull).toBe(true)
    expect(result.isUndefined).toBe(false)
  })

  test("localStorage.setItem then getItem returns the exact stored string", async ({
    page,
  }) => {
    const stored = await page.evaluate(() => {
      const key = "__invariant_roundtrip__"
      const value = '{"x":1,"y":"hello"}'
      localStorage.setItem(key, value)
      const back = localStorage.getItem(key)
      localStorage.removeItem(key)
      return back
    })
    expect(stored).toBe('{"x":1,"y":"hello"}')
  })

  test("localStorage.getItem after removeItem returns null", async ({
    page,
  }) => {
    const result = await page.evaluate(() => {
      const key = "__invariant_remove__"
      localStorage.setItem(key, "exists")
      localStorage.removeItem(key)
      const val = localStorage.getItem(key)
      return { isNull: val === null }
    })
    expect(result.isNull).toBe(true)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// URL & URLSearchParams
// ─────────────────────────────────────────────────────────────────────────────

test.describe("URL & URLSearchParams", () => {
  test("URL constructor populates hostname as string for valid URL", async ({
    page,
  }) => {
    const result = await page.evaluate(() => {
      const u = new URL("https://music.youtube.com/watch?v=abc")
      return {
        hostname: u.hostname,
        type: typeof u.hostname,
        searchParams: typeof u.searchParams,
      }
    })
    expect(result.hostname).toBe("music.youtube.com")
    expect(result.type).toBe("string")
    expect(result.searchParams).toBe("object")
  })

  test("URL constructor throws on invalid URL (does not return null)", async ({
    page,
  }) => {
    const result = await page.evaluate(() => {
      try {
        new URL("not a valid url")
        return { threw: false }
      } catch {
        return { threw: true }
      }
    })
    expect(result.threw).toBe(true)
  })

  test("URLSearchParams.get returns null for missing key, string for present key", async ({
    page,
  }) => {
    const result = await page.evaluate(() => {
      const p = new URLSearchParams("foo=bar&baz=")
      return {
        found: p.get("foo"),
        foundType: typeof p.get("foo"),
        missing: p.get("nope"),
        missingIsNull: p.get("nope") === null,
        emptyValue: p.get("baz"),
      }
    })
    expect(result.found).toBe("bar")
    expect(result.foundType).toBe("string")
    expect(result.missingIsNull).toBe(true)
    expect(result.emptyValue).toBe("")
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// JSON
// ─────────────────────────────────────────────────────────────────────────────

test.describe("JSON", () => {
  test("JSON.parse throws SyntaxError on invalid input (does not return undefined)", async ({
    page,
  }) => {
    const result = await page.evaluate(() => {
      try {
        JSON.parse("not json {{")
        return { threw: false }
      } catch (e) {
        return {
          threw: true,
          isSyntaxError: e instanceof SyntaxError,
        }
      }
    })
    expect(result.threw).toBe(true)
    expect(result.isSyntaxError).toBe(true)
  })

  test("JSON.stringify of a plain object returns a string", async ({
    page,
  }) => {
    const result = await page.evaluate(() => {
      const s = JSON.stringify({ a: 1, b: "hello", c: [1, 2] })
      return { type: typeof s, value: s }
    })
    expect(result.type).toBe("string")
    expect(result.value).toBe('{"a":1,"b":"hello","c":[1,2]}')
  })

  test("JSON.stringify(undefined) returns the JS value undefined — NOT the string 'undefined'", async ({
    page,
  }) => {
    // This is a well-known JS footgun: JSON.stringify(undefined) === undefined
    // (the JS value), which means it cannot be stored as a localStorage string
    // directly. Extension code that uses JSON.stringify for storage must guard
    // against undefined inputs.
    const result = await page.evaluate(() => {
      const val = JSON.stringify(undefined)
      return {
        isUndefined: val === undefined,
        isStringUndefined: val === "undefined",
        type: typeof val,
      }
    })
    expect(result.isUndefined).toBe(true)
    expect(result.isStringUndefined).toBe(false)
    expect(result.type).toBe("undefined")
  })

  test("JSON.parse(JSON.stringify(obj)) round-trips a plain object", async ({
    page,
  }) => {
    const result = await page.evaluate(() => {
      const obj = { enabled: true, channels: ["ucA", "ucB"], count: 42 }
      // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
      const back = JSON.parse(JSON.stringify(obj)) as typeof obj
      return {
        enabled: back.enabled,
        channels: back.channels,
        count: back.count,
        channelsIsArray: Array.isArray(back.channels),
      }
    })
    expect(result.enabled).toBe(true)
    expect(result.channels).toEqual(["ucA", "ucB"])
    expect(result.count).toBe(42)
    expect(result.channelsIsArray).toBe(true)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// MutationObserver
// ─────────────────────────────────────────────────────────────────────────────

test.describe("MutationObserver", () => {
  test("callback always receives a non-null Array of MutationRecords", async ({
    page,
  }) => {
    const result = await page.evaluate(
      () =>
        new Promise<{
          isArray: boolean
          length: number
          recordType: string
        }>((resolve) => {
          const div = document.createElement("div")
          document.body.appendChild(div)

          const observer = new MutationObserver((records) => {
            observer.disconnect()
            div.remove()
            resolve({
              isArray: Array.isArray(records),
              length: records.length,
              recordType: records[0] ? typeof records[0] : "none",
            })
          })
          observer.observe(div, { attributes: true })
          div.setAttribute("data-test", "mutated")
        })
    )
    expect(result.isArray).toBe(true)
    expect(result.length).toBeGreaterThan(0)
    expect(result.recordType).toBe("object")
  })

  test("observer.disconnect() is idempotent — calling it multiple times does not throw", async ({
    page,
  }) => {
    const result = await page.evaluate(() => {
      const div = document.createElement("div")
      const observer = new MutationObserver(() => {})
      observer.observe(div, { attributes: true })
      let threw = false
      try {
        observer.disconnect()
        observer.disconnect()
        observer.disconnect()
      } catch {
        threw = true
      }
      return { threw }
    })
    expect(result.threw).toBe(false)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// CustomEvent detail round-trip
// ─────────────────────────────────────────────────────────────────────────────

test.describe("CustomEvent", () => {
  test("event.detail round-trips an object exactly", async ({ page }) => {
    const result = await page.evaluate(
      () =>
        new Promise<{ payload: unknown }>((resolve) => {
          const payload = { tick: 42, phase: "running", entries: ["a", "b"] }

          document.addEventListener(
            "__invariant_custom_event__",
            (e: Event) => {
              // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
              resolve({ payload: (e as CustomEvent).detail })
            },
            { once: true }
          )

          document.dispatchEvent(
            new CustomEvent("__invariant_custom_event__", { detail: payload })
          )
        })
    )
    expect(result.payload).toEqual({
      tick: 42,
      phase: "running",
      entries: ["a", "b"],
    })
  })

  test("JSON.parse(event.detail) pattern — detail as serialised string round-trips", async ({
    page,
  }) => {
    // This is the exact pattern used in some-censor/fixture.ts addInitScript:
    //   document.addEventListener("__boyo_debug_update__", (e) => {
    //     window.__BOYO_DEBUG__ = JSON.parse(e.detail)
    //   })
    const result = await page.evaluate(() => {
      let parsed: unknown = null

      document.addEventListener(
        "__invariant_json_detail__",
        (e: Event) => {
          // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
          parsed = JSON.parse((e as CustomEvent<string>).detail)
        },
        { once: true }
      )

      const data = { score: 99, label: "ok" }
      document.dispatchEvent(
        new CustomEvent("__invariant_json_detail__", {
          detail: JSON.stringify(data),
        })
      )

      return parsed
    })
    expect(result).toEqual({ score: 99, label: "ok" })
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// requestAnimationFrame
// ─────────────────────────────────────────────────────────────────────────────

test.describe("requestAnimationFrame", () => {
  test("rAF callback receives a DOMHighResTimeStamp (positive finite number)", async ({
    page,
  }) => {
    const result = await page.evaluate(
      () =>
        new Promise<{ type: string; isFinite: boolean; isPositive: boolean }>(
          (resolve) => {
            requestAnimationFrame((ts) => {
              resolve({
                type: typeof ts,
                isFinite: Number.isFinite(ts),
                isPositive: ts > 0,
              })
            })
          }
        )
    )
    expect(result.type).toBe("number")
    expect(result.isFinite).toBe(true)
    expect(result.isPositive).toBe(true)
  })
})
