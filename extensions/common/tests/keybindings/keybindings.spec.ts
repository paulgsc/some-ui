/**
 * Keybinding/command typestate unit tests.
 *
 * Functions are injected into the page via eval with explicit globalThis
 * assignments so they survive strict-mode eval scoping.
 */

import { modifiersMatch } from "@common/lib/keybindings/index"
import { expect, test } from "@playwright/test"

// Functions are assigned to globalThis so they survive strict-mode eval. Use
// the production matcher's source rather than maintaining a test-only copy.
const INLINE_KEYBINDINGS = `
  globalThis.modifiersMatch = ${modifiersMatch.toString()};

  globalThis.isInputContext = function isInputContext(target) {
    if (!(target instanceof HTMLElement)) return false;
    const tag = target.tagName;
    if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
    return target.isContentEditable;
  };

  globalThis.attachKeyBindings = function attachKeyBindings(registry, bindings) {
    const ac = new AbortController();
    document.addEventListener("keydown", function(e) {
      if (globalThis.isInputContext(e.target)) return;
      for (const binding of bindings) {
        if (e.code !== binding.code) continue;
        if (!globalThis.modifiersMatch(e, binding.modifiers)) continue;
        e.preventDefault();
        if (registry[binding.command]) registry[binding.command]();
        return;
      }
    }, { capture: true, signal: ac.signal });
    return function() { ac.abort(); };
  };
`

// ─────────────────────────────────────────────────────────────────────────────
// modifiersMatch — platform-normalized modifier matching
// ─────────────────────────────────────────────────────────────────────────────

test.describe("modifiersMatch", () => {
  test("matches exact ctrl+shift on non-Mac", async ({ page }) => {
    const result = await page.evaluate((inline) => {
      eval(inline) // eslint-disable-line no-eval
      // eslint-disable-next-line @typescript-eslint/consistent-type-assertions, @typescript-eslint/no-explicit-any
      const fn = (window as any)["modifiersMatch"] as (
        e: KeyboardEvent,
        m: object,
        isMac?: boolean
      ) => boolean
      const e = new KeyboardEvent("keydown", {
        ctrlKey: true,
        shiftKey: true,
        altKey: false,
        metaKey: false,
      })
      return fn(e, { ctrl: true, alt: false, shift: true, meta: false }, false)
    }, INLINE_KEYBINDINGS)
    expect(result).toBe(true)
  })

  test("does not match when ctrl is missing on non-Mac", async ({ page }) => {
    const result = await page.evaluate((inline) => {
      eval(inline) // eslint-disable-line no-eval
      // eslint-disable-next-line @typescript-eslint/consistent-type-assertions, @typescript-eslint/no-explicit-any
      const fn = (window as any)["modifiersMatch"] as (
        e: KeyboardEvent,
        m: object,
        isMac?: boolean
      ) => boolean
      const e = new KeyboardEvent("keydown", {
        ctrlKey: false,
        shiftKey: true,
        altKey: false,
        metaKey: false,
      })
      return fn(e, { ctrl: true, alt: false, shift: true, meta: false }, false)
    }, INLINE_KEYBINDINGS)
    expect(result).toBe(false)
  })

  test("macOS: metaKey maps to the ctrl slot", async ({ page }) => {
    const result = await page.evaluate((inline) => {
      eval(inline) // eslint-disable-line no-eval
      // eslint-disable-next-line @typescript-eslint/consistent-type-assertions, @typescript-eslint/no-explicit-any
      const fn = (window as any)["modifiersMatch"] as (
        e: KeyboardEvent,
        m: object,
        isMac?: boolean
      ) => boolean
      const e = new KeyboardEvent("keydown", {
        metaKey: true,
        shiftKey: true,
        altKey: false,
        ctrlKey: false,
      })
      return fn(e, { ctrl: true, alt: false, shift: true, meta: false }, true)
    }, INLINE_KEYBINDINGS)
    expect(result).toBe(true)
  })

  test("macOS: ctrlKey does NOT fill the ctrl slot", async ({ page }) => {
    const result = await page.evaluate((inline) => {
      eval(inline) // eslint-disable-line no-eval
      // eslint-disable-next-line @typescript-eslint/consistent-type-assertions, @typescript-eslint/no-explicit-any
      const fn = (window as any)["modifiersMatch"] as (
        e: KeyboardEvent,
        m: object,
        isMac?: boolean
      ) => boolean
      const e = new KeyboardEvent("keydown", {
        ctrlKey: true,
        metaKey: false,
        shiftKey: true,
        altKey: false,
      })
      return fn(e, { ctrl: true, alt: false, shift: true, meta: false }, true)
    }, INLINE_KEYBINDINGS)
    expect(result).toBe(false)
  })

  test("non-Mac: metaKey does NOT fill the ctrl slot", async ({ page }) => {
    const result = await page.evaluate((inline) => {
      eval(inline) // eslint-disable-line no-eval
      // eslint-disable-next-line @typescript-eslint/consistent-type-assertions, @typescript-eslint/no-explicit-any
      const fn = (window as any)["modifiersMatch"] as (
        e: KeyboardEvent,
        m: object,
        isMac?: boolean
      ) => boolean
      const e = new KeyboardEvent("keydown", {
        metaKey: true,
        ctrlKey: false,
        shiftKey: false,
        altKey: false,
      })
      return fn(e, { ctrl: true, alt: false, shift: false, meta: false }, false)
    }, INLINE_KEYBINDINGS)
    expect(result).toBe(false)
  })

  test("non-Mac: rejects an unexpected meta modifier", async ({ page }) => {
    const result = await page.evaluate((inline) => {
      eval(inline) // eslint-disable-line no-eval
      // eslint-disable-next-line @typescript-eslint/consistent-type-assertions, @typescript-eslint/no-explicit-any
      const fn = (window as any)["modifiersMatch"] as (
        e: KeyboardEvent,
        m: object,
        isMac?: boolean
      ) => boolean
      const e = new KeyboardEvent("keydown", {
        metaKey: true,
        ctrlKey: true,
        shiftKey: false,
        altKey: false,
      })
      return fn(e, { ctrl: true, alt: false, shift: false, meta: false }, false)
    }, INLINE_KEYBINDINGS)
    expect(result).toBe(false)
  })

  test("macOS: rejects an unexpected physical ctrl modifier", async ({
    page,
  }) => {
    const result = await page.evaluate((inline) => {
      eval(inline) // eslint-disable-line no-eval
      // eslint-disable-next-line @typescript-eslint/consistent-type-assertions, @typescript-eslint/no-explicit-any
      const fn = (window as any)["modifiersMatch"] as (
        e: KeyboardEvent,
        m: object,
        isMac?: boolean
      ) => boolean
      const e = new KeyboardEvent("keydown", {
        metaKey: true,
        ctrlKey: true,
        shiftKey: false,
        altKey: false,
      })
      return fn(e, { ctrl: true, alt: false, shift: false, meta: false }, true)
    }, INLINE_KEYBINDINGS)
    expect(result).toBe(false)
  })

  test("no-modifier binding matches event with no modifiers held", async ({
    page,
  }) => {
    const result = await page.evaluate((inline) => {
      eval(inline) // eslint-disable-line no-eval
      // eslint-disable-next-line @typescript-eslint/consistent-type-assertions, @typescript-eslint/no-explicit-any
      const fn = (window as any)["modifiersMatch"] as (
        e: KeyboardEvent,
        m: object,
        isMac?: boolean
      ) => boolean
      const e = new KeyboardEvent("keydown", {
        ctrlKey: false,
        metaKey: false,
        shiftKey: false,
        altKey: false,
      })
      return fn(
        e,
        { ctrl: false, alt: false, shift: false, meta: false },
        false
      )
    }, INLINE_KEYBINDINGS)
    expect(result).toBe(true)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// isInputContext — input suppression guard
// ─────────────────────────────────────────────────────────────────────────────

test.describe("isInputContext", () => {
  test("returns true for INPUT element", async ({ page }) => {
    await page.setContent(`<input id="el" />`)
    const result = await page.evaluate((inline) => {
      eval(inline) // eslint-disable-line no-eval
      // eslint-disable-next-line @typescript-eslint/consistent-type-assertions, @typescript-eslint/no-explicit-any
      const fn = (window as any)["isInputContext"] as (
        t: EventTarget | null
      ) => boolean
      return fn(document.getElementById("el"))
    }, INLINE_KEYBINDINGS)
    expect(result).toBe(true)
  })

  test("returns true for TEXTAREA element", async ({ page }) => {
    await page.setContent(`<textarea id="el"></textarea>`)
    const result = await page.evaluate((inline) => {
      eval(inline) // eslint-disable-line no-eval
      // eslint-disable-next-line @typescript-eslint/consistent-type-assertions, @typescript-eslint/no-explicit-any
      const fn = (window as any)["isInputContext"] as (
        t: EventTarget | null
      ) => boolean
      return fn(document.getElementById("el"))
    }, INLINE_KEYBINDINGS)
    expect(result).toBe(true)
  })

  test("returns true for SELECT element", async ({ page }) => {
    await page.setContent(`<select id="el"><option>x</option></select>`)
    const result = await page.evaluate((inline) => {
      eval(inline) // eslint-disable-line no-eval
      // eslint-disable-next-line @typescript-eslint/consistent-type-assertions, @typescript-eslint/no-explicit-any
      const fn = (window as any)["isInputContext"] as (
        t: EventTarget | null
      ) => boolean
      return fn(document.getElementById("el"))
    }, INLINE_KEYBINDINGS)
    expect(result).toBe(true)
  })

  test("returns true for contentEditable element", async ({ page }) => {
    await page.setContent(`<div id="el" contenteditable="true"></div>`)
    const result = await page.evaluate((inline) => {
      eval(inline) // eslint-disable-line no-eval
      // eslint-disable-next-line @typescript-eslint/consistent-type-assertions, @typescript-eslint/no-explicit-any
      const fn = (window as any)["isInputContext"] as (
        t: EventTarget | null
      ) => boolean
      return fn(document.getElementById("el"))
    }, INLINE_KEYBINDINGS)
    expect(result).toBe(true)
  })

  test("returns false for a plain DIV", async ({ page }) => {
    await page.setContent(`<div id="el"></div>`)
    const result = await page.evaluate((inline) => {
      eval(inline) // eslint-disable-line no-eval
      // eslint-disable-next-line @typescript-eslint/consistent-type-assertions, @typescript-eslint/no-explicit-any
      const fn = (window as any)["isInputContext"] as (
        t: EventTarget | null
      ) => boolean
      return fn(document.getElementById("el"))
    }, INLINE_KEYBINDINGS)
    expect(result).toBe(false)
  })

  test("returns false for null target", async ({ page }) => {
    const result = await page.evaluate((inline) => {
      eval(inline) // eslint-disable-line no-eval
      // eslint-disable-next-line @typescript-eslint/consistent-type-assertions, @typescript-eslint/no-explicit-any
      const fn = (window as any)["isInputContext"] as (
        t: EventTarget | null
      ) => boolean
      return fn(null)
    }, INLINE_KEYBINDINGS)
    expect(result).toBe(false)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// attachKeyBindings — full dispatch + disposer
// ─────────────────────────────────────────────────────────────────────────────

test.describe("attachKeyBindings", () => {
  test("fires the correct command when code + modifiers match", async ({
    page,
  }) => {
    await page.setContent(`<body></body>`)
    const fired = await page.evaluate((inline) => {
      eval(inline) // eslint-disable-line no-eval
      // eslint-disable-next-line @typescript-eslint/consistent-type-assertions, @typescript-eslint/no-explicit-any
      const attach = (window as any)["attachKeyBindings"] as (
        r: Record<string, () => void>,
        b: Array<unknown>
      ) => () => void
      const called: Array<string> = []
      attach(
        {
          toggle: () => {
            called.push("toggle")
          },
        },
        [
          {
            code: "KeyT",
            modifiers: { ctrl: true, alt: false, shift: false, meta: false },
            command: "toggle",
          },
        ]
      )
      document.dispatchEvent(
        new KeyboardEvent("keydown", {
          code: "KeyT",
          ctrlKey: true,
          shiftKey: false,
          altKey: false,
          metaKey: false,
          bubbles: true,
        })
      )
      return called
    }, INLINE_KEYBINDINGS)
    expect(fired).toEqual(["toggle"])
  })

  test("does not fire when code matches but modifiers do not", async ({
    page,
  }) => {
    await page.setContent(`<body></body>`)
    const fired = await page.evaluate((inline) => {
      eval(inline) // eslint-disable-line no-eval
      // eslint-disable-next-line @typescript-eslint/consistent-type-assertions, @typescript-eslint/no-explicit-any
      const attach = (window as any)["attachKeyBindings"] as (
        r: Record<string, () => void>,
        b: Array<unknown>
      ) => () => void
      const called: Array<string> = []
      attach(
        {
          toggle: () => {
            called.push("toggle")
          },
        },
        [
          {
            code: "KeyT",
            modifiers: { ctrl: true, alt: false, shift: false, meta: false },
            command: "toggle",
          },
        ]
      )
      document.dispatchEvent(
        new KeyboardEvent("keydown", {
          code: "KeyT",
          ctrlKey: false,
          bubbles: true,
        })
      )
      return called
    }, INLINE_KEYBINDINGS)
    expect(fired).toEqual([])
  })

  test("suppresses events dispatched from input context", async ({ page }) => {
    await page.setContent(`<input id="inp" />`)
    const fired = await page.evaluate((inline) => {
      eval(inline) // eslint-disable-line no-eval
      // eslint-disable-next-line @typescript-eslint/consistent-type-assertions, @typescript-eslint/no-explicit-any
      const attach = (window as any)["attachKeyBindings"] as (
        r: Record<string, () => void>,
        b: Array<unknown>
      ) => () => void
      const called: Array<string> = []
      attach(
        {
          toggle: () => {
            called.push("toggle")
          },
        },
        [
          {
            code: "KeyT",
            modifiers: { ctrl: false, alt: false, shift: false, meta: false },
            command: "toggle",
          },
        ]
      )
      const inp = document.getElementById("inp")!
      inp.dispatchEvent(
        new KeyboardEvent("keydown", { code: "KeyT", bubbles: true })
      )
      return called
    }, INLINE_KEYBINDINGS)
    expect(fired).toEqual([])
  })

  test("disposer detaches the listener — no events fire after disposal", async ({
    page,
  }) => {
    await page.setContent(`<body></body>`)
    const result = await page.evaluate((inline) => {
      eval(inline) // eslint-disable-line no-eval
      // eslint-disable-next-line @typescript-eslint/consistent-type-assertions, @typescript-eslint/no-explicit-any
      const attach = (window as any)["attachKeyBindings"] as (
        r: Record<string, () => void>,
        b: Array<unknown>
      ) => () => void
      const called: Array<string> = []
      const dispose = attach(
        {
          toggle: () => {
            called.push("toggle")
          },
        },
        [
          {
            code: "KeyT",
            modifiers: { ctrl: false, alt: false, shift: false, meta: false },
            command: "toggle",
          },
        ]
      )
      document.dispatchEvent(
        new KeyboardEvent("keydown", { code: "KeyT", bubbles: true })
      )
      dispose()
      document.dispatchEvent(
        new KeyboardEvent("keydown", { code: "KeyT", bubbles: true })
      )
      document.dispatchEvent(
        new KeyboardEvent("keydown", { code: "KeyT", bubbles: true })
      )
      return called
    }, INLINE_KEYBINDINGS)
    expect(result).toEqual(["toggle"])
  })

  test("disposer is idempotent — calling it multiple times does not throw", async ({
    page,
  }) => {
    const threw = await page.evaluate((inline) => {
      eval(inline) // eslint-disable-line no-eval
      // eslint-disable-next-line @typescript-eslint/consistent-type-assertions, @typescript-eslint/no-explicit-any
      const attach = (window as any)["attachKeyBindings"] as (
        r: Record<string, () => void>,
        b: Array<unknown>
      ) => () => void
      const dispose = attach({}, [])
      try {
        dispose()
        dispose()
        dispose()
        return false
      } catch {
        return true
      }
    }, INLINE_KEYBINDINGS)
    expect(threw).toBe(false)
  })
})
