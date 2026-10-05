/**
 * Lint-time integration tests for the extension configs, via lintSnippet()
 * (these rules are syntactic: no TypeScript language service needed).
 */

import {
  extensionCharterPlugin,
  default as extensionsCharterConfig,
} from "@eslint/configs/extensions-charter.config.js"
import extensionsSecurityConfig from "@eslint/configs/extensions-security.config.js"
import type { Linter } from "eslint"
import { defineConfig } from "eslint/config"
import { describe, it } from "vitest"

import type { SnippetCase } from "./helpers/eslint-resolver.js"
import {
  expectMessageForRule,
  expectNoMessageForRule,
  expectSnippet,
  lintSnippet,
} from "./helpers/eslint-resolver.js"

const TS_FILE = "src/content.ts"

const SYNTAX = "no-restricted-syntax"

// ── extensions-security.config (#322) ─────────────────────────────────────

describe("lint: extension-security", () => {
  it.each<SnippetCase>([
    ["no-eval fires on eval()", `eval("code")`, "no-eval", true],
    ["no-eval does NOT fire for normal code", `const x = 1`, "no-eval", false],
    [
      "no-new-func fires on new Function(string)",
      `const fn = new Function("return 1")`,
      "no-new-func",
      true,
    ],
    [
      "no-new-func does NOT fire for regular class instantiation",
      `class Foo {} const f = new Foo()`,
      "no-new-func",
      false,
    ],
    [
      "no-implied-eval fires on setTimeout(string, delay)",
      `setTimeout("alert(1)", 100)`,
      "no-implied-eval",
      true,
    ],
    [
      "no-implied-eval does NOT fire for setTimeout(fn, delay)",
      `setTimeout(() => { }, 100)`,
      "no-implied-eval",
      false,
    ],
    [
      "fires on document.write()",
      `document.write("<h1>hi</h1>")`,
      "no-restricted-properties",
      true,
    ],
    [
      "does NOT fire for document.getElementById()",
      `document.getElementById("root")`,
      "no-restricted-properties",
      false,
    ],
    [
      "warns on chrome.tabs.query() (prefer browser.*)",
      `chrome.tabs.query({}, () => {})`,
      "no-restricted-globals",
      true,
    ],
    [
      "does NOT warn on browser.tabs.query()",
      `browser.tabs.query({}, () => {})`,
      "no-restricted-globals",
      false,
    ],
    [
      "fires on an http:// string literal",
      `const url = "http://example.com"`,
      SYNTAX,
      true,
    ],
    [
      "does NOT fire for https:// URLs",
      `const url = "https://example.com"`,
      SYNTAX,
      false,
    ],
    [
      "fires on chrome.tabs.discard(tabId, callback): Firefox throws on the callback form",
      `chrome.tabs.discard(1, () => {})`,
      SYNTAX,
      true,
    ],
    [
      "does NOT fire on chrome.tabs.discard(tabId), the cross-browser Promise form",
      `chrome.tabs.discard(1)`,
      SYNTAX,
      false,
    ],
    [
      "does NOT fire on unrelated chrome.tabs.* calls with 2 arguments",
      `chrome.tabs.get(1, () => {})`,
      SYNTAX,
      false,
    ],
    [
      "fires on import() from a remote URL",
      `const mod = import("https://cdn.example.com/lib.js")`,
      SYNTAX,
      true,
    ],
    [
      "does NOT fire for local relative imports",
      `const mod = import("./lib.js")`,
      SYNTAX,
      false,
    ],
    // parentRelativeDynamicImportSelectors, restated from react.config.ts:
    // this config's no-restricted-syntax replaces that one in extensions.
    [
      "fires on a parent-relative dynamic import",
      `const mod = import("../lib/foo.js")`,
      SYNTAX,
      true,
    ],
    [
      "does NOT fire on a sibling dynamic import",
      `const mod = import("./lib/foo.js")`,
      SYNTAX,
      false,
    ],
    [
      "fires on a parent-relative dynamic import written as a template literal",
      "const mod = import(`../lib/foo.js`)",
      SYNTAX,
      true,
    ],
    [
      "fires on a parent-relative template literal with interpolation",
      "const mod = import(`../lib/${name}.js`)",
      SYNTAX,
      true,
    ],
    [
      "does NOT fire on a sibling dynamic import written as a template literal",
      "const mod = import(`./lib/${name}.js`)",
      SYNTAX,
      false,
    ],
  ])("%s", (title, code, rule, fires) =>
    expectSnippet(extensionsSecurityConfig, code, TS_FILE, rule, fires, title)
  )
})

// ── extension-charter (#285-#288) ─────────────────────────────────────────

function charterConfig(
  rule: string,
  entry: Linter.RuleEntry = "error"
): Array<Linter.Config> {
  return defineConfig([
    {
      files: ["**/*.{js,ts}"],
      plugins: { "extension-charter": extensionCharterPlugin },
      rules: { [`extension-charter/${rule}`]: entry },
    },
  ])
}

const NAMESPACE = "extension-charter/no-unprefixed-namespace"
const boyoNamespace = (allowlist: Array<string> = []): Array<Linter.Config> =>
  charterConfig("no-unprefixed-namespace", [
    "error",
    { prefix: "boyo-", allowlist },
  ])

describe("lint: charter — no-unprefixed-namespace", () => {
  it.each<[string, Array<Linter.Config>, string, boolean]>([
    [
      "fires when classList.add uses an unprefixed class",
      boyoNamespace(),
      `el.classList.add("tab-row")`,
      true,
    ],
    [
      "does NOT fire when classList.add uses the workspace prefix",
      boyoNamespace(),
      `el.classList.add("boyo-tab-row")`,
      false,
    ],
    [
      "does NOT fire for allowlisted vendor class names",
      boyoNamespace(["yt-page-container"]),
      `el.classList.contains("yt-page-container")`,
      false,
    ],
    [
      "fires when setAttribute uses an unprefixed data-* name",
      boyoNamespace(),
      `el.setAttribute("data-dragging", "true")`,
      true,
    ],
    [
      "does NOT fire for a correctly prefixed data-* attribute",
      boyoNamespace(),
      `el.setAttribute("data-boyo-dragging", "true")`,
      false,
    ],
    [
      "fires on an unprefixed CustomEvent name",
      boyoNamespace(),
      `el.dispatchEvent(new CustomEvent("toggle"))`,
      true,
    ],
    [
      "does NOT fire for a prefixed CustomEvent name",
      boyoNamespace(),
      `el.dispatchEvent(new CustomEvent("boyo-toggle"))`,
      false,
    ],
  ])("%s", (title, config, code, fires) =>
    expectSnippet(config, code, TS_FILE, NAMESPACE, fires, title)
  )
})

describe("lint: charter — no-zindex-escalation and no-raw-storage", () => {
  const ZINDEX = "extension-charter/no-zindex-escalation"
  const STORAGE = "extension-charter/no-raw-storage"
  it.each<SnippetCase>([
    [
      "fires when zIndex object property equals INT_MAX",
      `const s = { zIndex: 2147483647 }`,
      ZINDEX,
      true,
    ],
    [
      "fires when style.zIndex assignment is a high string literal",
      `el.style.zIndex = "2147483647"`,
      ZINDEX,
      true,
    ],
    [
      "does NOT fire when zIndex is below the threshold (conveyor policy)",
      `const s = { zIndex: 2147483640 }`,
      ZINDEX,
      false,
    ],
    [
      "does NOT fire for low z-index values",
      `const s = { zIndex: 100 }`,
      ZINDEX,
      false,
    ],
    [
      "fires on localStorage access",
      `localStorage.setItem("key", "val")`,
      STORAGE,
      true,
    ],
    [
      "fires on sessionStorage access",
      `sessionStorage.getItem("key")`,
      STORAGE,
      true,
    ],
    [
      "does NOT fire when using browser.storage.local",
      `browser.storage.local.set({ "boyo.key": "val" })`,
      STORAGE,
      false,
    ],
  ])("%s", (title, code, rule, fires) =>
    expectSnippet(extensionsCharterConfig, code, TS_FILE, rule, fires, title)
  )

  it("no-raw-storage does NOT fire when localStorage is in the allowlist", () =>
    expectSnippet(
      charterConfig("no-raw-storage", [
        "error",
        { allowlist: ["localStorage"] },
      ]),
      `localStorage.getItem("k")`,
      TS_FILE,
      STORAGE,
      false,
      "localStorage in allowlist"
    ))
})

describe("lint: charter — no-logic-layer-side-effects", () => {
  it.each<[string, string, boolean]>([
    [
      "fires when logic code references document",
      `const el = document.getElementById("root")`,
      true,
    ],
    [
      "fires when logic code references browser API",
      `browser.tabs.query({}, () => {})`,
      true,
    ],
    [
      "fires when logic code references chrome API",
      `chrome.runtime.sendMessage({})`,
      true,
    ],
    [
      "does NOT fire for pure logic (no DOM/browser references)",
      `function add(a, b) { return a + b }`,
      false,
    ],
  ])("%s", (title, code, fires) =>
    expectSnippet(
      charterConfig("no-logic-layer-side-effects"),
      code,
      TS_FILE,
      "extension-charter/no-logic-layer-side-effects",
      fires,
      title
    )
  )
})

// ── §5/§8 — standing resources name their lifetime ────────────────────────

describe("lint: extension-charter — require-named-lifetime", () => {
  const RULE = "extension-charter/require-named-lifetime"

  it("fires on setInterval and window.setInterval", async () => {
    for (const code of [
      `setInterval(() => {}, 1000)`,
      `window.setInterval(() => {}, 1000)`,
    ]) {
      const msgs = await lintSnippet(extensionsCharterConfig, code, TS_FILE)
      expectMessageForRule(msgs, RULE, code)
    }
  })

  it("does NOT fire on a one-shot setTimeout", async () => {
    const msgs = await lintSnippet(
      extensionsCharterConfig,
      `setTimeout(() => {}, 80)`,
      TS_FILE
    )
    expectNoMessageForRule(msgs, RULE, "setTimeout")
  })
})

describe("lint: extension-charter — require-scoped-lifetime", () => {
  const RULE = "extension-charter/require-scoped-lifetime"

  // These snippets are parsed as JavaScript. One that doesn't parse runs no
  // rule, so "does NOT fire" would pass having checked nothing.
  const expectQuiet = (
    msgs: Array<{ fatal?: boolean }>,
    code: string
  ): void => {
    if (msgs.some((m) => m.fatal === true)) {
      throw new Error(`snippet did not parse: ${code}`)
    }
  }

  it("is a warning in the shared config — an audit, not a gate", async () => {
    const msgs = await lintSnippet(
      extensionsCharterConfig,
      `document.addEventListener("pointermove", () => {})`,
      TS_FILE
    )
    const hit = msgs.find((m) => m.ruleId === RULE)
    if (hit?.severity !== 1) {
      throw new Error(`expected a warning, got ${String(hit?.severity)}`)
    }
  })

  it("fires on page-lifetime listeners with no lifetime attached", async () => {
    for (const code of [
      `document.addEventListener("pointermove", () => {})`,
      `window.addEventListener("resize", onResize)`,
      `document.body.addEventListener("click", f, true)`,
      `document.addEventListener("x", f, { capture: true, passive: true })`,
      `const OPTS = { passive: true }; document.addEventListener("x", f, OPTS)`,
      `document.addEventListener("x", f, { once: false })`,
      // A bare call is window's: the global object's own method.
      `addEventListener("resize", onResize)`,
      // A signal that may be undefined scopes nothing.
      `document.addEventListener("x", f, { signal: controller?.signal })`,
      `document.addEventListener("x", f, { signal: undefined })`,
      `window.addEventListener("x", f, { signal: on ? ac.signal : undefined })`,
      // Signals are read by allowlist; any other spelling is not one.
      `document.addEventListener("x", f, { signal: void 0 })`,
      `document.addEventListener("x", f, { signal: (0, undefined) })`,
      `document.addEventListener("x", f, { signal: \`\${ac.signal}\` })`,
      // \`const\` fixes the binding, not the object: anything that could
      // rewrite the options leaves them unresolved.
      `const OPTS = { once: true }; OPTS.once = false; document.addEventListener("x", f, OPTS)`,
      `const OPTS = { signal }; Object.assign(OPTS, { signal: undefined }); document.addEventListener("x", f, OPTS)`,
      `const OPTS = { once: true }; tweak(OPTS); window.addEventListener("x", f, OPTS)`,
      // Built in order, last write wins: a later spread, computed key or
      // repeated key can undo the lifetime an earlier property gave.
      `const OPTS = { once: true, ...{ once: false } }; document.addEventListener("x", f, OPTS)`,
      `document.addEventListener("x", f, { signal, ...extra })`,
      `document.addEventListener("x", f, { once: true, [key]: false })`,
      `document.addEventListener("x", f, { once: true, once: false })`,
    ]) {
      const msgs = await lintSnippet(extensionsCharterConfig, code, TS_FILE)
      expectMessageForRule(msgs, RULE, code)
    }
  })

  it("does NOT fire when the listener carries a signal or once", async () => {
    for (const code of [
      `document.addEventListener("x", f, { signal: ac.signal })`,
      `window.addEventListener("x", f, { capture: true, signal })`,
      `document.addEventListener("x", f, { once: true })`,
      `const OPTS = { signal: life.signal }; document.addEventListener("x", f, OPTS)`,
      `addEventListener("resize", f, { signal })`,
      // The same binding passed to both halves of a listener pair.
      `const OPTS = { once: true }; document.addEventListener("x", f, OPTS); document.removeEventListener("x", f, OPTS)`,
      // A spread before the scoping property is overwritten by it.
      `document.addEventListener("x", f, { ...base, signal: life.signal })`,
      `document.addEventListener("x", f, { signal, once: false })`,
      `document.addEventListener("x", f, { signal: AbortSignal.timeout(5000) })`,
      `document.addEventListener("x", f, { signal: this.life.signal })`,
    ]) {
      const msgs = await lintSnippet(extensionsCharterConfig, code, TS_FILE)
      expectQuiet(msgs, code)
      expectNoMessageForRule(msgs, RULE, code)
    }
  })

  it("does NOT fire on an element's own listener — it goes with the element", async () => {
    const msgs = await lintSnippet(
      extensionsCharterConfig,
      `button.addEventListener("click", f)`,
      TS_FILE
    )
    expectQuiet(msgs, "element listener")
    expectNoMessageForRule(msgs, RULE, "element listener")
  })

  it("does NOT fire on a bare call to a local function of that name", async () => {
    const code = `function addEventListener(type, f) { bus.on(type, f) }
addEventListener("x", f)`
    const msgs = await lintSnippet(extensionsCharterConfig, code, TS_FILE)
    expectQuiet(msgs, code)
    expectNoMessageForRule(msgs, RULE, code)
  })

  it("does NOT fire on a local binding that shadows a page-lifetime name", async () => {
    for (const code of [
      `function watch(document) { document.addEventListener("click", f) }`,
      `const window = frame.contentWindow; window.addEventListener("x", f)`,
      `function mount(document) { document.body.addEventListener("x", f) }`,
    ]) {
      const msgs = await lintSnippet(extensionsCharterConfig, code, TS_FILE)
      expectQuiet(msgs, code)
      expectNoMessageForRule(msgs, RULE, code)
    }
  })

  it("fires on a requestAnimationFrame callback that reschedules itself", async () => {
    for (const code of [
      `const track = () => { update(); requestAnimationFrame(track) }; track()`,
      `function tick() { draw(); window.requestAnimationFrame(tick) }`,
      `class A { tick = () => { requestAnimationFrame(this.tick) } }`,
      `class B { loop() { requestAnimationFrame(this.loop) } }`,
      // Rescheduled through an inline wrapper, not by name.
      `const tick = () => requestAnimationFrame(() => tick())`,
      `function step(t) { draw(t); requestAnimationFrame((n) => { step(n) }) }`,
      `class C { frame(t) { requestAnimationFrame((n) => this.frame(n)) } }`,
      // Rescheduled through a bound copy of itself.
      `function tick() { requestAnimationFrame(tick.bind(null)) }`,
      `class D { tick() { requestAnimationFrame(this.tick.bind(this)) } }`,
    ]) {
      const msgs = await lintSnippet(extensionsCharterConfig, code, TS_FILE)
      expectMessageForRule(msgs, RULE, code)
    }
  })

  it("does NOT fire on a one-shot requestAnimationFrame", async () => {
    for (const code of [
      `requestAnimationFrame(() => el.classList.add("in"))`,
      `const show = () => el.classList.add("in"); requestAnimationFrame(show)`,
      // An inline callback that calls some other function is still one-shot.
      `function open() { requestAnimationFrame(() => reveal()) }`,
      // A call inside a function the callback only defines is not a call.
      `function open() { requestAnimationFrame(() => { const later = () => open() }) }`,
    ]) {
      const msgs = await lintSnippet(extensionsCharterConfig, code, TS_FILE)
      expectQuiet(msgs, code)
      expectNoMessageForRule(msgs, RULE, code)
    }
  })
})
