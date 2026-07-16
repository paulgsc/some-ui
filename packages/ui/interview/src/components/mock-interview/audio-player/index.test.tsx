import { fireEvent, render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"

import { AudioPlayer } from "."

function audioElement(container: HTMLElement): HTMLAudioElement {
  const audio = container.querySelector("audio")
  if (!audio) throw new Error("no <audio> element found")
  return audio
}

describe("AudioPlayer - manual toggle", () => {
  it("shows Play initially and flips to Pause and back on click", () => {
    const { container } = render(<AudioPlayer url="blob:fake-recording" />)
    expect(container.querySelector(".lucide-play")).toBeInTheDocument()

    fireEvent.click(screen.getByRole("button"))
    expect(container.querySelector(".lucide-pause")).toBeInTheDocument()

    fireEvent.click(screen.getByRole("button"))
    expect(container.querySelector(".lucide-play")).toBeInTheDocument()
  })
})

describe("AudioPlayer - native <audio> event sync", () => {
  it("switches back to Play when the underlying element fires 'ended'", () => {
    const { container } = render(<AudioPlayer url="blob:fake-recording" />)
    fireEvent.click(screen.getByRole("button")) // manual toggle -> "playing"
    expect(container.querySelector(".lucide-pause")).toBeInTheDocument()

    fireEvent.ended(audioElement(container))
    expect(container.querySelector(".lucide-play")).toBeInTheDocument()
  })

  it("stays in sync when the native element pauses independently of the button", () => {
    const { container } = render(<AudioPlayer url="blob:fake-recording" />)
    fireEvent.click(screen.getByRole("button")) // manual toggle -> "playing"
    expect(container.querySelector(".lucide-pause")).toBeInTheDocument()

    fireEvent.pause(audioElement(container))
    expect(container.querySelector(".lucide-play")).toBeInTheDocument()
  })
})
