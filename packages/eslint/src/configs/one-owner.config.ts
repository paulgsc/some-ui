import {
  noHandWrittenMicrophone,
  noLocalMicrophone,
  noLocalPrimitive,
  noLocalTakeWords,
} from "@eslint/rules/index.js"
import { defineConfig } from "eslint/config"

/**
 * One owner per small primitive (#2112). Extensions are bundled on their own,
 * so `@some-extension/common` is theirs. A copy that has to stay carries a
 * disable that says why.
 *
 * The microphone has one owner too, `@some-ui/voice-capture` (MIC7, #2377):
 * outside it, nothing opens the microphone or runs a take of its own
 * (`no-local-microphone`), no test writes a microphone by hand
 * (`no-hand-written-microphone`), and no screen keeps its own copy of how a
 * take ended (`no-local-take-words`).
 */
export const oneOwnerPlugin = {
  meta: { name: "one-owner", version: "0.0.1" },
  rules: {
    "no-local-primitive": noLocalPrimitive,
    "no-local-microphone": noLocalMicrophone,
    "no-hand-written-microphone": noHandWrittenMicrophone,
    "no-local-take-words": noLocalTakeWords,
  },
}

export const primitiveOwners = {
  assertNever: [
    "packages/core-utils/src/lib/assert-never.ts",
    "extensions/common/src/utils/error.ts",
  ],
  isRecord: [
    "packages/core-utils/src/lib/is-record.ts",
    "extensions/common/src/utils/guards.ts",
  ],
}

/**
 * The microphone's owner. `machinery` is the take the pattern is built on: a
 * screen that imports it runs a take beside the pattern's. `ports` maps a
 * factory a screen does wire to the one slot it is handed to.
 */
export const microphoneOwner = {
  owner: "packages/voice-capture/",
  entry: "@some-ui/voice-capture",
  testing: "@some-ui/voice-capture/testing",
  machinery: [
    "takeRunner",
    "stepTake",
    "openTake",
    "finishTake",
    "discardTake",
    "voiceNoteRuntime",
  ],
  ports: { micRecorder: "startRecording" },
}

/**
 * The opening clause of each sentence in the kit's ending table
 * (`TAKE_ENDING_WORDS`: `VOICE_NOTE_SAID`, `RECORDING_FAILURE_COPY` and
 * `unheard`). Its "Kept." is left out: a one-word lead would match every
 * screen's own "Kept 5 s." line. `tests/one-owner.lint.test.ts` reads the
 * kit's table and fails when the two part.
 */
/* eslint-disable one-owner/no-local-take-words -- the rule's own list of the kit's lines, not a screen's copy */
export const takeEndingLeads = [
  "Too short to keep",
  "There's no room for another voice note",
  "Couldn't keep that one",
  "That ended before the microphone was listening",
  "Kept, but I didn't hear you",
  "The microphone is off for Some UI",
  "Another app is using the microphone",
  "Another screen is recording",
  "This phone's web view can't record audio",
  "The microphone didn't start",
]
/* eslint-enable one-owner/no-local-take-words */

const SOURCES = "**/*.{js,mjs,cjs,jsx,ts,tsx,cts,mts}"
const TESTS = ["**/*.test.*", "**/__tests__/**"]

export default defineConfig([
  {
    files: [SOURCES],
    ignores: TESTS,
    plugins: { "one-owner": oneOwnerPlugin },
    rules: {
      "one-owner/no-local-primitive": ["error", { owners: primitiveOwners }],
      "one-owner/no-local-take-words": [
        "error",
        { owner: microphoneOwner.owner, leads: takeEndingLeads },
      ],
    },
  },
  {
    // Tests too: a test that opens the microphone, runs a take or writes a
    // recording by hand proves nothing about the phone's.
    files: [SOURCES],
    plugins: { "one-owner": oneOwnerPlugin },
    rules: {
      "one-owner/no-local-microphone": ["error", microphoneOwner],
      "one-owner/no-hand-written-microphone": [
        "error",
        {
          owner: microphoneOwner.owner,
          entry: microphoneOwner.entry,
          testing: microphoneOwner.testing,
        },
      ],
    },
  },
])
