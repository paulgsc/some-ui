/**
 * @vitest-environment jsdom
 */
import type { JSX } from "react"
import { ThemeProvider, useTheme } from "@/providers/theme"
import { act, cleanup, render, screen } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

let osDark = false
const listeners = new Set<(event: { matches: boolean }) => void>()

function setOsDark(dark: boolean): void {
  osDark = dark
  for (const listener of listeners) listener({ matches: dark })
}

beforeEach(() => {
  osDark = false
  listeners.clear()
  localStorage.clear()
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: (query: string) => ({
      get matches(): boolean {
        return query === "(prefers-color-scheme: dark)" && osDark
      },
      media: query,
      addEventListener: (
        _: string,
        listener: (event: { matches: boolean }) => void
      ): void => {
        listeners.add(listener)
      },
      removeEventListener: (
        _: string,
        listener: (event: { matches: boolean }) => void
      ): void => {
        listeners.delete(listener)
      },
    }),
  })
})

afterEach(() => {
  cleanup()
  Reflect.deleteProperty(window, "matchMedia")
})

const Probe = (): JSX.Element => {
  const { resolved, setPreference } = useTheme()
  return (
    <>
      <output data-testid="resolved">{resolved.id}</output>
      <button type="button" onClick={() => setPreference("system")}>
        system
      </button>
    </>
  )
}

describe("ThemeProvider", () => {
  it("resolves system to the OS setting as it is when chosen", () => {
    setOsDark(true)
    localStorage.setItem("some-ui.theme", "mochi")
    render(
      <ThemeProvider>
        <Probe />
      </ThemeProvider>
    )
    act(() => setOsDark(false))

    act(() => screen.getByRole("button", { name: "system" }).click())

    expect(screen.getByTestId("resolved").textContent).toBe("light")
    expect(document.documentElement.classList.contains("dark")).toBe(false)
  })
})
