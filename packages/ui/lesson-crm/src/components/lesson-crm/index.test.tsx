import { LessonCrm } from "@lesson-crm/components/lesson-crm"
import {
  LESSON,
  REPLY,
  TREE,
  treeReply,
} from "@lesson-crm/lib/__tests__/fixture"
import type {
  LessonCrmClient,
  LessonWrite,
  OperatorLesson,
} from "@lesson-crm/lib/client"
import type { CrmNotice, Reporting } from "@lesson-crm/lib/operation"
import { toIntentError } from "@some-ui/intent-kit"
import type * as ReactHooks from "@some-ui/react-hooks"
import { act, fireEvent, render, screen, within } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

// jsdom lays nothing out, so a measured page would settle on one row. This
// file is about the CRM's flow, not about fitting - `useFittedPage` has its
// own tests, and the ui-fit sweep measures real boxes - so every page here
// holds everything.
vi.mock("@some-ui/react-hooks", async () => {
  const actual = await vi.importActual<typeof ReactHooks>(
    "@some-ui/react-hooks"
  )
  return {
    ...actual,
    useFittedPage: <T,>(
      items: ReadonlyArray<T>
    ): ReturnType<typeof ReactHooks.useFittedPage<T>> => ({
      viewportRef: { current: null },
      contentRef: { current: null },
      pageItems: [...items],
      page: 0,
      pageCount: 1,
      perPage: items.length,
      goToPage: (): void => undefined,
      next: (): void => undefined,
      previous: (): void => undefined,
      isMeasuring: false,
    }),
  }
})

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

function recording(): Reporting & { notices: Array<CrmNotice> } {
  const notices: Array<CrmNotice> = []
  return {
    notices,
    notify: (notice) => notices.push(notice),
    mapError: toIntentError,
  }
}

/** `useIsMobile` reads a media query; jsdom has none, so each test picks. */
function viewport(mobile: boolean): void {
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: (
      query: string
    ): Pick<
      MediaQueryList,
      "matches" | "media" | "addEventListener" | "removeEventListener"
    > => ({
      matches: mobile,
      media: query,
      addEventListener: (): void => undefined,
      removeEventListener: (): void => undefined,
    }),
  })
}

afterEach(() => {
  Reflect.deleteProperty(window, "matchMedia")
})

/** Lets pending promises and the renders they cause land. */
const settle = (): Promise<void> =>
  act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0))
  })

const step = (name: RegExp): void => {
  fireEvent.click(screen.getByRole("button", { name }))
}

const pasteReply = (reply = REPLY): void => {
  fireEvent.paste(screen.getByLabelText("Paste the lesson here"), {
    clipboardData: { getData: () => reply, files: [] },
  })
}

/** Renders the CRM, wide (or on a phone), once its list has loaded. */
async function mount(
  client: LessonCrmClient,
  mobile = false
): Promise<ReturnType<typeof recording>> {
  viewport(mobile)
  const reporting = recording()
  render(<LessonCrm client={client} reporting={reporting} />)
  await settle()
  return reporting
}

describe("LessonCrm on a wide screen: a list rail and a step workflow", () => {
  it("opens a stored lesson at its check, previews it, and retires and restores it - saying so each time", async () => {
    const client = fakeClient([lesson("a"), lesson("b")])
    const reporting = await mount(client)

    fireEvent.click(screen.getByRole("button", { name: /Lesson a/ }))
    await settle()
    expect(client.read).toHaveBeenCalledWith("a")
    // A stored lesson is edited, not generated: no Ask step, and it lands on Check.
    expect(screen.queryByRole("button", { name: /Step \d: Ask/ })).toBeNull()
    expect(
      screen.getByRole("button", { name: "Step 4: Check" })
    ).toHaveAttribute("aria-current", "step")
    expect(
      screen.getByRole("status", { name: "Lesson check" })
    ).toHaveTextContent("relation:reply")

    step(/Step 3: Preview/)
    expect(screen.getByText("커피 한 잔 주세요.")).toBeInTheDocument()

    step(/Step 1: Lesson/)
    // The lesson is a file, not a column of text.
    expect(screen.getByText("a.json")).toBeInTheDocument()
    expect(screen.queryByDisplayValue(BODY)).toBeNull()

    step(/Step 4: Check/)
    fireEvent.click(screen.getByRole("button", { name: "Retire" }))
    await settle()
    expect(client.retire).toHaveBeenCalledWith("a")
    expect(reporting.notices.at(-1)).toMatchObject({
      tone: "success",
      title: expect.stringMatching(/^a retired/),
    })
    fireEvent.click(screen.getByRole("tab", { name: /Retired · 1/ }))
    expect(screen.getByRole("button", { name: /Lesson a/ })).toBeInTheDocument()

    fireEvent.click(screen.getByRole("button", { name: "Restore" }))
    await settle()
    expect(client.restore).toHaveBeenCalledWith("a")
    expect(reporting.notices.at(-1)).toMatchObject({
      tone: "success",
      title: "a is back in the manifest",
    })
  })

  it("walks a new lesson from the prompt to a save: pasted as a file, filled from its entry", async () => {
    const client = fakeClient([])
    const reporting = await mount(client)

    fireEvent.click(screen.getByRole("button", { name: /New lesson/ }))
    expect(
      screen.getByRole("region", { name: "Lesson prompt" })
    ).toBeInTheDocument()

    step(/Continue/)
    pasteReply()
    await settle()
    expect(screen.getByText("pasted-reply.md")).toBeInTheDocument()
    expect(
      within(
        document.querySelector<HTMLElement>('[data-slot="lesson-file"]') ??
          document.body
      ).getByText(/1 conversations/)
    ).toBeInTheDocument()

    step(/Continue/)
    expect(screen.getByLabelText("Key")).toHaveValue("cafe-order")

    step(/Step 5: Check/)
    fireEvent.click(screen.getByRole("button", { name: /^Save$/ }))
    await settle()

    const [key, write] = client.writes[0] ?? []
    expect(key).toBe("cafe-order")
    expect(write?.metadata.tags).toEqual(["topik-1", "cafe", "relation:reply"])
    expect(reporting.notices.at(-1)).toEqual({
      tone: "success",
      title: "cafe-order added to the manifest",
    })
    expect(
      within(screen.getByRole("navigation", { name: "Lessons" })).getByRole(
        "button",
        { name: /At the café/ }
      )
    ).toBeInTheDocument()
  })

  it("says why a save failed, and offers to try again", async () => {
    const client = fakeClient([])
    vi.mocked(client.write).mockRejectedValueOnce(new Error("boom"))
    const reporting = await mount(client)

    fireEvent.click(screen.getByRole("button", { name: /New lesson/ }))
    step(/Step 2: Lesson/)
    pasteReply()
    await settle()
    step(/Step 5: Check/)
    fireEvent.click(screen.getByRole("button", { name: /^Save$/ }))
    await settle()

    const notice = reporting.notices.at(-1)
    expect(notice).toMatchObject({
      tone: "error",
      title: "Couldn't save cafe-order",
    })
    expect(
      screen.getByRole("button", { name: /Try saving again/ })
    ).toBeInTheDocument()
    await act(async () => {
      if (notice?.tone === "error") notice.retry?.()
      await new Promise((resolve) => setTimeout(resolve, 0))
    })
    expect(client.write).toHaveBeenCalledTimes(2)
    expect(reporting.notices.at(-1)).toMatchObject({ tone: "success" })
  })

  it("says the list failed to load, and keeps a way to try again", async () => {
    const client = fakeClient([lesson("a")])
    vi.mocked(client.list).mockRejectedValueOnce(new Error("down"))
    const reporting = await mount(client)

    expect(reporting.notices).toMatchObject([
      { tone: "error", title: "Couldn't load the lessons" },
    ])
    fireEvent.click(screen.getByRole("button", { name: /Try again/ }))
    await settle()
    expect(screen.getByRole("button", { name: /Lesson a/ })).toBeInTheDocument()
  })

  it("won't save a new lesson over an existing key", async () => {
    const client = fakeClient([lesson("cafe-order")])
    await mount(client)

    fireEvent.click(screen.getByRole("button", { name: /New lesson/ }))
    step(/Step 2: Lesson/)
    pasteReply()
    await settle()
    step(/Step 3: Details/)
    expect(
      screen.getByText(/A lesson with this key exists/)
    ).toBeInTheDocument()
    step(/Step 5: Check/)
    expect(screen.getByRole("button", { name: /^Save$/ })).toBeDisabled()
  })

  it("keeps the editor on the lesson the operator moved to when an earlier save finishes", async () => {
    const client = fakeClient([lesson("b")])
    let finishSave: () => void = () => undefined
    vi.mocked(client.write).mockImplementation(
      (key: string, write: LessonWrite) =>
        new Promise((resolve) => {
          finishSave = (): void =>
            resolve({
              change: "inserted",
              lesson: { ...lesson(key), ...write.metadata },
            })
        })
    )
    await mount(client)

    fireEvent.click(screen.getByRole("button", { name: /New lesson/ }))
    step(/Step 2: Lesson/)
    pasteReply()
    await settle()
    step(/Step 5: Check/)
    fireEvent.click(screen.getByRole("button", { name: /^Save$/ }))
    // Moves to b while the save is in flight.
    fireEvent.click(screen.getByRole("button", { name: /Lesson b/ }))
    await settle()
    await act(async () => {
      finishSave()
      await new Promise((resolve) => setTimeout(resolve, 0))
    })

    step(/Step 2: Details/)
    expect(screen.getByLabelText("Key")).toHaveValue("b")
    expect(screen.getByRole("button", { name: /Lesson b/ })).toHaveAttribute(
      "aria-current",
      "true"
    )
    // The list still learned of the save.
    expect(
      screen.getByRole("button", { name: /At the café/ })
    ).toBeInTheDocument()
  })

  it("drops an upload that finishes after the operator moved to another lesson", async () => {
    const client = fakeClient([lesson("a"), lesson("b")])
    await mount(client)

    fireEvent.click(screen.getByRole("button", { name: /Lesson a/ }))
    await settle()
    step(/Step 1: Lesson/)
    let finishText: (text: string) => void = () => undefined
    const late = new File(["ignored"], "late.json")
    Object.defineProperty(late, "text", {
      value: () =>
        new Promise<string>((resolve) => {
          finishText = resolve
        }),
    })
    fireEvent.change(screen.getByLabelText(/Upload a file/), {
      target: { files: [late] },
    })
    fireEvent.click(screen.getByRole("button", { name: /Lesson b/ }))
    await settle()
    await act(async () => {
      finishText(REPLY)
      await new Promise((resolve) => setTimeout(resolve, 0))
    })

    step(/Step 1: Lesson/)
    expect(screen.getByText("b.json")).toBeInTheDocument()
    expect(screen.queryByText("late.json")).toBeNull()
  })

  it("drops a slow read for a lesson the operator has moved away from", async () => {
    const client = fakeClient([lesson("a"), lesson("b")])
    let finishA: (body: string) => void = () => undefined
    vi.mocked(client.read).mockImplementation((key: string) =>
      key === "a"
        ? new Promise<string>((resolve) => {
            finishA = resolve
          })
        : Promise.resolve("[]")
    )
    await mount(client)

    fireEvent.click(screen.getByRole("button", { name: /Lesson a/ }))
    fireEvent.click(screen.getByRole("button", { name: /Lesson b/ }))
    await settle()
    finishA(BODY)
    await settle()
    step(/Step 1: Lesson/)
    expect(screen.getByText("b.json")).toBeInTheDocument()
    expect(screen.queryByText("a.json")).toBeNull()
  })
})

describe("LessonCrm: the latest source asked for is the one kept", () => {
  it("keeps a paste made while the opened lesson is still being read", async () => {
    const client = fakeClient([lesson("a")])
    let finishA: (body: string) => void = () => undefined
    vi.mocked(client.read).mockImplementation(
      () =>
        new Promise<string>((resolve) => {
          finishA = resolve
        })
    )
    await mount(client)

    fireEvent.click(screen.getByRole("button", { name: /Lesson a/ }))
    await settle()
    step(/Step 1: Lesson/)
    pasteReply()
    await settle()
    finishA(BODY)
    await settle()
    expect(screen.getByText("pasted-reply.md")).toBeInTheDocument()
    expect(screen.queryByText("a.json")).toBeNull()
  })

  it("drops an upload that finishes after the operator pasted another, or removed it", async () => {
    await mount(fakeClient([]))
    fireEvent.click(screen.getByRole("button", { name: /New lesson/ }))
    step(/Step 2: Lesson/)

    const slowFile = (name: string): [File, (text: string) => void] => {
      let finish: (text: string) => void = () => undefined
      const file = new File(["ignored"], name)
      Object.defineProperty(file, "text", {
        value: () =>
          new Promise<string>((resolve) => {
            finish = resolve
          }),
      })
      return [file, (text): void => finish(text)]
    }
    const upload = (file: File): void => {
      fireEvent.change(screen.getByLabelText(/Upload a file/), {
        target: { files: [file] },
      })
    }

    const [first, finishFirst] = slowFile("first.json")
    upload(first)
    pasteReply()
    await settle()
    await act(async () => {
      finishFirst(REPLY)
      await new Promise((resolve) => setTimeout(resolve, 0))
    })
    expect(screen.getByText("pasted-reply.md")).toBeInTheDocument()
    expect(screen.queryByText("first.json")).toBeNull()

    const [second, finishSecond] = slowFile("second.json")
    upload(second)
    fireEvent.click(screen.getByRole("button", { name: "Remove the lesson" }))
    await act(async () => {
      finishSecond(REPLY)
      await new Promise((resolve) => setTimeout(resolve, 0))
    })
    expect(screen.queryByText("second.json")).toBeNull()
    expect(screen.queryByText("pasted-reply.md")).toBeNull()
  })
})

describe("LessonCrm: what a save writes is what the editor holds", () => {
  it("holds a new lesson's key while its save is on the way", async () => {
    const client = fakeClient([])
    let finishSave: () => void = () => undefined
    vi.mocked(client.write).mockImplementation(
      (key: string, write: LessonWrite) =>
        new Promise((resolve) => {
          finishSave = (): void =>
            resolve({
              change: "inserted",
              lesson: { ...lesson(key), ...write.metadata },
            })
        })
    )
    await mount(client)

    fireEvent.click(screen.getByRole("button", { name: /New lesson/ }))
    step(/Step 2: Lesson/)
    pasteReply()
    await settle()
    step(/Step 3: Details/)
    expect(screen.getByLabelText("Key")).not.toHaveAttribute("readonly")
    step(/Step 5: Check/)
    fireEvent.click(screen.getByRole("button", { name: /^Save$/ }))
    step(/Step 3: Details/)
    expect(screen.getByLabelText("Key")).toHaveAttribute("readonly")
    await act(async () => {
      finishSave()
      await new Promise((resolve) => setTimeout(resolve, 0))
    })
    expect(screen.getByLabelText("Key")).toHaveValue("cafe-order")
  })

  it("retries a failed save with the editor as it is now, not as it was", async () => {
    const client = fakeClient([])
    vi.mocked(client.write).mockRejectedValueOnce(new Error("boom"))
    const reporting = await mount(client)

    fireEvent.click(screen.getByRole("button", { name: /New lesson/ }))
    step(/Step 2: Lesson/)
    pasteReply()
    await settle()
    step(/Step 5: Check/)
    fireEvent.click(screen.getByRole("button", { name: /^Save$/ }))
    await settle()
    const notice = reporting.notices.at(-1)
    expect(notice).toMatchObject({ tone: "error" })

    step(/Step 3: Details/)
    fireEvent.change(screen.getByLabelText("Key"), {
      target: { value: "cafe-order-2" },
    })
    await act(async () => {
      if (notice?.tone === "error") notice.retry?.()
      await new Promise((resolve) => setTimeout(resolve, 0))
    })
    expect(client.writes.map(([key]) => key)).toEqual(["cafe-order-2"])
    expect(screen.getByLabelText("Key")).toHaveValue("cafe-order-2")
    expect(screen.getByRole("button", { name: /At the café/ })).toHaveAttribute(
      "aria-current",
      "true"
    )
  })

  it("won't save a new lesson until the list has loaded", async () => {
    const client = fakeClient([])
    vi.mocked(client.list).mockRejectedValueOnce(new Error("down"))
    await mount(client)

    fireEvent.click(screen.getByRole("button", { name: /New lesson/ }))
    step(/Step 2: Lesson/)
    pasteReply()
    await settle()
    step(/Step 5: Check/)
    expect(screen.getByRole("button", { name: /^Save$/ })).toBeDisabled()

    fireEvent.click(screen.getByRole("button", { name: /Try again/ }))
    await settle()
    expect(screen.getByRole("button", { name: /^Save$/ })).toBeEnabled()
  })

  it("won't save while a replacement source is still loading", async () => {
    await mount(fakeClient([]))
    fireEvent.click(screen.getByRole("button", { name: /New lesson/ }))
    step(/Step 2: Lesson/)
    pasteReply()
    await settle()

    let finish: (text: string) => void = () => undefined
    const replacement = new File(["ignored"], "replacement.json")
    Object.defineProperty(replacement, "text", {
      value: () =>
        new Promise<string>((resolve) => {
          finish = resolve
        }),
    })
    fireEvent.change(screen.getByLabelText(/Upload a file/), {
      target: { files: [replacement] },
    })
    step(/Step 5: Check/)
    expect(screen.getByRole("button", { name: /^Save$/ })).toBeDisabled()

    await act(async () => {
      finish(REPLY)
      await new Promise((resolve) => setTimeout(resolve, 0))
    })
    expect(screen.getByRole("button", { name: /^Save$/ })).toBeEnabled()
  })

  it("can save again once a replacement source fails to load", async () => {
    await mount(fakeClient([]))
    fireEvent.click(screen.getByRole("button", { name: /New lesson/ }))
    step(/Step 2: Lesson/)
    pasteReply()
    await settle()

    const broken = new File(["ignored"], "broken.json")
    Object.defineProperty(broken, "text", {
      value: () => Promise.reject(new Error("unreadable")),
    })
    fireEvent.change(screen.getByLabelText(/Upload a file/), {
      target: { files: [broken] },
    })
    await settle()
    step(/Step 5: Check/)
    expect(screen.getByRole("button", { name: /^Save$/ })).toBeEnabled()
  })
})

describe("LessonCrm: a scene tree is checked, not saved", () => {
  it("reports a clean tree as clean, and has nothing to save", async () => {
    await mount(fakeClient([]))
    fireEvent.click(screen.getByRole("button", { name: /New lesson/ }))
    step(/Continue/)
    pasteReply(treeReply())
    await settle()
    expect(
      within(
        document.querySelector<HTMLElement>('[data-slot="lesson-file"]') ??
          document.body
      ).getByText(/a scene tree/)
    ).toBeInTheDocument()

    step(/Step 5: Check/)
    const check = screen.getByRole("status", { name: "Lesson check" })
    expect(
      within(check).getByText(/Every choice will be asked as written/)
    ).toBeInTheDocument()
    expect(screen.getByRole("button", { name: /^Save$/ })).toBeDisabled()
  })

  it("shows the story audit's and the teaching audit's findings by path", async () => {
    await mount(fakeClient([]))
    fireEvent.click(screen.getByRole("button", { name: /New lesson/ }))
    step(/Continue/)
    pasteReply(treeReply({ ...TREE, pov: "nobody" }))
    await settle()
    step(/Step 5: Check/)
    const check = screen.getByRole("status", { name: "Lesson check" })
    expect(within(check).getByRole("alert")).toHaveTextContent(
      /can't be played: 1 finding/
    )
    expect(
      within(check).getByText(
        'Error · story · pov: "nobody" is not in the cast'
      )
    ).toBeInTheDocument()

    step(/Step 2: Lesson/)
    fireEvent.click(screen.getByRole("button", { name: "Remove the lesson" }))
    const unkeyed = {
      ...TREE.root.choice.check,
      options: TREE.root.choice.check.options.map(
        ({ id: _id, ...option }) => option
      ),
    }
    pasteReply(
      treeReply({
        ...TREE,
        root: { ...TREE.root, choice: { ...TREE.root.choice, check: unkeyed } },
      })
    )
    await settle()
    step(/Step 5: Check/)
    expect(
      within(check).getByText(
        /^Error · teaching · root\.choice\.check: candidate 0 /
      )
    ).toBeInTheDocument()
    expect(
      within(check).getByLabelText("Fixes for the model")
    ).toHaveDisplayValue(/at root\.choice\.check: candidate 0/)
  })
})

describe("LessonCrm on a phone: a bottom tab per pane", () => {
  it("keeps the editor's tabs shut until a lesson is open, then lands on the prompt", async () => {
    await mount(fakeClient([]), true)

    expect(screen.getByRole("tab", { name: "Lessons" })).toHaveAttribute(
      "aria-selected",
      "true"
    )
    expect(screen.getByRole("tab", { name: "Check" })).toBeDisabled()

    fireEvent.click(screen.getByRole("button", { name: /New lesson/ }))
    expect(screen.getByRole("tab", { name: "Ask" })).toHaveAttribute(
      "aria-selected",
      "true"
    )
    fireEvent.click(screen.getByRole("tab", { name: "Lesson" }))
    pasteReply()
    await settle()
    fireEvent.click(screen.getByRole("tab", { name: "Check" }))
    // On a phone, Save lives in the Check pane itself.
    expect(screen.getByRole("button", { name: /^Save$/ })).toBeEnabled()
  })

  it("tucks the tab bar away while a pane scrolls down, and brings it back on the way up", async () => {
    viewport(true)
    const { container } = render(
      <LessonCrm client={fakeClient([lesson("a")])} reporting={recording()} />
    )
    await settle()
    const bar = (): Element | null => container.querySelector("[data-shown]")
    const scroller = screen.getByRole("navigation", { name: "Lessons" })

    // A box with almost nothing to scroll cannot drive the bar (see
    // `useShowOnScrollUp`), so this one is given real room: 300px in a 400px
    // window of it.
    Object.defineProperty(scroller, "clientHeight", {
      configurable: true,
      value: 400,
    })
    Object.defineProperty(scroller, "scrollHeight", {
      configurable: true,
      value: 700,
    })
    const scrollTo = (top: number): void => {
      Object.defineProperty(scroller, "scrollTop", {
        configurable: true,
        value: top,
      })
      fireEvent.scroll(scroller)
    }
    expect(bar()).toHaveAttribute("data-shown", "true")
    scrollTo(120)
    expect(bar()).toHaveAttribute("data-shown", "false")
    scrollTo(60)
    expect(bar()).toHaveAttribute("data-shown", "true")
  })
})
