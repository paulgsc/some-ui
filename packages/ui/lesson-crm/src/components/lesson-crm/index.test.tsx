import { LessonCrm } from "@lesson-crm/components/lesson-crm"
import { LESSON, REPLY } from "@lesson-crm/lib/__tests__/fixture"
import type {
  LessonCrmClient,
  LessonWrite,
  OperatorLesson,
} from "@lesson-crm/lib/client"
import { act, fireEvent, render, screen, within } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"

const BODY = `${JSON.stringify(LESSON, null, 2)}\n`

const lesson = (
  key: string,
  retiredAt: string | null = null
): OperatorLesson => ({
  key,
  displayName: `Lesson ${key}`,
  description: "d",
  batchCount: 1,
  totalQuestions: 1,
  totalMessages: 2,
  tags: ["topik-1", "relation:reply"],
  activityId: "topik",
  publishedAt: "2026-09-27T00:00:00+00:00",
  version: 1,
  contentHash: "h",
  retiredAt,
})

function fakeClient(initial: Array<OperatorLesson>): LessonCrmClient & {
  writes: Array<[string, LessonWrite]>
} {
  const writes: Array<[string, LessonWrite]> = []
  return {
    writes,
    list: vi.fn(() => Promise.resolve(initial)),
    read: vi.fn(() => Promise.resolve(BODY)),
    write: vi.fn((key: string, write: LessonWrite) => {
      writes.push([key, write])
      return Promise.resolve({
        change: "inserted" as const,
        lesson: { ...lesson(key), ...write.metadata },
      })
    }),
    retire: vi.fn((key: string) =>
      Promise.resolve(lesson(key, "2026-09-28T00:00:00+00:00"))
    ),
    restore: vi.fn((key: string) => Promise.resolve(lesson(key))),
  }
}

/** Lets pending promises and deferred renders land. */
const settle = (): Promise<void> =>
  act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0))
  })

const listSection = (title: RegExp): HTMLElement => {
  const heading = screen.getByRole("heading", { name: title })
  const section = heading.closest("section")
  if (!section) throw new Error("no section")
  return section
}

describe("LessonCrm", () => {
  it("opens a stored lesson, checks it, and retires and restores it", async () => {
    const client = fakeClient([lesson("a"), lesson("b")])
    render(<LessonCrm client={client} />)
    await settle()

    fireEvent.click(screen.getByRole("button", { name: /Lesson a/ }))
    await settle()
    expect(client.read).toHaveBeenCalledWith("a")
    expect(screen.getByLabelText(/Lesson: a model/)).toHaveValue(BODY)
    expect(screen.getByLabelText(/^Tags/)).toHaveValue("topik-1")
    expect(
      screen.getByRole("status", { name: "Lesson check" })
    ).toHaveTextContent("relation:reply")

    fireEvent.click(screen.getByRole("button", { name: /Retire/ }))
    await settle()
    expect(client.retire).toHaveBeenCalledWith("a")
    expect(
      within(listSection(/Retired/)).getByRole("button", { name: /Lesson a/ })
    ).toBeInTheDocument()

    fireEvent.click(screen.getByRole("button", { name: /Restore/ }))
    await settle()
    expect(client.restore).toHaveBeenCalledWith("a")
    expect(screen.queryByRole("heading", { name: /Retired/ })).toBeNull()
  })

  it("saves a pasted reply as a new lesson, filled from its entry", async () => {
    const client = fakeClient([])
    render(<LessonCrm client={client} />)
    await settle()

    fireEvent.click(screen.getByRole("button", { name: /New lesson/ }))
    fireEvent.change(screen.getByLabelText(/Lesson: a model/), {
      target: { value: REPLY },
    })
    await settle()
    expect(screen.getByLabelText("Key")).toHaveValue("cafe-order")
    fireEvent.click(screen.getByRole("button", { name: /Save/ }))
    await settle()

    expect(client.writes).toHaveLength(1)
    const [key, write] = client.writes[0] ?? []
    expect(key).toBe("cafe-order")
    expect(write?.metadata.tags).toEqual(["topik-1", "cafe", "relation:reply"])
    expect(screen.getByText("Added to the manifest")).toBeInTheDocument()
    expect(
      within(listSection(/In the manifest/)).getByRole("button", {
        name: /At the café/,
      })
    ).toBeInTheDocument()
  })

  it("won't save a new lesson over an existing key", async () => {
    const client = fakeClient([lesson("cafe-order")])
    render(<LessonCrm client={client} />)
    await settle()

    fireEvent.click(screen.getByRole("button", { name: /New lesson/ }))
    fireEvent.change(screen.getByLabelText(/Lesson: a model/), {
      target: { value: REPLY },
    })
    await settle()
    expect(
      screen.getByText(/A lesson with this key exists/)
    ).toBeInTheDocument()
    expect(screen.getByRole("button", { name: /Save/ })).toBeDisabled()
  })

  it("drops a slow read for a lesson the operator has clicked away from", async () => {
    const client = fakeClient([lesson("a"), lesson("b")])
    let finishA: (body: string) => void = () => undefined
    vi.mocked(client.read).mockImplementation((key: string) =>
      key === "a"
        ? new Promise<string>((resolve) => {
            finishA = resolve
          })
        : Promise.resolve("[]")
    )
    render(<LessonCrm client={client} />)
    await settle()

    fireEvent.click(screen.getByRole("button", { name: /Lesson a/ }))
    fireEvent.click(screen.getByRole("button", { name: /Lesson b/ }))
    await settle()
    finishA(BODY)
    await settle()
    expect(screen.getByLabelText("Key")).toHaveValue("b")
    expect(screen.getByLabelText(/Lesson: a model/)).toHaveValue("[]")
  })
})
