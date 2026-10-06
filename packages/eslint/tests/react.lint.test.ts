/**
 * Lint-time integration tests for react.config.ts. Only rules where the
 * config makes a non-default choice, or where the wiring is non-trivial:
 * component definition style (arrow functions), nested components
 * (allowAsProps:false), useless fragments (allowExpressions:true),
 * exhaustive-deps at error, alt-text on the `Image` alias, and the
 * config's own no-restricted-syntax selectors. Plugin defaults and rules
 * that need a real module graph are left to upstream.
 *
 * react.config.ts has no TypeScript parser: production composes it with
 * typescript.config.ts. Snippets with TS syntax use `tsReactConfig`.
 */

import reactConfig from "@eslint/configs/react.config.js"
import tseslint from "typescript-eslint"
import { describe, expect, it } from "vitest"

import {
  expectNoMessageForRule,
  expectSnippet,
  lintSnippet,
} from "./helpers/eslint-resolver.js"

const tsReactConfig = [...tseslint.configs.recommended, ...reactConfig]

const COMPONENT = "src/Foo.tsx"
const MODULE = "src/Foo.ts"
const SYNTAX = "no-restricted-syntax"

describe("lint: react.config", () => {
  it.each<readonly [string, string, string, string, boolean]>([
    [
      "function-component-definition fires on a named function declaration component",
      `export function MyComponent() { return <div /> }`,
      COMPONENT,
      "react/function-component-definition",
      true,
    ],
    [
      "function-component-definition does NOT fire on an arrow function component",
      `export const MyComponent = () => <div />`,
      COMPONENT,
      "react/function-component-definition",
      false,
    ],
    [
      "no-unstable-nested-components fires when a component is defined inside a render",
      `
      export const Parent = () => {
        const Child = () => <span>hi</span>
        return <div><Child /></div>
      }
      `,
      COMPONENT,
      "react/no-unstable-nested-components",
      true,
    ],
    [
      "no-unstable-nested-components does NOT fire when the child is defined at module scope",
      `
      const Child = () => <span>hi</span>
      export const Parent = () => <div><Child /></div>
      `,
      COMPONENT,
      "react/no-unstable-nested-components",
      false,
    ],
    [
      "jsx-no-useless-fragment fires on a fragment wrapping a single literal element",
      `export const A = () => <><div /></>`,
      COMPONENT,
      "react/jsx-no-useless-fragment",
      true,
    ],
    [
      "jsx-no-useless-fragment does NOT fire on a fragment wrapping multiple children",
      `export const A = () => <><div /><span /></>`,
      COMPONENT,
      "react/jsx-no-useless-fragment",
      false,
    ],
    [
      "jsx-no-useless-fragment does NOT fire on a fragment wrapping a conditional expression",
      `
      declare const show: boolean
      export const A = () => <>{show && <div />}</>
      `,
      COMPONENT,
      "react/jsx-no-useless-fragment",
      false,
    ],
    [
      "alt-text fires on <Image> without alt (custom alias)",
      `export const A = () => <Image src="/a.png" />`,
      COMPONENT,
      "jsx-a11y/alt-text",
      true,
    ],
    [
      "alt-text does NOT fire on <Image> with alt",
      `export const A = () => <Image src="/a.png" alt="logo" />`,
      COMPONENT,
      "jsx-a11y/alt-text",
      false,
    ],
    [
      "alt-text fires on native <img> without alt",
      `export const A = () => <img src="/a.png" />`,
      COMPONENT,
      "jsx-a11y/alt-text",
      true,
    ],
    // The jsx transform makes default and namespace React imports unneeded.
    [
      "fires on a default React import",
      `import React from "react"; export const x = React.version`,
      COMPONENT,
      SYNTAX,
      true,
    ],
    [
      "fires on a namespace React import",
      `import * as React from "react"; export const x = React.version`,
      COMPONENT,
      SYNTAX,
      true,
    ],
    [
      "does NOT fire on named React imports",
      `import { useState } from "react"; export const x = useState`,
      COMPONENT,
      SYNTAX,
      false,
    ],
    // The parent-relative dynamic import guard lives here, not in
    // typescript.config.ts: this config's no-restricted-syntax replaces that
    // one for every file both match (see react.config.ts).
    [
      "fires on a parent-relative dynamic import",
      `export const load = () => import("../foo")`,
      MODULE,
      SYNTAX,
      true,
    ],
    [
      "fires on a multi-level parent-relative dynamic import",
      `export const load = () => import("../../components/foo")`,
      MODULE,
      SYNTAX,
      true,
    ],
    [
      "does NOT fire on a sibling dynamic import",
      `export const load = () => import("./foo")`,
      MODULE,
      SYNTAX,
      false,
    ],
    [
      "does NOT fire on a path-alias dynamic import",
      `export const load = () => import("@eslint/foo")`,
      MODULE,
      SYNTAX,
      false,
    ],
    [
      "fires on a parent-relative dynamic import written as a template literal",
      "export const load = () => import(`../foo`)",
      MODULE,
      SYNTAX,
      true,
    ],
    [
      "fires on a parent-relative template literal with interpolation",
      "export const load = (name) => import(`../${name}`)",
      MODULE,
      SYNTAX,
      true,
    ],
    [
      "does NOT fire on a sibling dynamic import written as a template literal",
      "export const load = (name) => import(`./${name}`)",
      MODULE,
      SYNTAX,
      false,
    ],
  ])("%s", (title, code, file, rule, fires) =>
    expectSnippet(reactConfig, code, file, rule, fires, title)
  )
})

describe("lint: react-hooks/exhaustive-deps (severity escalated to error)", () => {
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
