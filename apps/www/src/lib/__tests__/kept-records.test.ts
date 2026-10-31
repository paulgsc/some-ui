/**
 * @vitest-environment jsdom
 *
 * KR1 (`@some-ui/vite-config/vitest/kept-records`) over www's kept stores,
 * with the viewer's storage installed by the module the Pages build runs
 * first (`lib/demo/viewer-storage`). The takes desks, the scene's voice notes
 * and LeetType's spoken notes keep their lists through `boundedList`, run
 * here as one; the activity packages run their own stores the same way.
 */

import type { KeyedStorage } from "@some-ui/core-utils"
import type {
  KeptHandle,
  KeptStore,
} from "@some-ui/vite-config/vitest/kept-records"
import { describeKeptRecords } from "@some-ui/vite-config/vitest/kept-records"
import { vi } from "vitest"

import { browserPorts } from "@/lib/authority/singleton"
import { boundedList } from "@/lib/bounded-list"
import { readSent, rememberSent } from "@/lib/home-link/sent"
import {
  readDurableFailure,
  writeDurableFailure,
} from "@/lib/intent/durable-failure"
import { readDrafts, writeDrafts } from "@/lib/jobs/drafts"
import { EMPTY } from "@/lib/jobs/model"
import { openStored, writeStored } from "@/lib/jobs/stored"
import type { Stop } from "@/lib/session-stop"
import { allPathCounts, allStops, storeEffect } from "@/lib/session-stop"
import {
  createProfileRepository,
  DEFAULT_PROFILE,
} from "@/lib/tenant/profile-repository"
import { createSessionsRepository } from "@/lib/tenant/sessions-repository"
import {
  createSettingsRepository,
  DEFAULT_SETTINGS,
} from "@/lib/tenant/settings-repository"
import { NotKeptError } from "@/lib/tenant/storage"

const viewer = vi.hoisted(() => ({ build: false }))

vi.mock("@/lib/data-mode", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  get VIEWER_BUILD(): boolean {
    return viewer.build
  },
}))

/** A refused write is said with `NotKeptError`; anything else is a fault. */
async function kept(write: () => Promise<unknown>): Promise<unknown> {
  try {
    return await write()
  } catch (error) {
    if (error instanceof NotKeptError) return false
    throw error
  }
}

const STOP: Stop = {
  sessionId: "s1",
  stoppedAt: "2026-10-26T09:00:00.000Z",
  elapsedMs: 60_000,
  plannedMs: 600_000,
  scene: null,
  via: "tap",
  reason: "break",
  reasonFrom: "stop",
  outcome: "open",
  settledAt: null,
}

const isNumber = (value: unknown): value is number => typeof value === "number"

const stores: ReadonlyArray<KeptStore> = [
  {
    name: "the device's study sessions",
    key: "some-ui.tenant.sessions.v1",
    older: '[{"id":"s1","title":"a session before #519"}]',
    open: (storage): KeptHandle => {
      const repository = createSessionsRepository(storage, 0)
      return {
        write: (): unknown =>
          kept(() =>
            repository.create({
              name: "Reading",
              activities: [],
              scenes: [],
              layoutMode: "basic",
            })
          ),
        read: (): unknown => repository.list(),
      }
    },
  },
  {
    name: "the device's settings",
    key: "some-ui.tenant.settings.v1",
    older: '["not", "settings"]',
    open: (storage): KeptHandle => {
      const repository = createSettingsRepository(storage, 0)
      return {
        write: (): unknown =>
          kept(() =>
            repository.save({ ...DEFAULT_SETTINGS, deviceVoiceId: "ko-kr" })
          ),
        read: (): unknown => repository.get(),
      }
    },
  },
  {
    name: "the device's profile",
    key: "some-ui.tenant.profile.v1",
    older: '"You"',
    open: (storage): KeptHandle => {
      const repository = createProfileRepository(storage, 0)
      return {
        write: (): unknown =>
          kept(() => repository.save({ ...DEFAULT_PROFILE, avatar: "🦉" })),
        read: (): unknown => repository.get(),
      }
    },
  },
  {
    name: "the Jobs record",
    key: "some-ui:jobs",
    older: '{"v":0,"digests":[]}',
    open: (storage): KeptHandle => ({
      write: (): unknown =>
        openStored(storage).kind !== "unreadable" &&
        writeStored(storage, { ...EMPTY, carried: { "pick-1": 1 } }),
      read: (): unknown => openStored(storage),
    }),
  },
  {
    name: "the Jobs drafts",
    key: "some-ui:jobs:drafts",
    older: '{"2026-10-26/p1/fit":{"form":"retired"}}',
    open: (storage): KeptHandle => ({
      write: (): unknown => {
        const { drafts, writable } = readDrafts(storage)
        return (
          writable &&
          writeDrafts(storage, {
            ...drafts,
            "2026-10-26/p1/fit": { form: "fit", note: "Good fit" },
          })
        )
      },
      read: (): unknown => readDrafts(storage).drafts,
    }),
  },
  {
    name: "what this phone sent home",
    key: "some-ui.home.sent.v1",
    older: '{"sessions":{"s1":"h1"}}',
    partly:
      '{"pairing":"p1","sessions":{"s1":{"hash":"older"}},"shelf":{},"refused":{},"leetype":{}}',
    open: (storage): KeptHandle => ({
      write: (): unknown =>
        rememberSent(storage, readSent(storage, "p1"), {
          sessions: { s1: "h1" },
        }),
      read: (): unknown => readSent(storage, "p1"),
    }),
  },
  {
    name: "the data authority chosen",
    key: "some-ui.authority.v1",
    older: '"account"',
    open: (storage): KeptHandle => {
      const ports = browserPorts(storage)
      return {
        write: (): void => {
          ports.writeChoice("account")
        },
        read: (): unknown => ports.readChoice(),
      }
    },
  },
  {
    name: "an autosave failure",
    key: "some-ui:autosave-failure:s1",
    older: '{"kind":"unreachable"}',
    open: (): KeptHandle => ({
      write: (): void => {
        writeDurableFailure("s1", { kind: "unreachable", summary: "Offline" })
      },
      read: (): unknown => readDurableFailure("s1"),
    }),
  },
  {
    name: "the audio notices answered",
    key: "some-ui.audio.activity-notice.v1.topik",
    older: '"yes"',
    open: async (): Promise<KeptHandle> => {
      // A launch: the answers held for the page load start over.
      vi.resetModules()
      const { audioNotice } = await import("@/lib/audio-notice")
      return {
        write: (): void => {
          audioNotice.answer("topik")
        },
        read: (): unknown => audioNotice.answered("topik"),
      }
    },
  },
  {
    name: "sessions stopped short",
    key: "some-ui:session-stops",
    older: '[{"sessionId":"s1","stoppedAt":"2026-10-01T09:00:00.000Z"}]',
    open: (): KeptHandle => ({
      write: (): void => {
        storeEffect({ kind: "save", stop: STOP })
      },
      read: (): unknown => allStops(),
    }),
  },
  {
    name: "each session's paths",
    key: "some-ui:session-paths",
    older: '[{"sessionId":"s1","opens":"1"}]',
    open: (): KeptHandle => ({
      write: (): void => {
        storeEffect({ kind: "count", sessionId: "s1", path: "opens" })
      },
      read: (): unknown => allPathCounts(),
    }),
  },
  {
    name: "session reflections",
    key: "some-ui:reflections",
    older: '[{"id":"r1","answers":{}}]',
    open: async (): Promise<KeptHandle> => {
      vi.resetModules()
      const { reflections } = await import("@/lib/session-reflection")
      return {
        write: (): unknown =>
          reflections.keep({
            id: "r2",
            sessionId: "s1",
            createdAt: "2026-10-26T09:00:00.000Z",
            atMs: 1000,
            body: { kind: "text", text: "Hard today" },
          }),
        read: (): unknown => reflections.getSnapshot().kept,
      }
    },
  },
  {
    name: "a boundedList (takes desks, scene voice, LeetType's notes)",
    key: "some-ui:test-list",
    older: '[1,"two"]',
    open: (): KeptHandle => {
      const list = boundedList("some-ui:test-list", 10, isNumber)
      return {
        write: (): unknown => list.put(7, (n) => n === 7),
        read: (): unknown => list.read(),
      }
    },
  },
]

describeKeptRecords(stores, async (area): Promise<KeyedStorage> => {
  // The Pages build's own module installs the in-memory copies; a fresh
  // import is a reload.
  viewer.build = true
  vi.resetModules()
  await import("@/lib/demo/viewer-storage")
  viewer.build = false
  return window[area]
})
