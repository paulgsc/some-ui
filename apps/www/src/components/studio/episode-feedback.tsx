/**
 * Feedback on an episode (SFEED6, #2745): under an episode's video, "Leave a
 * note here" catches the moment the video stands at and offers decision 7's
 * fixed categories; Studio's Feedback page lists every note kept. Reads
 * `lib/episode-feedback`'s snapshot, and steps its pure draft; every word is
 * its table's. Phone build only (`build.paths.ts`).
 */
import type { JSX, RefObject } from "react"
import { useReducer, useState, useSyncExternalStore } from "react"
import { dayOf, listed } from "@some-ui/core-utils"
import { Button, Notice } from "@some-ui/shared"
import { useQuery } from "@tanstack/react-query"

import { FEED_WORDS } from "@/lib/call-videos"
import type { Category, Note } from "@/lib/episode-feedback"
import {
  CATEGORY_WORDS,
  CLOSED,
  DESTINATION_WORDS,
  destinationsOf,
  episodeFeedback,
  FEEDBACK_WORDS,
  keepable,
  momentOf,
  noteOf,
  notesOn,
  SAID,
  SHOWN,
  step,
} from "@/lib/episode-feedback"
import type { HomeNotesOutcome } from "@/lib/episode-feedback/home-query"
import {
  episodeNotesMoved,
  homeNotesQuery,
  notesAnswered,
} from "@/lib/episode-feedback/home-query"
import type { Feed } from "@/lib/feeds"
import { FEED_FACTS } from "@/lib/studio-index"

const WORDS = FEEDBACK_WORDS

/** Every note kept on this phone, oldest first. */
const useEpisodeNotes = (): ReadonlyArray<Note> =>
  useSyncExternalStore(episodeFeedback.subscribe, episodeFeedback.getSnapshot)

const Choices = ({
  label,
  categories,
  picked,
  onToggle,
}: {
  label: string
  categories: ReadonlyArray<Category>
  picked: ReadonlyArray<Category>
  onToggle: (category: Category) => void
}): JSX.Element => (
  <fieldset className="flex flex-col gap-2">
    <legend className="text-sm font-medium">{label}</legend>
    <div className="flex flex-wrap gap-2">
      {categories.map((category) => {
        const on = picked.includes(category)
        return (
          <Button
            key={category}
            size="sm"
            variant={on ? "default" : "outline"}
            aria-pressed={on}
            onClick={() => onToggle(category)}
          >
            {CATEGORY_WORDS[category]}
          </Button>
        )
      })}
    </div>
  </fieldset>
)

/**
 * The note control under `feed`'s episode `episode`, reading the moment from
 * `video` when it opens.
 */
export const EpisodeNote = ({
  feed,
  episode,
  video,
}: {
  feed: Feed
  episode: string
  video: RefObject<HTMLVideoElement | null>
}): JSX.Element => {
  const [draft, dispatch] = useReducer(step, CLOSED)
  const [kept, setKept] = useState(0)
  const notes = notesOn(useEpisodeNotes(), feed, episode)
  const keep = (): void => {
    const note = noteOf(
      draft,
      { feed, episode },
      { id: crypto.randomUUID(), now: new Date() }
    )
    if (note === null) return
    const came = episodeFeedback.keep(note)
    dispatch({ type: "kept", came })
    if (came === "kept") setKept((n) => n + 1)
  }
  return (
    <div className="flex flex-col gap-2">
      {kept > 0 && (
        <Notice key={kept} onDismiss={() => setKept(0)}>
          {WORDS.keptHere}
        </Notice>
      )}
      <p className="text-muted-foreground text-sm">
        {WORDS.onThis(notes.length)}
      </p>
      {draft.kind === "closed" ? (
        <Button
          size="sm"
          variant="outline"
          onClick={() => {
            video.current?.pause()
            dispatch({
              type: "opened",
              atMs: momentOf(video.current?.currentTime ?? 0),
            })
          }}
        >
          {WORDS.leave}
        </Button>
      ) : (
        <section className="flex flex-col gap-3 rounded-lg border p-3">
          <h3 className="font-medium">{WORDS.at(draft.atMs)}</h3>
          <p className="text-muted-foreground text-sm">{WORDS.pick}</p>
          <Choices
            label={WORDS.said}
            categories={SAID}
            picked={draft.picked}
            onToggle={(category) => dispatch({ type: "toggled", category })}
          />
          <Choices
            label={WORDS.shown}
            categories={SHOWN}
            picked={draft.picked}
            onToggle={(category) => dispatch({ type: "toggled", category })}
          />
          {draft.refused !== null && (
            <Notice key={draft.refused} tone="danger">
              {WORDS.refused[draft.refused]}
            </Notice>
          )}
          <div className="flex gap-2">
            <Button size="sm" disabled={!keepable(draft)} onClick={keep}>
              {WORDS.keep}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => dispatch({ type: "cancelled" })}
            >
              {WORDS.cancel}
            </Button>
          </div>
        </section>
      )}
    </div>
  )
}

/** Where one note is, as home's list or the phone's last word from home says. */
type Place = (id: string) => string

/** What the page says of home, above the notes, when it can't list them. */
function homeLine(
  read: HomeNotesOutcome | undefined,
  failed: boolean
): string | null {
  if (failed) return WORDS.home.away
  if (read === undefined || read.kind === "read") return null
  return WORDS.home[read.kind]
}

/**
 * Studio's Feedback page's body: every note, the newest first, each with
 * where it is, or `none` when there is none.
 */
export const FeedbackNotes = ({ none }: { none: string }): JSX.Element => {
  const notes = useEpisodeNotes()
  const moved = useSyncExternalStore(
    episodeNotesMoved.subscribe,
    episodeNotesMoved.getSnapshot
  )
  const home = useQuery(homeNotesQuery(moved))
  if (notes.length === 0)
    return <p className="text-muted-foreground text-sm">{none}</p>
  const { held, refused } = notesAnswered()
  const storedAt =
    home.data?.kind === "read" ? home.data.storedAt : new Map<string, string>()
  const today = dayOf(new Date())
  const place: Place = (id) => {
    const at = storedAt.get(id)
    if (at !== undefined) return WORDS.onHome(at, today)
    if (held.has(id)) return WORDS.onHomeSent
    return refused.has(id) ? WORDS.notTaken : WORDS.onPhone
  }
  const line = homeLine(home.data, home.isError)
  return (
    <>
      <p className="text-muted-foreground text-sm">{WORDS.kept}</p>
      {line !== null && <p className="text-sm">{line}</p>}
      <FeedbackList notes={notes} place={place} />
    </>
  )
}

const FeedbackList = ({
  notes,
  place,
}: {
  notes: ReadonlyArray<Note>
  place: Place
}): JSX.Element => (
  <ul className="flex flex-col gap-2">
    {[...notes].reverse().map((note) => (
      <li
        key={note.id}
        className="bg-card border-border/60 flex flex-col gap-1 rounded-2xl border px-4 py-3"
      >
        <span className="text-base font-extrabold">
          {FEED_FACTS[note.feed].name} ·{" "}
          {FEED_WORDS[note.feed].label(note.episode)}
        </span>
        <span className="text-sm">
          {WORDS.at(note.atMs)}:{" "}
          {listed(note.categories.map((c) => CATEGORY_WORDS[c]))}
        </span>
        <span className="text-muted-foreground text-sm">
          {WORDS.goes}:{" "}
          {listed(
            destinationsOf(note.categories).map((d) => DESTINATION_WORDS[d])
          )}
        </span>
        <span className="text-muted-foreground text-xs">{place(note.id)}</span>
      </li>
    ))}
  </ul>
)
