import type { ChangeEvent, JSX } from "react"
import { useDeferredValue, useEffect, useMemo, useRef, useState } from "react"
import { LessonList } from "@lesson-crm/components/lesson-list"
import { LessonPreview } from "@lesson-crm/components/lesson-preview"
import { PromptCard } from "@lesson-crm/components/prompt-card"
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
import { Button, Input, Label, Textarea } from "@some-ui/shared"
import { ConversationPreview } from "@some-ui/topik"
import { Archive, ArchiveRestore, Save, Upload } from "lucide-react"

type LessonCrmProps = {
  client: LessonCrmClient
}

/** Which lesson the editor holds: none yet, a new one, or a stored one. */
type Editing =
  | { kind: "none" }
  | { kind: "new" }
  | { kind: "stored"; key: string }

const CHANGE_WORDS: Record<LessonChange, string> = {
  inserted: "Added to the manifest",
  contentChanged: "Saved as a new version: learners will hear about it",
  metadataChanged: "Saved: name, description or tags only, not news",
  unchanged: "Nothing changed",
}

const message = (error: unknown): string =>
  error instanceof Error ? error.message : String(error)

const upsert = (
  lessons: Array<OperatorLesson>,
  lesson: OperatorLesson
): Array<OperatorLesson> =>
  [...lessons.filter((other) => other.key !== lesson.key), lesson].sort(
    (a, b) => a.key.localeCompare(b.key)
  )

/**
 * The operator's lesson CRM: the lessons the server serves everyone, and the
 * weekly batch among them (canon Cor. 8.3).
 *
 * A lesson comes in as a model's reply or a lesson file, pasted or uploaded.
 * It goes through the same intake a learner's pasted lesson does, and what
 * is saved is the lesson as that intake leaves it (`lib/draft`). Retiring
 * takes a lesson out of the manifest without deleting it.
 *
 * LAN-only by build, not by access: this workspace's audience is `lan`, and
 * the server's operator routes are guarded by nothing but its origin
 * allowlist.
 */
export const LessonCrm = ({ client }: LessonCrmProps): JSX.Element => {
  const [lessons, setLessons] = useState<Array<OperatorLesson> | null>(null)
  const [editing, setEditing] = useState<Editing>({ kind: "none" })
  const [form, setForm] = useState<LessonForm>(EMPTY_FORM)
  const [tagsText, setTagsText] = useState("")
  const [text, setText] = useState("")
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState<{
    tone: "ok" | "error"
    text: string
  } | null>(null)
  // The one selection a lesson read may still land in: a slower read for a
  // lesson the operator has since clicked away from is dropped, not shown.
  const selection = useRef(0)

  useEffect(() => {
    let live = true
    client.list().then(
      (listed) => live && setLessons(listed),
      (error: unknown) => {
        if (!live) return
        setLessons([])
        setNotice({ tone: "error", text: message(error) })
      }
    )
    return (): void => {
      live = false
    }
  }, [client])

  const deferredText = useDeferredValue(text)
  const draft = useMemo(
    () =>
      editing.kind === "none" || deferredText.trim() === ""
        ? null
        : draftLesson(deferredText, form),
    [editing.kind, deferredText, form]
  )

  const stored =
    editing.kind === "stored"
      ? lessons?.find((lesson) => lesson.key === editing.key)
      : undefined
  const clashes =
    editing.kind === "new" &&
    lessons?.some((lesson) => lesson.key === form.key) === true

  const setFormAndTags = (next: LessonForm): void => {
    setForm(next)
    setTagsText(next.tags.join(", "))
  }

  const startNew = (): void => {
    selection.current += 1
    setEditing({ kind: "new" })
    setFormAndTags(EMPTY_FORM)
    setText("")
    setNotice(null)
  }

  const open = (key: string): void => {
    const lesson = lessons?.find((candidate) => candidate.key === key)
    if (!lesson) return
    const mine = ++selection.current
    setEditing({ kind: "stored", key })
    setFormAndTags(formFromLesson(lesson))
    setText("")
    setNotice(null)
    client.read(key).then(
      (body) => {
        if (selection.current === mine) setText(body)
      },
      (error: unknown) => {
        if (selection.current === mine) {
          setNotice({ tone: "error", text: message(error) })
        }
      }
    )
  }

  // A pasted reply may carry its own manifest entry; for a new lesson it
  // fills whatever the operator has left empty, and never overwrites.
  const takeText = (next: string): void => {
    setText(next)
    if (editing.kind === "new") setFormAndTags(fillForm(form, next))
  }

  const upload = (event: ChangeEvent<HTMLInputElement>): void => {
    const file = event.target.files?.[0]
    event.target.value = ""
    if (!file) return
    file
      .text()
      .then(takeText, (error: unknown) =>
        setNotice({ tone: "error", text: message(error) })
      )
  }

  const save = async (): Promise<void> => {
    if (!draft?.ok || clashes) return
    setBusy(true)
    try {
      const written = await client.write(draft.write.metadata.key, draft.write)
      setLessons((current) => upsert(current ?? [], written.lesson))
      selection.current += 1
      setEditing({ kind: "stored", key: written.lesson.key })
      setNotice({ tone: "ok", text: CHANGE_WORDS[written.change] })
    } catch (error) {
      setNotice({ tone: "error", text: message(error) })
    } finally {
      setBusy(false)
    }
  }

  const setListed = async (listed: boolean): Promise<void> => {
    if (!stored) return
    setBusy(true)
    try {
      const lesson = await (listed
        ? client.restore(stored.key)
        : client.retire(stored.key))
      setLessons((current) => upsert(current ?? [], lesson))
      setNotice({
        tone: "ok",
        text: listed
          ? "Back in the manifest"
          : "Retired: out of the manifest, still readable by learners part-way through it",
      })
    } catch (error) {
      setNotice({ tone: "error", text: message(error) })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div
      data-slot="lesson-crm"
      className="grid gap-6 md:grid-cols-[minmax(14rem,18rem)_1fr]"
    >
      {lessons === null ? (
        <p className="text-muted-foreground text-sm">Loading lessons…</p>
      ) : (
        <LessonList
          lessons={lessons}
          selected={editing.kind === "stored" ? editing.key : null}
          onSelect={open}
          onNew={startNew}
        />
      )}

      <section
        aria-label="Lesson editor"
        className="flex min-w-0 flex-col gap-4"
      >
        {notice && (
          <p
            role={notice.tone === "error" ? "alert" : "status"}
            className={
              notice.tone === "error"
                ? "text-destructive text-sm"
                : "text-success text-sm"
            }
          >
            {notice.text}
          </p>
        )}

        {editing.kind === "none" ? (
          <p className="text-muted-foreground text-sm">
            Pick a lesson to edit it, or start a new one.
          </p>
        ) : (
          <>
            {editing.kind === "new" && <PromptCard />}
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="flex flex-col gap-1">
                <Label htmlFor="lesson-key">Key</Label>
                <Input
                  id="lesson-key"
                  value={form.key}
                  readOnly={editing.kind === "stored"}
                  onChange={(event) =>
                    setForm({ ...form, key: event.target.value })
                  }
                  className="font-mono"
                />
                {clashes && (
                  <p role="alert" className="text-destructive text-xs">
                    A lesson with this key exists. Open it from the list to edit
                    it.
                  </p>
                )}
              </div>
              <div className="flex flex-col gap-1">
                <Label htmlFor="lesson-name">Name</Label>
                <Input
                  id="lesson-name"
                  value={form.displayName}
                  onChange={(event) =>
                    setForm({ ...form, displayName: event.target.value })
                  }
                />
              </div>
              <div className="flex flex-col gap-1 sm:col-span-2">
                <Label htmlFor="lesson-description">Description</Label>
                <Input
                  id="lesson-description"
                  value={form.description}
                  onChange={(event) =>
                    setForm({ ...form, description: event.target.value })
                  }
                />
              </div>
              <div className="flex flex-col gap-1 sm:col-span-2">
                <Label htmlFor="lesson-tags">
                  Tags (yours: relation tags are derived from the probes)
                </Label>
                <Input
                  id="lesson-tags"
                  value={tagsText}
                  placeholder="topik-3, makjang"
                  onChange={(event) => {
                    setTagsText(event.target.value)
                    setForm({ ...form, tags: parseTags(event.target.value) })
                  }}
                />
              </div>
            </div>

            <div className="flex flex-col gap-1">
              <div className="flex items-center justify-between gap-2">
                <Label htmlFor="lesson-text">
                  Lesson: a model&apos;s reply or a lesson file
                </Label>
                <label className="text-muted-foreground hover:text-foreground flex cursor-pointer items-center gap-1 text-xs">
                  <Upload className="size-3.5" /> Upload a file
                  <input
                    type="file"
                    accept=".json,.txt,.md,application/json,text/plain"
                    className="sr-only"
                    onChange={upload}
                  />
                </label>
              </div>
              <Textarea
                id="lesson-text"
                value={text}
                rows={12}
                placeholder="Paste the whole reply, JSON blocks and all"
                onChange={(event) => takeText(event.target.value)}
                className="font-mono text-xs"
              />
            </div>

            <LessonPreview draft={draft} />

            {draft?.ok && (
              <section
                aria-label="Conversation preview"
                className="flex flex-col gap-2"
              >
                <h3 className="text-muted-foreground text-xs font-medium tracking-wider uppercase">
                  What learners will read
                </h3>
                <ConversationPreview
                  // A different lesson starts the preview over.
                  key={editing.kind === "stored" ? editing.key : "new"}
                  batches={draft.intake.batches}
                />
              </section>
            )}

            <div className="flex flex-wrap gap-2">
              <Button
                className="gap-2"
                disabled={busy || !draft?.ok || clashes}
                onClick={() => void save()}
              >
                <Save className="size-4" /> Save
              </Button>
              {stored &&
                (stored.retiredAt === null ? (
                  <Button
                    variant="outline"
                    className="gap-2"
                    disabled={busy}
                    onClick={() => void setListed(false)}
                  >
                    <Archive className="size-4" /> Retire
                  </Button>
                ) : (
                  <Button
                    variant="outline"
                    className="gap-2"
                    disabled={busy}
                    onClick={() => void setListed(true)}
                  >
                    <ArchiveRestore className="size-4" /> Restore
                  </Button>
                ))}
            </div>
            {stored && (
              <p className="text-muted-foreground text-xs">
                Version {stored.version}, published {stored.publishedAt}
                {stored.retiredAt ? `, retired ${stored.retiredAt}` : ""}
              </p>
            )}
          </>
        )}
      </section>
    </div>
  )
}
