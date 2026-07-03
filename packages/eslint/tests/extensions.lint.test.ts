/**
 * LAYER 2 — Lint-time integration tests for extension-specific configs.
 *
 * Uses lintSnippet() (lintText() under the hood) because these rules are
 * purely syntactic — no TypeScript language service required.
 *
 * Rules under test:
 *   #322 — extensions-security.config  (no-eval, no-new-func, no-implied-eval,
 *           no-restricted-properties, no-restricted-globals, no-restricted-syntax)
 *   #285 — extension-charter/no-unprefixed-namespace
 *   #286 — extension-charter/no-zindex-escalation
 *   #287 — extension-charter/no-logic-layer-side-effects
 *   #288 — extension-charter/no-raw-storage
 */

import { defineConfig } from "eslint/config"
import { describe, it } from "vitest"

import {
  extensionCharterPlugin,
  default as extensionsCharterConfig,
} from "../src/configs/extensions-charter.config.js"
import extensionsSecurityConfig from "../src/configs/extensions-security.config.js"
import {
  expectMessageForRule,
  expectNoMessageForRule,
  lintSnippet,
} from "./helpers/eslint-resolver.js"

// ── Helpers ────────────────────────────────────────────────────────────────

const TS_FILE = "src/content.ts"

// ── #322 — extensions-security.config ─────────────────────────────────────

describe("lint: extension-security — no-eval", () => {
  it("fires on eval()", async () => {
    const msgs = await lintSnippet(
      extensionsSecurityConfig,
      `eval("code")`,
      TS_FILE
    )
    expectMessageForRule(msgs, "no-eval", "eval()")
  })

  it("does NOT fire for normal code", async () => {
    const msgs = await lintSnippet(
      extensionsSecurityConfig,
      `const x = 1`,
      TS_FILE
    )
    expectNoMessageForRule(msgs, "no-eval", "const x = 1")
  })
})

describe("lint: extension-security — no-new-func", () => {
  it("fires on new Function(string)", async () => {
    const msgs = await lintSnippet(
      extensionsSecurityConfig,
      `const fn = new Function("return 1")`,
      TS_FILE
    )
    expectMessageForRule(msgs, "no-new-func", "new Function(string)")
  })

  it("does NOT fire for regular class instantiation", async () => {
    const msgs = await lintSnippet(
      extensionsSecurityConfig,
      `class Foo {} const f = new Foo()`,
      TS_FILE
    )
    expectNoMessageForRule(msgs, "no-new-func", "new Foo()")
  })
})

describe("lint: extension-security — no-implied-eval", () => {
  it("fires on setTimeout(string, delay)", async () => {
    const msgs = await lintSnippet(
      extensionsSecurityConfig,
      `setTimeout("alert(1)", 100)`,
      TS_FILE
    )
    expectMessageForRule(msgs, "no-implied-eval", "setTimeout(string)")
  })

  it("does NOT fire for setTimeout(fn, delay)", async () => {
    const msgs = await lintSnippet(
      extensionsSecurityConfig,
      `setTimeout(() => { }, 100)`,
      TS_FILE
    )
    expectNoMessageForRule(msgs, "no-implied-eval", "setTimeout(fn)")
  })
})

describe("lint: extension-security — no document.write()", () => {
  it("fires on document.write()", async () => {
    const msgs = await lintSnippet(
      extensionsSecurityConfig,
      `document.write("<h1>hi</h1>")`,
      TS_FILE
    )
    expectMessageForRule(msgs, "no-restricted-properties", "document.write()")
  })

  it("does NOT fire for document.getElementById()", async () => {
    const msgs = await lintSnippet(
      extensionsSecurityConfig,
      `document.getElementById("root")`,
      TS_FILE
    )
    expectNoMessageForRule(
      msgs,
      "no-restricted-properties",
      "document.getElementById()"
    )
  })
})

describe("lint: extension-security — prefer browser.* over chrome.*", () => {
  it("warns on chrome.tabs.query()", async () => {
    const msgs = await lintSnippet(
      extensionsSecurityConfig,
      `chrome.tabs.query({}, () => {})`,
      TS_FILE
    )
    expectMessageForRule(msgs, "no-restricted-globals", "chrome.tabs.query()")
  })

  it("does NOT warn on browser.tabs.query()", async () => {
    const msgs = await lintSnippet(
      extensionsSecurityConfig,
      `browser.tabs.query({}, () => {})`,
      TS_FILE
    )
    expectNoMessageForRule(
      msgs,
      "no-restricted-globals",
      "browser.tabs.query()"
    )
  })
})

describe("lint: extension-security — no hardcoded http:// URLs", () => {
  it("fires on http:// string literal", async () => {
    const msgs = await lintSnippet(
      extensionsSecurityConfig,
      `const url = "http://example.com"`,
      TS_FILE
    )
    expectMessageForRule(msgs, "no-restricted-syntax", "http:// literal")
  })

  it("does NOT fire for https:// URLs", async () => {
    const msgs = await lintSnippet(
      extensionsSecurityConfig,
      `const url = "https://example.com"`,
      TS_FILE
    )
    expectNoMessageForRule(msgs, "no-restricted-syntax", "https:// literal")
  })
})

describe("lint: extension-security — no chrome.tabs.discard(tabId, callback)", () => {
  it("fires on chrome.tabs.discard(tabId, callback) — Firefox throws on the callback form", async () => {
    const msgs = await lintSnippet(
      extensionsSecurityConfig,
      `chrome.tabs.discard(1, () => {})`,
      TS_FILE
    )
    expectMessageForRule(
      msgs,
      "no-restricted-syntax",
      "chrome.tabs.discard(tabId, callback)"
    )
  })

  it("does NOT fire on chrome.tabs.discard(tabId) — the cross-browser-safe Promise form", async () => {
    const msgs = await lintSnippet(
      extensionsSecurityConfig,
      `chrome.tabs.discard(1)`,
      TS_FILE
    )
    expectNoMessageForRule(
      msgs,
      "no-restricted-syntax",
      "chrome.tabs.discard(tabId)"
    )
  })

  it("does NOT fire on unrelated chrome.tabs.* calls with 2 arguments", async () => {
    const msgs = await lintSnippet(
      extensionsSecurityConfig,
      `chrome.tabs.get(1, () => {})`,
      TS_FILE
    )
    expectNoMessageForRule(
      msgs,
      "no-restricted-syntax",
      "chrome.tabs.get(tabId, callback)"
    )
  })
})

describe("lint: extension-security — no remote dynamic imports", () => {
  it("fires on import() from a remote URL", async () => {
    const msgs = await lintSnippet(
      extensionsSecurityConfig,
      `const mod = import("https://cdn.example.com/lib.js")`,
      TS_FILE
    )
    expectMessageForRule(msgs, "no-restricted-syntax", "remote import()")
  })

  it("does NOT fire for local relative imports", async () => {
    const msgs = await lintSnippet(
      extensionsSecurityConfig,
      `const mod = import("./lib.js")`,
      TS_FILE
    )
    expectNoMessageForRule(msgs, "no-restricted-syntax", "local import()")
  })
})

// ── #285 — no-unprefixed-namespace ────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
function makeNamespaceConfig(prefix: string, allowlist: Array<string> = []) {
  return defineConfig([
    {
      files: ["**/*.{js,ts}"],
      plugins: { "extension-charter": extensionCharterPlugin },
      rules: {
        "extension-charter/no-unprefixed-namespace": [
          "error",
          { prefix, allowlist },
        ],
      },
    },
  ])
}

describe("lint: charter — no-unprefixed-namespace (CSS classList)", () => {
  it("fires when classList.add uses an unprefixed class", async () => {
    const msgs = await lintSnippet(
      makeNamespaceConfig("boyo-"),
      `el.classList.add("tab-row")`,
      TS_FILE
    )
    expectMessageForRule(
      msgs,
      "extension-charter/no-unprefixed-namespace",
      "classList.add unprefixed"
    )
  })

  it("does NOT fire when classList.add uses the workspace prefix", async () => {
    const msgs = await lintSnippet(
      makeNamespaceConfig("boyo-"),
      `el.classList.add("boyo-tab-row")`,
      TS_FILE
    )
    expectNoMessageForRule(
      msgs,
      "extension-charter/no-unprefixed-namespace",
      "classList.add prefixed"
    )
  })

  it("does NOT fire for allowlisted vendor class names", async () => {
    const msgs = await lintSnippet(
      makeNamespaceConfig("boyo-", ["yt-page-container"]),
      `el.classList.contains("yt-page-container")`,
      TS_FILE
    )
    expectNoMessageForRule(
      msgs,
      "extension-charter/no-unprefixed-namespace",
      "allowlisted vendor class"
    )
  })
})

describe("lint: charter — no-unprefixed-namespace (data-* attributes)", () => {
  it("fires when setAttribute uses an unprefixed data-* name", async () => {
    const msgs = await lintSnippet(
      makeNamespaceConfig("boyo-"),
      `el.setAttribute("data-dragging", "true")`,
      TS_FILE
    )
    expectMessageForRule(
      msgs,
      "extension-charter/no-unprefixed-namespace",
      "setAttribute data-* unprefixed"
    )
  })

  it("does NOT fire for a correctly prefixed data-* attribute", async () => {
    const msgs = await lintSnippet(
      makeNamespaceConfig("boyo-"),
      `el.setAttribute("data-boyo-dragging", "true")`,
      TS_FILE
    )
    expectNoMessageForRule(
      msgs,
      "extension-charter/no-unprefixed-namespace",
      "setAttribute data-* prefixed"
    )
  })
})

describe("lint: charter — no-unprefixed-namespace (CustomEvent names)", () => {
  it("fires on an unprefixed CustomEvent name", async () => {
    const msgs = await lintSnippet(
      makeNamespaceConfig("boyo-"),
      `el.dispatchEvent(new CustomEvent("toggle"))`,
      TS_FILE
    )
    expectMessageForRule(
      msgs,
      "extension-charter/no-unprefixed-namespace",
      "CustomEvent unprefixed"
    )
  })

  it("does NOT fire for a prefixed CustomEvent name", async () => {
    const msgs = await lintSnippet(
      makeNamespaceConfig("boyo-"),
      `el.dispatchEvent(new CustomEvent("boyo-toggle"))`,
      TS_FILE
    )
    expectNoMessageForRule(
      msgs,
      "extension-charter/no-unprefixed-namespace",
      "CustomEvent prefixed"
    )
  })
})

// ── #286 — no-zindex-escalation ───────────────────────────────────────────

describe("lint: charter — no-zindex-escalation", () => {
  it("fires when zIndex object property equals INT_MAX", async () => {
    const msgs = await lintSnippet(
      extensionsCharterConfig,
      `const s = { zIndex: 2147483647 }`,
      TS_FILE
    )
    expectMessageForRule(
      msgs,
      "extension-charter/no-zindex-escalation",
      "zIndex object literal INT_MAX"
    )
  })

  it("fires when style.zIndex assignment is a high string literal", async () => {
    const msgs = await lintSnippet(
      extensionsCharterConfig,
      `el.style.zIndex = "2147483647"`,
      TS_FILE
    )
    expectMessageForRule(
      msgs,
      "extension-charter/no-zindex-escalation",
      "style.zIndex assignment string INT_MAX"
    )
  })

  it("does NOT fire when zIndex is below the threshold (conveyor policy)", async () => {
    const msgs = await lintSnippet(
      extensionsCharterConfig,
      `const s = { zIndex: 2147483640 }`,
      TS_FILE
    )
    expectNoMessageForRule(
      msgs,
      "extension-charter/no-zindex-escalation",
      "zIndex at conveyor policy value"
    )
  })

  it("does NOT fire for low z-index values", async () => {
    const msgs = await lintSnippet(
      extensionsCharterConfig,
      `const s = { zIndex: 100 }`,
      TS_FILE
    )
    expectNoMessageForRule(
      msgs,
      "extension-charter/no-zindex-escalation",
      "zIndex low value"
    )
  })
})

// ── #287 — no-logic-layer-side-effects ───────────────────────────────────

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
function makeLogicConfig() {
  return defineConfig([
    {
      files: ["**/*.{js,ts}"],
      plugins: { "extension-charter": extensionCharterPlugin },
      rules: {
        "extension-charter/no-logic-layer-side-effects": "error",
      },
    },
  ])
}

describe("lint: charter — no-logic-layer-side-effects", () => {
  it("fires when logic code references document", async () => {
    const msgs = await lintSnippet(
      makeLogicConfig(),
      `const el = document.getElementById("root")`,
      TS_FILE
    )
    expectMessageForRule(
      msgs,
      "extension-charter/no-logic-layer-side-effects",
      "document reference"
    )
  })

  it("fires when logic code references browser API", async () => {
    const msgs = await lintSnippet(
      makeLogicConfig(),
      `browser.tabs.query({}, () => {})`,
      TS_FILE
    )
    expectMessageForRule(
      msgs,
      "extension-charter/no-logic-layer-side-effects",
      "browser reference"
    )
  })

  it("fires when logic code references chrome API", async () => {
    const msgs = await lintSnippet(
      makeLogicConfig(),
      `chrome.runtime.sendMessage({})`,
      TS_FILE
    )
    expectMessageForRule(
      msgs,
      "extension-charter/no-logic-layer-side-effects",
      "chrome reference"
    )
  })

  it("does NOT fire for pure logic (no DOM/browser references)", async () => {
    const msgs = await lintSnippet(
      makeLogicConfig(),
      `function add(a, b) { return a + b }`,
      TS_FILE
    )
    expectNoMessageForRule(
      msgs,
      "extension-charter/no-logic-layer-side-effects",
      "pure logic function"
    )
  })
})

// ── #288 — no-raw-storage ─────────────────────────────────────────────────

describe("lint: charter — no-raw-storage", () => {
  it("fires on localStorage access", async () => {
    const msgs = await lintSnippet(
      extensionsCharterConfig,
      `localStorage.setItem("key", "val")`,
      TS_FILE
    )
    expectMessageForRule(
      msgs,
      "extension-charter/no-raw-storage",
      "localStorage.setItem"
    )
  })

  it("fires on sessionStorage access", async () => {
    const msgs = await lintSnippet(
      extensionsCharterConfig,
      `sessionStorage.getItem("key")`,
      TS_FILE
    )
    expectMessageForRule(
      msgs,
      "extension-charter/no-raw-storage",
      "sessionStorage.getItem"
    )
  })

  it("does NOT fire when using browser.storage.local", async () => {
    const msgs = await lintSnippet(
      extensionsCharterConfig,
      `browser.storage.local.set({ "boyo.key": "val" })`,
      TS_FILE
    )
    expectNoMessageForRule(
      msgs,
      "extension-charter/no-raw-storage",
      "browser.storage.local.set"
    )
  })

  it("does NOT fire when localStorage is in the allowlist", async () => {
    const cfg = defineConfig([
      {
        files: ["**/*.{js,ts}"],
        plugins: { "extension-charter": extensionCharterPlugin },
        rules: {
          "extension-charter/no-raw-storage": [
            "error",
            { allowlist: ["localStorage"] },
          ],
        },
      },
    ])
    const msgs = await lintSnippet(cfg, `localStorage.getItem("k")`, TS_FILE)
    expectNoMessageForRule(
      msgs,
      "extension-charter/no-raw-storage",
      "localStorage in allowlist"
    )
  })
})
