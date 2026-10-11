/**
 * @vitest-environment jsdom
 *
 * The page end to end over the real desk: a brief picked from the file
 * picker opens on its Brief tab, and one that is not a brief says why.
 */

import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"

import raw from "@/lib/job-brief/__tests__/amplitude.brief.json?raw"
import { JobDesk } from "@/components/jobs"

afterEach(() => {
  cleanup()
})

function pick(text: string): void {
  const input = screen.getByLabelText(/open brief\.json/i)
  // jsdom's File has no `text()`; the WebView's does.
  const file = Object.assign(new File([text], "brief.json"), {
    text: () => Promise.resolve(text),
  })
  fireEvent.change(input, { target: { files: [file] } })
}

describe("JobDesk", () => {
  it("opens a picked brief, and says why a file is not one", async () => {
    render(<JobDesk />)
    expect(screen.getByRole("heading", { name: "No brief open" })).toBeTruthy()

    pick("{}")
    expect((await screen.findByRole("alert")).textContent).toContain(
      "Not a brief"
    )

    pick(raw)
    expect(
      await screen.findByRole("heading", {
        name: "Software Engineer I, Agent Analytics",
      })
    ).toBeTruthy()
    expect(
      screen
        .getByRole("link", { name: /open the application/i })
        .getAttribute("href")
    ).toBe(
      "https://jobs.ashbyhq.com/amplitude/9c43576b-d16f-4192-a366-7c9eb689c4be"
    )
    expect(screen.getByText(/git checkout b08c1ad/)).toBeTruthy()
    expect(screen.getByRole("tab", { name: "Confirm" })).toBeTruthy()
  })
})
