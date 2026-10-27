/**
 * @vitest-environment jsdom
 *
 * KR1 (`@some-ui/vite-config/vitest/kept-records`) over topik's kept stores,
 * on the in-memory storage the viewer's build installs as the page's own.
 */

import { inMemoryStorage } from "@some-ui/core-utils"
import type {
  KeptHandle,
  KeptStore,
} from "@some-ui/vite-config/vitest/kept-records"
import { describeKeptRecords } from "@some-ui/vite-config/vitest/kept-records"
import {
  createLastDramaStore,
  LAST_DRAMA_KEY,
} from "@topik/lib/topik/adapter/last-drama-store"
import {
  createLensRecordStore,
  LENS_RECORD_KEY,
  lensRecordForExport,
} from "@topik/lib/topik/adapter/lens-record-store"
import {
  createPastedLessonStore,
  PASTED_LESSON_KEY,
} from "@topik/lib/topik/adapter/pasted-lesson"
import { createPortionOrderStore } from "@topik/lib/topik/adapter/portion-order"
import {
  createReadAloudStore,
  READ_ALOUD_STORAGE_KEYS,
} from "@topik/lib/topik/adapter/read-aloud-store"
import {
  createServedPointStore,
  SERVED_DRAMA_POINT_KEY,
} from "@topik/lib/topik/adapter/tree-feed"
import { workedLesson } from "@topik/lib/topik/generation/tree-intake/worked-example"
import type { SetProgress } from "@topik/lib/topik/read-aloud/set-machine"
import { noteShown } from "@topik/lib/topik/read-aloud/tally"

const AT = "2026-10-26T09:00:00.000Z"

const PROGRESS: SetProgress = {
  queue: [
    {
      role: "rep",
      item: {
        kind: "word",
        key: "w:juda:주세요",
        wordId: "juda",
        text: "주세요",
        lineId: "cafe-order",
        syllables: 3,
      },
    },
  ],
  returns: {},
  counted: 1,
  reported: false,
}

const stores: ReadonlyArray<KeptStore> = [
  {
    name: "the read-aloud pace book",
    key: READ_ALOUD_STORAGE_KEYS.paces,
    older: '{"juda":{"ms":900}}',
    open: (storage): KeptHandle => {
      const store = createReadAloudStore(storage)
      return {
        write: (): void => {
          store.savePace("juda", { factor: 1.2, seen: 1 })
        },
        read: (): unknown => store.paces(),
      }
    },
  },
  {
    name: "the read-aloud practice record",
    key: READ_ALOUD_STORAGE_KEYS.record,
    older: '{"reps":12}',
    open: (storage): KeptHandle => {
      const store = createReadAloudStore(storage)
      return {
        write: (): unknown => store.count({ type: "set" }, "2026-10-26"),
        read: (): unknown => store.record(),
      }
    },
  },
  {
    name: "the read-aloud set left unfinished",
    key: READ_ALOUD_STORAGE_KEYS.progress,
    older: '{"version":1,"level":1,"progress":{"queue":[]}}',
    open: (storage): KeptHandle => {
      const store = createReadAloudStore(storage)
      return {
        write: (): void => {
          store.saveProgress(1, "deck-1", PROGRESS)
        },
        read: (): unknown => store.progress(1, "deck-1"),
      }
    },
  },
  {
    name: "the read-aloud word sets added",
    key: READ_ALOUD_STORAGE_KEYS.sets,
    older: '[{"deck":{"id":"everyday-1"},"addedAt":"2026-10-01"}]',
    open: (storage): KeptHandle => {
      const store = createReadAloudStore(storage)
      return {
        write: (): void => {
          store.saveSets([
            {
              deck: {
                id: "everyday-2",
                title: "Everyday",
                from: "your note",
                words: [{ id: "juda", lemma: "주다", gloss: "give" }],
                lines: [
                  {
                    id: "give",
                    level: 2,
                    korean: "주세요.",
                    english: "Please give it to me.",
                    words: [{ wordId: "juda", surface: "주세요", stemEnd: 1 }],
                  },
                ],
              },
              addedAt: AT,
              openedAt: null,
            },
          ])
        },
        read: (): unknown => store.sets(),
      }
    },
  },
  {
    name: "the read-aloud answers",
    key: READ_ALOUD_STORAGE_KEYS.feedback,
    older: '{"tooEasy":true}',
    open: (storage): KeptHandle => {
      const store = createReadAloudStore(storage)
      return {
        write: (): unknown =>
          store.saveFeedback({ tooEasy: { at: AT }, tooManyRepeats: null }),
        read: (): unknown => store.feedback(),
      }
    },
  },
  {
    name: "the read-aloud tally",
    key: READ_ALOUD_STORAGE_KEYS.tally,
    older: '{"version":1,"rows":{"s:a":{"shown":"once"}}}',
    open: (storage): KeptHandle => {
      const store = createReadAloudStore(storage)
      return {
        write: (): unknown =>
          store.saveTally(noteShown(store.tally(), "s:a", AT)),
        read: (): unknown => store.tally(),
      }
    },
  },
  {
    name: "the grammar lens record",
    key: LENS_RECORD_KEY,
    older: '{"version":2,"entries":[]}',
    open: (storage): KeptHandle => ({
      write: (): void => {
        createLensRecordStore(storage).add({
          session: "s1",
          line: "school",
          shownAt: AT,
          closedAt: AT,
          cue: null,
          shape: "judge-authored",
          answer: "looks right",
          right: true,
          expired: false,
          shown: [],
          chosen: null,
          answerMs: 4000,
          rushed: false,
          racing: false,
          stepDown: null,
          situation: null,
          take: null,
        })
      },
      read: (): unknown => lensRecordForExport(storage),
    }),
  },
  {
    name: "the last drama played",
    key: LAST_DRAMA_KEY,
    older: '{"version":0,"last":{}}',
    refusedWriteRemoves:
      "a refused save is one prompt's history lost, and the one before it is another play's",
    open: (storage): KeptHandle => {
      const store = createLastDramaStore(storage, () => 2)
      return {
        write: (): void => {
          store.save({
            lessonId: "first-tea",
            content: "x",
            level: 2,
            title: "회장님 댁 거실",
            at: 1,
            scenes: [{ id: "s1", place: "회장님 댁 거실", feeling: "tension" }],
            tries: [],
          })
        },
        read: (): unknown => store.get(),
      }
    },
  },
  {
    name: "where the served tree played last",
    key: SERVED_DRAMA_POINT_KEY,
    older: '{"point":{"route":["a"]}}',
    open: (storage): KeptHandle => {
      const store = createServedPointStore(storage)
      return {
        write: (): void => {
          store.set("first-tea", { route: ["a"] })
        },
        read: (): unknown => store.get("first-tea"),
      }
    },
  },
  {
    name: "the lesson pasted this session",
    key: PASTED_LESSON_KEY,
    area: "sessionStorage",
    older: '{"version":1,"kind":"conversation"}',
    refusedWriteRemoves:
      "the slot holds the newest paste or nothing, so a reload never brings back the one it replaced",
    replacesUnreadable: "one slot, held for the session: a paste replaces it",
    open: (storage): KeptHandle => {
      const store = createPastedLessonStore(storage)
      return {
        write: (): void => {
          store.setTree(workedLesson())
        },
        read: (): unknown => store.getTree(),
      }
    },
  },
  {
    name: "the last portion asked for",
    key: "topik:portion-order",
    older: '{"version":1,"portion":"feast"}',
    open: (storage): KeptHandle => {
      const store = createPortionOrderStore(storage)
      return {
        write: (): void => {
          store.save({ portion: "meal", freshness: "new" })
        },
        read: (): unknown => store.last(),
      }
    },
  },
]

describeKeptRecords(stores, () => inMemoryStorage())
