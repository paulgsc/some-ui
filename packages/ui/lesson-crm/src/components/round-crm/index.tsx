import type { JSX } from "react"
import { useEffect, useMemo, useRef, useState } from "react"
import type { Reporting } from "@lesson-crm/lib/operation"
import { useOperation } from "@lesson-crm/lib/operation"
import type {
  OperatorRound,
  RoundChange,
  RoundCrmClient,
} from "@lesson-crm/lib/round-client"
import { matchIntent } from "@some-ui/intent-kit"
import {
  buildRoundPrompt,
  GenerateRound,
  intakeRound,
  serializeRound,
} from "@some-ui/leetype"
import { Badge, Button, PageControls, Textarea } from "@some-ui/shared"
import {
  Archive,
  ArchiveRestore,
  ArrowLeft,
  Check,
  Plus,
  RotateCcw,
  Save,
} from "lucide-react"
import { cn, useFittedPage, useIsMobile } from "some-ui-utils"

type RoundCrmProps = {
  client: RoundCrmClient
  reporting: Reporting
}

type Editing =
  | { kind: "none" }
  | { kind: "new" }
  | { kind: "stored"; id: string }

const CHANGE_WORDS: Record<RoundChange, (id: string) => string> = {
  inserted: (id) => `${id} published: learners draw it from now on`,
  contentChanged: (id) => `${id} updated: learners get the new version`,
  unchanged: (id) => `${id} unchanged: the server already holds this body`,
}

const upsert = (
  rounds: Array<OperatorRound>,
  round: OperatorRound
): Array<OperatorRound> => {
  const rest = rounds.filter((candidate) => candidate.id !== round.id)
  return [...rest, round].sort((a, b) => a.id.localeCompare(b.id))
}

/**
 * The operator's round CRM: the LeetType counterpart of `LessonCrm`, over
 * `file_host`'s round operator routes. A round comes in one of two ways,
 * both ending in the same check:
 *
 * - **Write one with a model.** `GenerateRound`, with the corpus audience:
 *   the same prompt and the same in-browser check a learner's "make your
 *   own round" uses, so an operator's round and a learner's are held to one
 *   standard.
 * - **Paste or edit the JSON.** A stored round opens with its body as the
 *   server holds it.
 *
 * Either way `intakeRound` runs the authored-round lint (every hunk
 * applies, admissibility claims agree with the cost graphs, the round
 * opens inadmissible after its constraint diff), and Save is held until it
 * passes. What is saved is `serializeRound`'s bytes, the same bytes
 * `corpus/rounds/` exports for the importer, so a round published here and
 * the same round imported hash alike.
 *
 * The one check a browser cannot run is compiling `A` with `rustc`; see
 * `intakeRound`'s doc comment. Rounds reviewed in the repository still get
 * it in CI.
 */
export const RoundCrm = ({ client, reporting }: RoundCrmProps): JSX.Element => {
  const isMobile = useIsMobile()
  const [rounds, setRounds] = useState<Array<OperatorRound>>([])
  const [indexed, setIndexed] = useState(false)
  const [editing, setEditing] = useState<Editing>({ kind: "none" })
  const [text, setText] = useState("")
  const [generating, setGenerating] = useState(false)
  // Which round the editor holds, as a number that changes every time it
  // does; a read or save lands only if it still matches (as in `LessonCrm`).
  const selection = useRef(0)

  const load = useOperation(
    async (): Promise<Array<OperatorRound>> => {
      const listed = await client.list()
      setRounds([...listed].sort((a, b) => a.id.localeCompare(b.id)))
      setIndexed(true)
      return listed
    },
    { success: () => null, failure: () => "Couldn't load the rounds" },
    reporting
  )
  const { start: startLoad } = load
  useEffect(() => startLoad(undefined), [client, startLoad])

  const read = useOperation(
    async ({ id, token }: { id: string; token: number }): Promise<string> => {
      const body = await client.read(id)
      if (selection.current === token) setText(body)
      return body
    },
    { success: () => null, failure: ({ id }) => `Couldn't open ${id}` },
    reporting,
    "supersede"
  )

  const intake = useMemo(
    () => (text.trim() === "" ? null : intakeRound(text)),
    [text]
  )
  const draftId = intake?.ok ? intake.round.id : null
  const clashes =
    editing.kind === "new" &&
    draftId !== null &&
    rounds.some((round) => round.id === draftId)
  const renamed =
    editing.kind === "stored" && draftId !== null && draftId !== editing.id
  // The list only grows, so it is a measured paged list (`docs/ui-fit`
  // rule 2), as `LessonList` is.
  const {
    viewportRef,
    contentRef,
    pageItems,
    page,
    pageCount,
    next,
    previous,
  } = useFittedPage(rounds, { getItemKey: (round) => round.id })
  const canSave =
    intake?.ok === true && indexed && !clashes && !renamed && !generating

  const save = useOperation(
    async () => {
      if (!intake?.ok || !canSave) {
        throw new Error("The round no longer checks out: see the check below.")
      }
      const token = selection.current
      const written = await client.write(
        intake.round.id,
        serializeRound(intake.round)
      )
      setRounds((current) => upsert(current, written.round))
      if (selection.current === token) {
        selection.current += 1
        setEditing({ kind: "stored", id: written.round.id })
      }
      return written
    },
    {
      success: (written) => CHANGE_WORDS[written.change](written.round.id),
      failure: () => `Couldn't save ${draftId ?? "the round"}`,
    },
    reporting
  )

  const listing = useOperation(
    async ({ id, listed }: { id: string; listed: boolean }) => {
      const round = await (listed ? client.restore(id) : client.retire(id))
      setRounds((current) => upsert(current, round))
      return round
    },
    {
      success: (round, { listed }) =>
        listed
          ? `${round.id} is served again`
          : `${round.id} retired: no longer drawn, still readable by id`,
      failure: ({ id, listed }) =>
        `Couldn't ${listed ? "restore" : "retire"} ${id}`,
    },
    reporting
  )

  const startNew = (): void => {
    selection.current += 1
    setEditing({ kind: "new" })
    setText("")
    setGenerating(true)
  }

  const open = (id: string): void => {
    selection.current += 1
    setEditing({ kind: "stored", id })
    setText("")
    setGenerating(false)
    read.start({ id, token: selection.current })
  }

  const storedId = editing.kind === "stored" ? editing.id : null
  const stored = rounds.find((round) => round.id === storedId)
  const listed = stored?.retiredAt === null
  const busy =
    save.state.status === "working" || listing.state.status === "working"

  const list = (
    <nav aria-label="Rounds" className="flex h-full min-h-0 flex-col gap-2">
      <Button variant="outline" className="shrink-0 gap-2" onClick={startNew}>
        <Plus className="size-4" /> New round
      </Button>
      <p className="text-xs text-muted-foreground">
        {matchIntent(load.state, {
          idle: () => "Loading rounds…",
          working: () => "Loading rounds…",
          succeeded: () =>
            rounds.length === 0
              ? "No rounds on the server yet. Import corpus/rounds/ or start a new one."
              : `${rounds.filter((round) => round.retiredAt === null).length} served, ${rounds.filter((round) => round.retiredAt !== null).length} retired`,
          failed: (error) => error.summary,
        })}
      </p>
      <div ref={viewportRef} className="min-h-0 flex-1">
        <div ref={contentRef}>
          <ul className="flex flex-col gap-1">
            {pageItems.map((round) => (
              <li key={round.id}>
                <button
                  type="button"
                  aria-current={storedId === round.id ? "true" : undefined}
                  onClick={() => open(round.id)}
                  className={cn(
                    "flex min-h-11 w-full flex-col items-start gap-1 rounded-lg px-3 py-2 text-left text-sm",
                    storedId === round.id ? "bg-primary/10" : "hover:bg-muted"
                  )}
                >
                  <span className="font-medium">{round.id}</span>
                  <span className="flex flex-wrap gap-1">
                    {round.witnesses.map((witness) => (
                      <Badge
                        key={`${witness.propositionId}:${String(witness.admissible)}`}
                        variant={witness.admissible ? "default" : "outline"}
                      >
                        {witness.propositionId}
                      </Badge>
                    ))}
                    {round.retiredAt !== null && (
                      <Badge variant="secondary">retired</Badge>
                    )}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      </div>
      <PageControls
        page={page}
        pageCount={pageCount}
        onPrevious={previous}
        onNext={next}
        label="rounds"
      />
    </nav>
  )

  const editor =
    editing.kind === "none" ? (
      <p className="text-sm text-muted-foreground">
        Pick a round to edit it, or start a new one.
      </p>
    ) : (
      <section
        aria-label="Round editor"
        className="flex min-w-0 flex-col gap-4"
      >
        {generating ? (
          <GenerateRound
            buildPrompt={(request) =>
              buildRoundPrompt({ ...request, audience: "corpus" })
            }
            startLabel="Use this round"
            onStart={(round) => {
              setText(serializeRound(round))
              setGenerating(false)
            }}
            onCancel={() => setGenerating(false)}
          />
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-base font-semibold">
                {storedId ?? "New round"}
              </h2>
              {editing.kind === "new" && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setGenerating(true)}
                >
                  Write one with a model
                </Button>
              )}
            </div>
            <Textarea
              aria-label="Round JSON"
              value={text}
              rows={14}
              onChange={(event) => setText(event.target.value)}
              placeholder="Paste a round (or a model's whole reply)"
              className="rounded-xl font-mono text-xs"
            />
            {intake !== null && !intake.ok && (
              <ul role="alert" className="flex flex-col gap-1">
                {intake.violations.map((violation) => (
                  <li
                    key={violation}
                    className="rounded-lg bg-destructive/10 px-2 py-1 text-xs text-destructive"
                  >
                    {violation}
                  </li>
                ))}
              </ul>
            )}
            {intake?.ok && (
              <p role="status" className="flex items-center gap-2 text-sm">
                <Check className="size-4 text-emerald-500" aria-hidden="true" />
                {intake.round.id} checks out: {intake.round.diffOptions.length}{" "}
                rewrites.
                {clashes &&
                  " A round with this id already exists: open it to edit it."}
                {renamed &&
                  ` Its id differs from ${storedId ?? ""}; an id is fixed once stored.`}
              </p>
            )}
            <div className="flex flex-wrap items-center gap-2">
              <Button
                className="gap-2"
                disabled={busy || !canSave}
                onClick={() => save.start(undefined)}
              >
                {save.state.status === "failed" ? (
                  <RotateCcw className="size-4" />
                ) : (
                  <Save className="size-4" />
                )}
                {save.state.status === "working" ? "Saving…" : "Save"}
              </Button>
              {stored && (
                <Button
                  variant="outline"
                  className="gap-2"
                  disabled={busy}
                  onClick={() =>
                    listing.start({ id: stored.id, listed: !listed })
                  }
                >
                  {listed ? (
                    <Archive className="size-4" />
                  ) : (
                    <ArchiveRestore className="size-4" />
                  )}
                  {listed ? "Retire" : "Restore"}
                </Button>
              )}
              {stored && (
                <p className="basis-full text-xs text-muted-foreground">
                  Version {stored.version}, published {stored.publishedAt}
                  {stored.retiredAt ? `, retired ${stored.retiredAt}` : ""}
                </p>
              )}
            </div>
          </>
        )}
      </section>
    )

  // The editor holds a prompt form or a round's whole JSON, taller than a
  // phone and than a short window, so it is the one region that scrolls.
  const editorPane = (
    <div
      data-scroll-intent="round-editor"
      className={
        /* scroll-intent: round-editor — a round is one long JSON body or a
           two-step prompt form; splitting either into pages would separate
           the text from the check that reports on it. Nothing nested
           scrolls vertically. */ "flex min-h-0 min-w-0 flex-col gap-3 overflow-y-auto"
      }
    >
      {editor}
    </div>
  )

  // A phone shows one pane at a time, as `LessonCrm` does: the list until a
  // round is open, then the editor with a way back (review finding on #1598:
  // stacked in one bounded column, the editor sat below the viewport).
  if (isMobile) {
    return (
      <div data-slot="round-crm" className="flex h-full min-h-0 flex-col gap-3">
        {editing.kind === "none" ? (
          list
        ) : (
          <>
            <Button
              variant="ghost"
              className="min-h-11 shrink-0 gap-2 self-start"
              onClick={() => {
                selection.current += 1
                setEditing({ kind: "none" })
                setGenerating(false)
              }}
            >
              <ArrowLeft className="size-4" /> All rounds
            </Button>
            {editorPane}
          </>
        )}
      </div>
    )
  }

  return (
    <div
      data-slot="round-crm"
      className="grid h-full min-h-0 grid-cols-[minmax(14rem,18rem)_1fr] gap-6"
    >
      {list}
      {editorPane}
    </div>
  )
}
