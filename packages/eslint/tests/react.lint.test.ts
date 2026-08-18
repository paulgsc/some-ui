/**
 *
 * LAYER 2 — Lint-time integration tests for react.config.ts (lintText)
 *
 * SCOPE RATIONALE:
 *   We only test rules where our config makes a non-default choice that could
 *   silently regress, or where the plugin/parser wiring is non-trivial.
 *
 *   IN SCOPE (tested here):
 *     - react/function-component-definition: namedComponents:"arrow-function"
 *       is non-default. Function declarations must fire.
 *     - react/no-unstable-nested-components: allowAsProps:false is explicit.
 *     - react/jsx-no-useless-fragment: allowExpressions:true — bare fragments
 *       fire, conditional expressions do not.
 *     - react-hooks/exhaustive-deps: escalated from warn → error. We verify
 *       the severity of the emitted message, not just presence.
 *     - jsx-a11y/alt-text: custom img:["Image"] alias. Our config's own
 *       behavior — the plugin default only checks <img>, not <Image>.
 *     - no-restricted-syntax React import patterns: entirely our config,
 *       no plugin provides these selectors.
 *
 *   OUT OF SCOPE (plugin's own responsibility):
 *     - import/no-cycle, import/no-unresolved, import/no-extraneous-dependencies:
 *       require a real module graph / resolver. Not meaningful in unit context.
 *     - jsx-a11y rules not involving our custom options: tested upstream.
 *     - react/self-closing-comp, react/no-array-index-key: no config options,
 *       plugin default behavior, not worth duplicating plugin's own tests.
 *
 * filePath passed to lintSnippet must be RELATIVE.
 * JSX requires the .tsx extension so the parser applies ecmaFeatures.jsx:true.
 *
 * PARSER NOTE:
 *   react.config.ts intentionally does not configure a TypeScript parser.
 *   In production it is always composed with typescript.config.ts (via
 *   maishatuRecommended), which provides the parser. Tests that use plain
 *   JSX (no TS syntax) can lint against reactConfig alone. Tests that
 *   require TS syntax (type annotations, generics) must compose
 *   [...typescriptConfig, ...reactConfig] to mirror production.
 *   The parser belongs in typescript.config, not duplicated into react.config.
 */

import reactConfig from "@eslint/configs/react.config.js"
import tseslint from "typescript-eslint"
import { describe, expect, it } from "vitest"

import {
  expectMessageForRule,
  expectNoMessageForRule,
  lintSnippet,
} from "./helpers/eslint-resolver.js"

// Composed config for tests requiring TS syntax inside React code.
// Mirrors maishatuRecommended production composition.
const tsReactConfig = [...tseslint.configs.recommended, ...reactConfig]

// ── react/function-component-definition ───────────────────────────────────
//
// Config: namedComponents:"arrow-function", unnamedComponents:"arrow-function"
// Non-default: the plugin default is "function-expression" for named components.

describe("lint: react/function-component-definition", () => {
  it("fires on a named function declaration component", async () => {
    const messages = await lintSnippet(
      reactConfig,
      `export function MyComponent() { return <div /> }`,
      "src/Foo.tsx"
    )
    expectMessageForRule(
      messages,
      "react/function-component-definition",
      "named function declaration component"
    )
  })

  it("does NOT fire on an arrow function component", async () => {
    const messages = await lintSnippet(
      reactConfig,
      `export const MyComponent = () => <div />`,
      "src/Foo.tsx"
    )
    expectNoMessageForRule(
      messages,
      "react/function-component-definition",
      "arrow function component"
    )
  })
})

// ── react/no-unstable-nested-components ───────────────────────────────────
//
// Config: allowAsProps:false — nested components passed as props also fire.

describe("lint: react/no-unstable-nested-components", () => {
  it("fires when a component is defined inside a render", async () => {
    const messages = await lintSnippet(
      reactConfig,
      `
      export const Parent = () => {
        const Child = () => <span>hi</span>
        return <div><Child /></div>
      }
      `,
      "src/Foo.tsx"
    )
    expectMessageForRule(
      messages,
      "react/no-unstable-nested-components",
      "nested component defined inside render"
    )
  })

  it("does NOT fire when child component is defined at module scope", async () => {
    const messages = await lintSnippet(
      reactConfig,
      `
      const Child = () => <span>hi</span>
      export const Parent = () => <div><Child /></div>
      `,
      "src/Foo.tsx"
    )
    expectNoMessageForRule(
      messages,
      "react/no-unstable-nested-components",
      "child defined at module scope"
    )
  })
})

// ── react/jsx-no-useless-fragment ─────────────────────────────────────────
//
// Config: allowExpressions:true — fragments wrapping a single expression are
// allowed (common pattern for conditional rendering). Bare fragments are not.

describe("lint: react/jsx-no-useless-fragment", () => {
  it("fires on a fragment wrapping a single literal element", async () => {
    const messages = await lintSnippet(
      reactConfig,
      `export const A = () => <><div /></>`,
      "src/Foo.tsx"
    )
    expectMessageForRule(
      messages,
      "react/jsx-no-useless-fragment",
      "fragment wrapping single element"
    )
  })

  it("does NOT fire on a fragment wrapping multiple children", async () => {
    const messages = await lintSnippet(
      reactConfig,
      `export const A = () => <><div /><span /></>`,
      "src/Foo.tsx"
    )
    expectNoMessageForRule(
      messages,
      "react/jsx-no-useless-fragment",
      "fragment with multiple children"
    )
  })

  it("does NOT fire on a fragment wrapping a conditional expression (allowExpressions:true)", async () => {
    const messages = await lintSnippet(
      reactConfig,
      `
      declare const show: boolean
      export const A = () => <>{show && <div />}</>
      `,
      "src/Foo.tsx"
    )
    expectNoMessageForRule(
      messages,
      "react/jsx-no-useless-fragment",
      "fragment wrapping conditional expression"
    )
  })
})

// ── react-hooks/exhaustive-deps ────────────────────────────────────────────
//
// Plugin default severity is "warn". Our config sets it to "error".
// We verify the emitted message has severity 2, not just that it fires.

describe("lint: react-hooks/exhaustive-deps (severity escalated to error)", () => {
  // Uses tsReactConfig because the snippet contains TS syntax (: string).
  // reactConfig alone uses espree which cannot parse TypeScript type annotations.
  it("fires at error severity when a dependency is missing from useEffect", async () => {
    const messages = await lintSnippet(
      tsReactConfig,
      `
      import { useEffect } from "react"
      export const useData = (id: string): void => {
        useEffect(() => { console.log(id) }, [])
      }
      `,
      "src/useData.ts"
    )
    const msg = messages.find((m) => m.ruleId === "react-hooks/exhaustive-deps")
    if (msg === undefined) {
      const fired = messages.map((m) => m.ruleId).join(", ") || "(none)"
      throw new Error(
        `Expected react-hooks/exhaustive-deps to fire on missing dep.\n  Rules that fired: ${fired}`
      )
    }
    expect(msg.severity).toBe(2)
  })

  it("does NOT fire when all dependencies are listed", async () => {
    const messages = await lintSnippet(
      tsReactConfig,
      `
      import { useEffect } from "react"
      export const useData = (id: string): void => {
        useEffect(() => { console.log(id) }, [id])
      }
      `,
      "src/useData.ts"
    )
    expectNoMessageForRule(
      messages,
      "react-hooks/exhaustive-deps",
      "useEffect with correct deps"
    )
  })
})

// ── jsx-a11y/alt-text (custom Image alias) ─────────────────────────────────
//
// Config: { elements: ["img"], img: ["Image"] }
// This means our custom <Image> component is also checked for alt text,
// not just the native <img> element. This is entirely our config's behavior.

describe("lint: jsx-a11y/alt-text (custom Image component alias)", () => {
  it("fires on <Image> without alt prop (custom alias)", async () => {
    const messages = await lintSnippet(
      reactConfig,
      `export const A = () => <Image src="/a.png" />`,
      "src/Foo.tsx"
    )
    expectMessageForRule(
      messages,
      "jsx-a11y/alt-text",
      "<Image> without alt (custom alias)"
    )
  })

  it("does NOT fire on <Image> with alt prop", async () => {
    const messages = await lintSnippet(
      reactConfig,
      `export const A = () => <Image src="/a.png" alt="logo" />`,
      "src/Foo.tsx"
    )
    expectNoMessageForRule(
      messages,
      "jsx-a11y/alt-text",
      "<Image> with alt prop"
    )
  })

  it("fires on native <img> without alt (baseline still works)", async () => {
    const messages = await lintSnippet(
      reactConfig,
      `export const A = () => <img src="/a.png" />`,
      "src/Foo.tsx"
    )
    expectMessageForRule(
      messages,
      "jsx-a11y/alt-text",
      "native <img> without alt"
    )
  })
})

// ── no-restricted-syntax: React import patterns ────────────────────────────
//
// Two selectors declared in react.config.ts:
//   1. Default import from "react" (import React from "react")
//   2. Namespace import from "react" (import * as React from "react")
// Both should be banned — the jsx-transform makes them unnecessary and they
// conflict with the scoped usage patterns.

describe("lint: no-restricted-syntax — React import patterns", () => {
  it("fires on default React import", async () => {
    const messages = await lintSnippet(
      reactConfig,
      `import React from "react"; export const x = React.version`,
      "src/Foo.tsx"
    )
    expectMessageForRule(
      messages,
      "no-restricted-syntax",
      "default React import"
    )
  })

  it("fires on namespace React import", async () => {
    const messages = await lintSnippet(
      reactConfig,
      `import * as React from "react"; export const x = React.version`,
      "src/Foo.tsx"
    )
    expectMessageForRule(
      messages,
      "no-restricted-syntax",
      "namespace React import"
    )
  })

  it("does NOT fire on named React imports", async () => {
    const messages = await lintSnippet(
      reactConfig,
      `import { useState } from "react"; export const x = useState`,
      "src/Foo.tsx"
    )
    expectNoMessageForRule(
      messages,
      "no-restricted-syntax",
      "named React import"
    )
  })
})

// ── no-restricted-syntax: parent-relative dynamic import guard ────────────
//
// Lives here, not in typescript.config.ts: this file's `no-restricted-syntax`
// value is what actually reaches every .ts/.tsx file in production (flat
// config replaces, not merges, a rule's value at the most specific matching
// config, and this config's `files` glob is spread after typescript.config's
// in every preset). See the selector's own comment in react.config.ts.

describe("lint: no-restricted-syntax — parent-relative dynamic import guard", () => {
  it("fires on a parent-relative dynamic import", async () => {
    const messages = await lintSnippet(
      reactConfig,
      `export const load = () => import("../foo")`,
      "src/Foo.ts"
    )
    expectMessageForRule(
      messages,
      "no-restricted-syntax",
      "parent-relative dynamic import"
    )
  })

  it("fires on a multi-level parent-relative dynamic import", async () => {
    const messages = await lintSnippet(
      reactConfig,
      `export const load = () => import("../../components/foo")`,
      "src/Foo.ts"
    )
    expectMessageForRule(
      messages,
      "no-restricted-syntax",
      "multi-level parent-relative dynamic import"
    )
  })

  it("does NOT fire on a sibling dynamic import", async () => {
    const messages = await lintSnippet(
      reactConfig,
      `export const load = () => import("./foo")`,
      "src/Foo.ts"
    )
    expectNoMessageForRule(
      messages,
      "no-restricted-syntax",
      "sibling dynamic import"
    )
  })

  it("does NOT fire on a path-alias dynamic import", async () => {
    const messages = await lintSnippet(
      reactConfig,
      `export const load = () => import("@eslint/foo")`,
      "src/Foo.ts"
    )
    expectNoMessageForRule(
      messages,
      "no-restricted-syntax",
      "path-alias dynamic import"
    )
  })

  it("fires on a parent-relative dynamic import written as a template literal", async () => {
    const messages = await lintSnippet(
      reactConfig,
      "export const load = () => import(`../foo`)",
      "src/Foo.ts"
    )
    expectMessageForRule(
      messages,
      "no-restricted-syntax",
      "parent-relative template-literal dynamic import"
    )
  })

  it("fires on a parent-relative template literal with interpolation", async () => {
    const messages = await lintSnippet(
      reactConfig,
      "export const load = (name) => import(`../${name}`)",
      "src/Foo.ts"
    )
    expectMessageForRule(
      messages,
      "no-restricted-syntax",
      "interpolated parent-relative template-literal dynamic import"
    )
  })

  it("does NOT fire on a sibling dynamic import written as a template literal", async () => {
    const messages = await lintSnippet(
      reactConfig,
      "export const load = (name) => import(`./${name}`)",
      "src/Foo.ts"
    )
    expectNoMessageForRule(
      messages,
      "no-restricted-syntax",
      "sibling template-literal dynamic import"
    )
  })
})
