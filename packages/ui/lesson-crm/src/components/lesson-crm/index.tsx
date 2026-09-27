import type { JSX, ReactNode } from "react"
import { useEffect, useMemo, useRef, useState } from "react"
import { LessonActions } from "@lesson-crm/components/lesson-actions"
import { LessonCheck } from "@lesson-crm/components/lesson-check"
import { LessonDetails } from "@lesson-crm/components/lesson-details"
import { LessonList } from "@lesson-crm/components/lesson-list"
import { LessonSourcePane } from "@lesson-crm/components/lesson-source"
import {
  PaneTabBar,
  useShowOnScrollUp,
} from "@lesson-crm/components/pane-tab-bar"
import { PromptCard } from "@lesson-crm/components/prompt-card"
import { StepRail } from "@lesson-crm/components/step-rail"
import type {
  LessonChange,
  LessonCrmClient,
  LessonWrite,
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
import { useIsMobile } from "some-ui-utils"

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
 * LAN-only by build, not by access: this workspace's audience is `lan`, and
 * the server's operator routes are guarded by nothing but its origin
 * allowlist.
 */
export const LessonCrm = ({
  client,
  reporting,
}: LessonCrmProps): JSX.Element => {
  const isMobile = useIsMobile()
  const [lessons, setLessons] = useState<Array<OperatorLesson>>([])
  const [editing, setEditing] = useState<Editing>({ kind: "none" })
  const [pane, setPane] = useState<Pane>("lessons")
  const [form, setForm] = useState<LessonForm>(EMPTY_FORM)
  const [tagsText, setTagsText] = useState("")
  const [source, setSource] = useState<LessonSource | null>(null)
  // The one selection a lesson read may still land in: a slower read for a
  // lesson the operator has since moved away from is dropped, not shown.
  const selection = useRef(0)
  const scope = useRef<HTMLDivElement | null>(null)

  const load = useOperation(
    async (): Promise<Array<OperatorLesson>> => {
      const listed = await client.list()
      setLessons(listed)
      return listed
    },
    { success: () => null, failure: () => "Couldn't load the lessons" },
    reporting
  )
  const { start: startLoad } = load
  useEffect(() => startLoad(undefined), [client, startLoad])

  const read = useOperation(
    async ({ key, token }: { key: string; token: number }): Promise<string> => {
      const body = await client.read(key)
      if (selection.current === token) {
        setSource(sourceFromText(body, "stored", `${key}.json`))
      }
      return body
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
    setForm(next)
    setTagsText(next.tags.join(", "))
  }

  // A pasted reply may carry its own manifest entry; for a new lesson it
  // fills whatever the operator has left empty, and never overwrites.
  const take = (next: LessonSource): void => {
    setSource(next)
    if (editing.kind === "new") setFormAndTags(fillForm(form, next.text))
  }

  const readFile = useOperation(
    async (file: File): Promise<LessonSource> => {
      const next = await sourceFromFile(file)
      take(next)
      return next
    },
    {
      success: () => null,
      failure: (file) => `Couldn't read ${file.name}`,
    },
    reporting
  )

  const pasteClipboard = useOperation(
    async (): Promise<string> => {
      const text = await navigator.clipboard.readText()
      if (text.trim() === "") throw new Error("The clipboard is empty.")
      take(sourceFromText(text, "pasted"))
      return text
    },
    {
      success: () => null,
      failure: () => "Couldn't paste from the clipboard",
    },
    reporting
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

  const save = useOperation(
    async (write: LessonWrite) => {
      const written = await client.write(write.metadata.key, write)
      setLessons((current) => upsert(current, written.lesson))
      selection.current += 1
      setEditing({ kind: "stored", key: written.lesson.key })
      return written
    },
    {
      success: (written) => CHANGE_WORDS[written.change](written.lesson.key),
      failure: (write) => `Couldn't save ${write.metadata.key}`,
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
    const next: Editing = { kind: "new" }
    setEditing(next)
    setFormAndTags(EMPTY_FORM)
    setSource(null)
    setPane(landingPane(next))
  }

  const open = (key: string): void => {
    const lesson = lessons.find((candidate) => candidate.key === key)
    if (!lesson) return
    const token = ++selection.current
    const next: Editing = { kind: "stored", key }
    setEditing(next)
    setFormAndTags(formFromLesson(lesson))
    setSource(null)
    setPane(landingPane(next))
    read.start({ key, token })
  }

  const panes = editorPanes(editing)
  const canSave = draft?.ok === true && !clashes

  const actions = (
    <LessonActions
      save={save.state}
      listing={listing.state}
      canSave={canSave}
      onSave={() => {
        if (draft?.ok && !clashes) save.start(draft.write)
      }}
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
        onText={(text) => take(sourceFromText(text, "pasted"))}
        onFile={(file) => readFile.start(file)}
        onClear={() => setSource(null)}
        onPasteButton={() => pasteClipboard.start(undefined)}
        canReadClipboard={canReadClipboard()}
      />
    ),
    details: (
      <LessonDetails
        form={form}
        tagsText={tagsText}
        keyLocked={editing.kind === "stored"}
        clashes={clashes}
        onForm={setForm}
        onTags={(typed) => {
          setTagsText(typed)
          setForm({ ...form, tags: parseTags(typed) })
        }}
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
