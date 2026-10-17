/**
 * @vitest-environment jsdom
 */

import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"

import { DemoLink } from "@/components/demo-link"

afterEach(cleanup)

describe("DemoLink", () => {
  it("asks YouTube for nothing until the demo is opened", () => {
    render(<DemoLink youtubeId="abc123" title="Hangul study" />)
    expect(document.querySelector("iframe")).toBeNull()

    fireEvent.click(screen.getByRole("button", { name: "Demo" }))

    const player = screen.getByTitle("Hangul study: demo")
    expect(player.getAttribute("src")).toBe(
      "https://www.youtube-nocookie.com/embed/abc123"
    )
  })
})
