/**
 * @vitest-environment jsdom
 *
 * A pick's Apply step shows what the run drafted from the posting's form:
 * each draft with a copy button, a required question marked, and one left
 * to me said so.
 */

import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

vi.mock("@/lib/jobs", () => ({ phoneJobs: vi.fn(), copyText: vi.fn() }))

afterEach(cleanup)

const KIT = {
  fields: [],
  answers: [],
  coverLetter: "I build backend services.",
  questions: [
    { label: "Why us?", required: true, draft: "The pipelines." },
    { label: "Anything else?", required: false, draft: null },
  ],
  compensation: { ask: "$110,000", why: "Inside the posted range." },
}

describe("the kit's drafts", () => {
  it("shows each draft with a copy button, and marks what the form requires", async () => {
    const { KitDrafts } = await import("@/components/jobs/pick")
    render(<KitDrafts kit={KIT} />)
    expect(screen.getByText("I build backend services.")).toBeTruthy()
    expect(screen.getByText("The pipelines.")).toBeTruthy()
    expect(screen.getAllByText("Required")).toHaveLength(1)
    expect(screen.getByText("No draft: this one is mine.")).toBeTruthy()
    expect(screen.getByText("$110,000")).toBeTruthy()
    expect(screen.getByText("Inside the posted range.")).toBeTruthy()
    expect(screen.getByTitle("Copy Cover letter")).toBeTruthy()
    expect(screen.getByTitle("Copy Why us?")).toBeTruthy()
    expect(screen.getByTitle("Copy Pay expectation")).toBeTruthy()
    expect(screen.queryByTitle("Copy Anything else?")).toBeNull()
  })

  it("shows nothing for a kit the run drafted nothing for", async () => {
    const { KitDrafts } = await import("@/components/jobs/pick")
    const { container } = render(
      <KitDrafts
        kit={{ ...KIT, coverLetter: null, questions: [], compensation: null }}
      />
    )
    expect(container.textContent).toBe("")
  })
})
