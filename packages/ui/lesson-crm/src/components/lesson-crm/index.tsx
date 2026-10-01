import type { JSX, ReactNode } from "react"
import { useEffect, useMemo, useRef, useState } from "react"
import { LessonActions } from "@lesson-crm/components/lesson-actions"
import { LessonCheck } from "@lesson-crm/components/lesson-check"
import { LessonDetails } from "@lesson-crm/components/lesson-details"
import { LessonList } from "@lesson-crm/components/lesson-list"
import { LessonSourcePane } from "@lesson-crm/components/lesson-source"
import { PaneTabBar } from "@lesson-crm/components/pane-tab-bar"
import { PromptCard } from "@lesson-crm/components/prompt-card"
import { StepRail } from "@lesson-crm/components/step-rail"
import type {
  LessonChange,
  LessonCrmClient,
  OperatorLesson,
} from "@lesson-crm/lib/client"
import type { LessonForm } from "@lesson-crm/lib/draft"
import {
  draftLesson,
  EMPTY_FORM,
  fillForm,
  formFromLesson,
  parseTags,
} from "@lesson-crm/lib/draft"
import type { Reporting } from "@lesson-crm/lib/operation"
import { useOperation } from "@lesson-crm/lib/operation"
import type { Editing, Pane } from "@lesson-crm/lib/panes"
import { editorPanes, landingPane } from "@lesson-crm/lib/panes"
import type { LessonSource } from "@lesson-crm/lib/source"
import { sourceFromFile, sourceFromText } from "@lesson-crm/lib/source"
import { Button } from "@some-ui/shared"
import { ConversationPreview } from "@some-ui/topik"
import { useIsMobile, useShowOnScrollUp } from "some-ui-utils"

type LessonCrmProps = {
  client: LessonCrmClient
  /**
   * How outcomes are shown, and how the client's errors read: the host's
   * toaster and error mapping (`apps/www`: `sonner`, `mapFileHostError`).
   * Required - a failure the operator never hears about is not an option.
   */
  reporting: Reporting
}

const CHANGE_WORDS: Record<LessonChange, (key: string) => string> = {
  inserted: (key) => `${key} added to the manifest`,
  contentChanged: (key) =>
    `${key} saved as a new version: learners will hear about it`,
  metadataChanged: (key) =>
    `${key} saved: name, description or tags only, not news`,
  unchanged: (key) => `${key}: nothing changed`,
}

const upsert = (
  lessons: Array<OperatorLesson>,
  lesson: OperatorLesson
): Array<OperatorLesson> =>
  [...lessons.filter((other) => other.key !== lesson.key), lesson].sort(
    (a, b) => a.key.localeCompare(b.key)
  )

// The clipboard API exists only in a secure context; a LAN page on plain
// http:// has none, and the paste box is the way in there.
const canReadClipboard = (): boolean =>
  typeof window !== "undefined" && window.isSecureContext

/**
 * The operator's lesson CRM: the lessons the server serves everyone, and the
 * weekly batch among them (canon Cor. 8.3).
 *
 * One concern per pane (`lib/panes`), so nothing grows with anything else: a
 * pasted lesson is a file, not a column of text; the preview and the
 * findings take the box they are given. On a phone the panes are tabs along
 * the bottom; on a wide screen they are the steps of a wizard - the session
 * composer's shape - with the lesson list as a rail beside it.
 *
 * Every action is an intent the operator hears about (`lib/operation`):
 * its control holds while it runs, and it ends in a toast either way.
 *
 * What finishes later never lands on an editor that has moved on:
 * - A source (paste, upload, clipboard, the read opening a lesson starts,
 *   Remove) claims one shared turn; only the latest turn's result lands, and
 *   nothing is saved while that latest source is still on its way.
 * - A save writes what the editor holds when it runs (a Retry included),
 *   holds the key while it runs, and makes the editor the saved lesson only
 *   if it still holds the selection it started from. Nothing is saved before
 *   the list has loaded, since a new key can't be checked until it has.
 *
 * LAN-only by build: this workspace's audience is `lan`. The server's
 * operator routes answer only a passkey session whose subject is in
 * `OPERATOR_SUBJECTS` (401 without a session, 403 for anyone else).
 */
export const LessonCrm = ({
  client,
  reporting,
}: LessonCrmProps): JSX.Element => {
  const isMobile = useIsMobile()
  const [lessons, setLessons] = useState<Array<OperatorLesson>>([])
  const [editing, setEditing] = useState<Editing>({ kind: "none" })
  const [pane, setPane] = useState<Pane>("lessons")
  // The entry and its tags as typed, together, so a fill from a paste is a
  // pure update of whatever is current - never of a copy taken earlier.
  const [entry, setEntry] = useState<{ form: LessonForm; tagsText: string }>({
    form: EMPTY_FORM,
    tagsText: "",
  })
  const { form, tagsText } = entry
  const [source, setSource] = useState<LessonSource | null>(null)
  // Which lesson the editor holds, as a number that changes every time it
  // does. A save carries the value it started with, and moves the editor to
  // what it saved only if it still matches.
  const selection = useRef(0)
  // Which request for the source is the latest, as a number every change of
  // source advances: a paste, an upload, a clipboard read, Remove, and the
  // server read that opening a lesson starts (a new selection clears the
  // source, so it advances this too). One number for all of them, so no
  // path's late result can land over another's newer one; each async result
  // lands only if its turn is still the latest.
  const sourceTurn = useRef(0)
  // Whether the latest source asked for is still on its way. Nothing is
  // saved meanwhile: the source on show is no longer the operator's choice.
  const [sourcePending, setSourcePending] = useState(false)
  const claimSource = (pending: boolean): number => {
    setSourcePending(pending)
    return ++sourceTurn.current
  }
  /** Ends the wait for a source, if `turn` is still the one waited for. */
  const settleSource = (turn: number): void => {
    if (sourceTurn.current === turn) setSourcePending(false)
  }
  const scope = useRef<HTMLDivElement | null>(null)

  // Whether the list has loaded at least once. Until it has, a new lesson's
  // key can't be checked against the others, so nothing is saved.
  const [indexed, setIndexed] = useState(false)
  const load = useOperation(
    async (): Promise<Array<OperatorLesson>> => {
      const listed = await client.list()
      setLessons(listed)
      setIndexed(true)
      return listed
    },
    { success: () => null, failure: () => "Couldn't load the lessons" },
    reporting
  )
  const { start: startLoad } = load
  useEffect(() => startLoad(undefined), [client, startLoad])

  const read = useOperation(
    async ({ key, turn }: { key: string; turn: number }): Promise<string> => {
      try {
        const body = await client.read(key)
        if (sourceTurn.current === turn) {
          setSource(sourceFromText(body, "stored", `${key}.json`))
        }
        return body
      } finally {
        settleSource(turn)
      }
    },
    {
      success: () => null,
      failure: ({ key }) => `Couldn't open ${key}`,
    },
    reporting,
    // A new selection is a new read, not a double click.
    "supersede"
  )

  const setFormAndTags = (next: LessonForm): void => {
    setEntry({ form: next, tagsText: next.tags.join(", ") })
  }

  // A pasted reply may carry its own manifest entry; for a new lesson it
  // fills whatever the operator has left empty, and never overwrites.
  // Dropped if any newer source was asked for since this one started.
  const take = (next: LessonSource, turn: number): void => {
    if (sourceTurn.current !== turn) return
    setSource(next)
    if (editing.kind === "new") {
      setEntry((current) => {
        const filled = fillForm(current.form, next.text)
        return { form: filled, tagsText: filled.tags.join(", ") }
      })
    }
  }

  const readFile = useOperation(
    async ({ file, turn }: { file: File; turn: number }) => {
      try {
        const next = await sourceFromFile(file)
        take(next, turn)
        return next
      } finally {
        settleSource(turn)
      }
    },
    {
      success: () => null,
      failure: ({ file }) => `Couldn't read ${file.name}`,
    },
    reporting,
    // A new file is a new request, not a double click.
    "supersede"
  )

  const pasteClipboard = useOperation(
    async (turn: number): Promise<string> => {
      try {
        const text = await navigator.clipboard.readText()
        if (text.trim() === "") throw new Error("The clipboard is empty.")
        take(sourceFromText(text, "pasted"), turn)
        return text
      } finally {
        settleSource(turn)
      }
    },
    {
      success: () => null,
      failure: () => "Couldn't paste from the clipboard",
    },
    reporting,
    "supersede"
  )

  const draft = useMemo(
    () =>
      editing.kind === "none" || source === null
        ? null
        : draftLesson(source.text, form),
    [editing.kind, source, form]
  )

  const stored =
    editing.kind === "stored"
      ? lessons.find((lesson) => lesson.key === editing.key)
      : undefined
  const clashes =
    editing.kind === "new" && lessons.some((lesson) => lesson.key === form.key)

  const canSave = draft?.ok === true && !clashes && !sourcePending && indexed

  // A save takes nothing from the click that started it: it writes what the
  // editor holds when it runs. `useOperation` runs the latest closure, so a
  // failed save's Retry saves the editor as it is now, exactly as pressing
  // Save again would - never a write captured before the operator edited.
  const save = useOperation(
    async () => {
      if (!canSave) {
        throw new Error("The lesson no longer checks out: see Check.")
      }
      const token = selection.current
      const written = await client.write(draft.write.metadata.key, draft.write)
      setLessons((current) => upsert(current, written.lesson))
      // The list always learns of the save; the editor follows it only if it
      // still holds the lesson that was saved.
      if (selection.current === token) {
        selection.current += 1
        setEditing({ kind: "stored", key: written.lesson.key })
      }
      return written
    },
    {
      success: (written) => CHANGE_WORDS[written.change](written.lesson.key),
      // The key is held while a save runs, so it is still the one written.
      failure: () => `Couldn't save ${form.key}`,
    },
    reporting
  )

  const listing = useOperation(
    async ({ key, listed }: { key: string; listed: boolean }) => {
      const lesson = await (listed ? client.restore(key) : client.retire(key))
      setLessons((current) => upsert(current, lesson))
      return lesson
    },
    {
      success: (lesson, { listed }) =>
        listed
          ? `${lesson.key} is back in the manifest`
          : `${lesson.key} retired: out of the manifest, still readable by learners part-way through it`,
      failure: ({ key, listed }) =>
        `Couldn't ${listed ? "restore" : "retire"} ${key}`,
    },
    reporting
  )

  const startNew = (): void => {
    selection.current += 1
    claimSource(false)
    const next: Editing = { kind: "new" }
    setEditing(next)
    setFormAndTags(EMPTY_FORM)
    setSource(null)
    setPane(landingPane(next))
  }

  const open = (key: string): void => {
    const lesson = lessons.find((candidate) => candidate.key === key)
    if (!lesson) return
    selection.current += 1
    const turn = claimSource(true)
    const next: Editing = { kind: "stored", key }
    setEditing(next)
    setFormAndTags(formFromLesson(lesson))
    setSource(null)
    setPane(landingPane(next))
    read.start({ key, turn })
  }

  const panes = editorPanes(editing)

  const actions = (
    <LessonActions
      save={save.state}
      listing={listing.state}
      canSave={canSave}
      onSave={() => save.start(undefined)}
      stored={stored}
      onListed={(listed) => {
        if (stored) listing.start({ key: stored.key, listed })
      }}
    />
  )

  const list = (
    <LessonList
      lessons={lessons}
      loading={load.state}
      selected={editing.kind === "stored" ? editing.key : null}
      onSelect={open}
      onNew={startNew}
      onReload={() => startLoad(undefined)}
    />
  )

  const contents: Record<Exclude<Pane, "lessons">, ReactNode> = {
    prompt: <PromptCard reporting={reporting} />,
    lesson: (
      <LessonSourcePane
        source={source}
        draft={draft}
        onText={(text) =>
          take(sourceFromText(text, "pasted"), claimSource(false))
        }
        onFile={(file) => readFile.start({ file, turn: claimSource(true) })}
        onClear={() => {
          claimSource(false)
          setSource(null)
        }}
        onPasteButton={() => pasteClipboard.start(claimSource(true))}
        canReadClipboard={canReadClipboard()}
      />
    ),
    details: (
      <LessonDetails
        form={form}
        tagsText={tagsText}
        // A key is the lesson's identity: fixed once stored, and held while
        // a save is on its way, so the save lands on the key it wrote.
        keyLocked={editing.kind === "stored" || save.state.status === "working"}
        clashes={clashes}
        onForm={(next) => setEntry((current) => ({ ...current, form: next }))}
        onTags={(typed) =>
          setEntry((current) => ({
            form: { ...current.form, tags: parseTags(typed) },
            tagsText: typed,
          }))
        }
      />
    ),
    preview: draft?.ok ? (
      <ConversationPreview
        // A different lesson starts the preview over.
        key={editing.kind === "stored" ? editing.key : "new"}
        batches={draft.intake.batches}
      />
    ) : (
      <p className="text-muted-foreground text-sm">
        {draft
          ? "Nothing to preview until the lesson checks out: see Check."
          : "Nothing to preview yet: bring in a lesson first."}
      </p>
    ),
    check: (
      <LessonCheck draft={draft} actions={isMobile ? actions : undefined} />
    ),
  }

  // Every pane stays mounted and only the current one shows, so switching
  // away from the prompt does not forget its level, nor the preview its place.
  const paneBody = (shown: Pane, all: Array<Pane>): JSX.Element => (
    <>
      {all.map((candidate) => (
        <div
          key={candidate}
          id={`lesson-pane-${candidate}`}
          role={isMobile ? "tabpanel" : "region"}
          aria-labelledby={isMobile ? `lesson-tab-${candidate}` : undefined}
          aria-label={isMobile ? undefined : candidate}
          hidden={candidate !== shown}
          className="h-full min-h-0"
        >
          {candidate === "lessons" ? list : contents[candidate]}
        </div>
      ))}
    </>
  )

  const barShown = useShowOnScrollUp(scope, pane)

  if (isMobile) {
    const tabs: Array<Pane> = [
      "lessons",
      ...(editing.kind === "none" ? editorPanes({ kind: "new" }) : panes),
    ]
    const current = tabs.includes(pane) ? pane : "lessons"
    return (
      <div
        ref={scope}
        data-slot="lesson-crm"
        className="flex h-full min-h-0 flex-col"
      >
        <div className="min-h-0 flex-1 pb-2">{paneBody(current, tabs)}</div>
        <PaneTabBar
          panes={tabs}
          current={current}
          disabled={(candidate) =>
            candidate !== "lessons" && editing.kind === "none"
          }
          shown={barShown}
          onPane={setPane}
        />
      </div>
    )
  }

  const step = panes.includes(pane) ? pane : (panes[0] ?? "lessons")
  const at = panes.indexOf(step)
  return (
    <div
      ref={scope}
      data-slot="lesson-crm"
      className="grid h-full min-h-0 grid-cols-[minmax(14rem,18rem)_1fr] gap-6"
    >
      {list}
      <section
        aria-label="Lesson editor"
        className="flex min-h-0 min-w-0 flex-col gap-4"
      >
        {editing.kind === "none" ? (
          <p className="text-muted-foreground text-sm">
            Pick a lesson to edit it, or start a new one.
          </p>
        ) : (
          <>
            <StepRail steps={panes} current={step} onStep={setPane} />
            <div className="min-h-0 flex-1">{paneBody(step, panes)}</div>
            <div className="flex shrink-0 items-center justify-between gap-2 border-t pt-4">
              <Button
                variant="outline"
                disabled={at <= 0}
                onClick={() => setPane(panes[at - 1] ?? step)}
              >
                Back
              </Button>
              {at < panes.length - 1 ? (
                <Button onClick={() => setPane(panes[at + 1] ?? step)}>
                  Continue
                </Button>
              ) : (
                actions
              )}
            </div>
          </>
        )}
      </section>
    </div>
  )
}
