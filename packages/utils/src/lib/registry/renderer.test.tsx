import { isValidElement } from "react"
import type { ComponentRegistry } from "@some-ui/types"
import { describe, expect, it } from "vitest"

import { renderRegistryComponent } from "./renderer"

const Panel = (): null => null

// eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- a one-entry registry for the test; the real one is built by lazyWithPreload
const registry = {
  known: { Component: Panel },
} as unknown as ComponentRegistry<"known" | "removed">

describe("renderRegistryComponent", () => {
  it("renders the component a key names", () => {
    expect(isValidElement(renderRegistryComponent(registry, "known", {}))).toBe(
      true
    )
  })

  it("renders nothing for a key the registry no longer has", () => {
    expect(renderRegistryComponent(registry, "removed", {})).toBeNull()
  })

  it("renders the fallback for that key when the host gives one", () => {
    expect(
      renderRegistryComponent(registry, "removed", {}, { fallback: "gone" })
    ).toBe("gone")
    expect(
      renderRegistryComponent(
        registry,
        "removed",
        {},
        { fallback: "loading", errorFallback: "failed" }
      )
    ).toBe("failed")
  })
})
