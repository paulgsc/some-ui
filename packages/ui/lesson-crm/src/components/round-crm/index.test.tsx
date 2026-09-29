import { RoundCrm } from "@lesson-crm/components/round-crm"
import type { CrmNotice, Reporting } from "@lesson-crm/lib/operation"
import type {
  OperatorRound,
  RoundCrmClient,
  RoundWritten,
} from "@lesson-crm/lib/round-client"
import { toIntentError } from "@some-ui/intent-kit"
import { AUTHORED_ROUNDS, serializeRound } from "@some-ui/leetype"
import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import type * as SomeUiUtils from "some-ui-utils"
import { describe, expect, it, vi } from "vitest"

// jsdom lays nothing out; every page holds everything, as in LessonCrm's tests.
// A phone's one-pane layout is chosen by `useIsMobile`; each test sets it.
const viewport = { mobile: false }
vi.mock("some-ui-utils", async () => {
  const actual = await vi.importActual<typeof SomeUiUtils>("some-ui-utils")
  return {
    ...actual,
    useIsMobile: (): boolean => viewport.mobile,
    useFittedPage: <T,>(
      items: ReadonlyArray<T>
    ): ReturnType<typeof SomeUiUtils.useFittedPage<T>> => ({
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

// The first round of LeetType's reviewed corpus.
const PARSED = AUTHORED_ROUNDS[0]!
const BODY = serializeRound(PARSED)
// The same round as a model might write it: compact, keys in its own order.
const ROUND_BODY = JSON.stringify(PARSED)

const operatorRound = (
  id: string,
  retiredAt: string | null = null
): OperatorRound => ({
  id,
  version: 1,
  publishedAt: "2026-09-29T00:00:00+00:00",
  contentHash: "h",
  witnesses: [
    { propositionId: "CW-P6", admissible: true },
    { propositionId: "CW-P8", admissible: false },
  ],
  retiredAt,
})

function fakeClient(initial: Array<OperatorRound>): RoundCrmClient & {
  writes: Array<[string, string]>
} {
  let rounds = [...initial]
  const writes: Array<[string, string]> = []
  return {
    writes,
    list: (): Promise<Array<OperatorRound>> => Promise.resolve(rounds),
    read: (): Promise<string> => Promise.resolve(BODY),
    write: (id: string, body: string): Promise<RoundWritten> => {
      writes.push([id, body])
      const written = operatorRound(id)
      rounds = [...rounds.filter((round) => round.id !== id), written]
      return Promise.resolve({ change: "inserted", round: written })
    },
    retire: (id: string): Promise<OperatorRound> =>
      Promise.resolve(operatorRound(id, "2026-09-29")),
    restore: (id: string): Promise<OperatorRound> =>
      Promise.resolve(operatorRound(id)),
  }
}

function reporting(): Reporting & { notices: Array<CrmNotice> } {
  const notices: Array<CrmNotice> = []
  return {
    notices,
    notify: (notice): void => {
      notices.push(notice)
    },
    mapError: toIntentError,
  }
}

describe("RoundCrm", () => {
  it("lists rounds with their witnesses, and opens one's stored body", async () => {
    render(
      <RoundCrm
        client={fakeClient([operatorRound("count-present-sorted-lookup")])}
        reporting={reporting()}
      />
    )
    fireEvent.click(
      await screen.findByRole("button", { name: /count-present-sorted-lookup/ })
    )
    await waitFor(() =>
      expect(screen.getByLabelText("Round JSON")).toHaveValue(BODY)
    )
    expect(screen.getByText(/checks out: 2 rewrites/)).toBeInTheDocument()
  })

  it("publishes a pasted round as serializeRound's bytes", async () => {
    const client = fakeClient([])
    const report = reporting()
    render(<RoundCrm client={client} reporting={report} />)
    fireEvent.click(await screen.findByRole("button", { name: /New round/ }))
    fireEvent.click(screen.getByRole("button", { name: "Back to the rounds" }))
    // A model's whole reply, prose and all: the intake finds the round.
    fireEvent.change(screen.getByLabelText("Round JSON"), {
      target: { value: `Sure!\n\`\`\`json\n${ROUND_BODY}\n\`\`\`` },
    })
    const save = screen.getByRole("button", { name: /Save/ })
    await waitFor(() => expect(save).toBeEnabled())
    fireEvent.click(save)
    await waitFor(() => expect(client.writes).toHaveLength(1))
    expect(client.writes[0]).toEqual([PARSED.id, BODY])
    await waitFor(() =>
      expect(report.notices.some((notice) => notice.tone === "success")).toBe(
        true
      )
    )
  })

  it("holds Save for a round that fails the checks, and for an id already taken", async () => {
    const client = fakeClient([operatorRound(PARSED.id)])
    render(<RoundCrm client={client} reporting={reporting()} />)
    fireEvent.click(await screen.findByRole("button", { name: /New round/ }))
    fireEvent.click(screen.getByRole("button", { name: "Back to the rounds" }))

    const broken = { ...PARSED, graph: { kind: "work", cost: 1 } }
    fireEvent.change(screen.getByLabelText("Round JSON"), {
      target: { value: JSON.stringify(broken) },
    })
    expect(screen.getByRole("alert")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: /Save/ })).toBeDisabled()

    fireEvent.change(screen.getByLabelText("Round JSON"), {
      target: { value: ROUND_BODY },
    })
    expect(screen.getByText(/already exists/)).toBeInTheDocument()
    expect(screen.getByRole("button", { name: /Save/ })).toBeDisabled()
  })

  it("shows one pane at a time on a phone: the list, then the editor with a way back", async () => {
    viewport.mobile = true
    try {
      render(
        <RoundCrm
          client={fakeClient([operatorRound(PARSED.id)])}
          reporting={reporting()}
        />
      )
      fireEvent.click(
        await screen.findByRole("button", { name: new RegExp(PARSED.id) })
      )
      expect(screen.queryByRole("navigation", { name: "Rounds" })).toBeNull()
      await waitFor(() =>
        expect(screen.getByLabelText("Round JSON")).toHaveValue(BODY)
      )
      fireEvent.click(screen.getByRole("button", { name: /All rounds/ }))
      expect(
        screen.getByRole("navigation", { name: "Rounds" })
      ).toBeInTheDocument()
      expect(screen.queryByLabelText("Round JSON")).toBeNull()
    } finally {
      viewport.mobile = false
    }
  })

  it("retires a served round", async () => {
    const client = fakeClient([operatorRound(PARSED.id)])
    const retire = vi.spyOn(client, "retire")
    render(<RoundCrm client={client} reporting={reporting()} />)
    fireEvent.click(
      await screen.findByRole("button", { name: new RegExp(PARSED.id) })
    )
    fireEvent.click(await screen.findByRole("button", { name: /Retire/ }))
    await waitFor(() => expect(retire).toHaveBeenCalledWith(PARSED.id))
    expect(await screen.findByText("retired")).toBeInTheDocument()
  })
})
