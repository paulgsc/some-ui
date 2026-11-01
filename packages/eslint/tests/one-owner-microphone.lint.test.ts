/**
 * Lint-time tests for the microphone's one owner (MIC7, #2377):
 * one-owner/no-local-microphone, no-hand-written-microphone and
 * no-local-take-words, over the shapes the repo's local recorders, fakes and
 * copied endings took before the take pattern.
 */

import { readFileSync } from "node:fs"
import path from "node:path"
import oneOwnerConfig, {
  takeEndingLeads,
} from "@eslint/configs/one-owner.config.js"
import typescriptParser from "@typescript-eslint/parser"
import type { Linter } from "eslint"
import { defineConfig } from "eslint/config"
import { describe, expect, it } from "vitest"

import {
  expectMessageForRule,
  expectNoMessageForRule,
  lintSnippet,
  PACKAGE_ROOT,
} from "./helpers/eslint-resolver.js"

const MIC = "one-owner/no-local-microphone"
const FAKE = "one-owner/no-hand-written-microphone"
const WORDS = "one-owner/no-local-take-words"

const KIT_FILE = "fixtures/packages/voice-capture/src/lib/take-kit.ts"

/** The rules as every preset carries them: tests, specs and source each get theirs. */
function makeConfig(): Array<Linter.Config> {
  return defineConfig([
    {
      files: ["**/*.{ts,tsx}"],
      languageOptions: {
        parser: typescriptParser,
        parserOptions: { ecmaFeatures: { jsx: true } },
      },
    },
    ...oneOwnerConfig,
  ])
}

async function lint(
  code: string,
  file = "src/lib/screen.ts"
): Promise<Array<Linter.LintMessage>> {
  return lintSnippet(makeConfig(), code, file)
}

describe("lint: one-owner/no-local-microphone", () => {
  it.each([
    [
      "navigator.mediaDevices.getUserMedia",
      "export const open = () => navigator.mediaDevices.getUserMedia({ audio: true })",
    ],
    [
      "a destructured mediaDevices' getUserMedia",
      "const devices = navigator.mediaDevices\nexport const open = () => devices['getUserMedia']({ audio: true })",
    ],
    [
      "new MediaRecorder",
      "export const record = (stream: MediaStream) => new MediaRecorder(stream)",
    ],
    [
      "new window.MediaRecorder",
      "export const record = (stream: MediaStream) => new window.MediaRecorder(stream)",
    ],
    [
      "takeRunner from the entry",
      'import { takeRunner } from "@some-ui/voice-capture"\nexport const run = takeRunner',
    ],
    [
      "stepTake and its helpers from the entry",
      'import { finishTake, openTake, stepTake } from "@some-ui/voice-capture"\nexport { finishTake, openTake, stepTake }',
    ],
    [
      "voiceNoteRuntime from the entry",
      'import { voiceNoteRuntime } from "@some-ui/voice-capture"\nexport const note = voiceNoteRuntime',
    ],
    [
      "takeRunner renamed on import",
      'import { takeRunner as run } from "@some-ui/voice-capture"\nexport { run }',
    ],
    [
      "takeRunner read off a namespace import",
      'import * as kit from "@some-ui/voice-capture"\nexport const run = kit.takeRunner',
    ],
    [
      "a re-export of stepTake",
      'export { stepTake } from "@some-ui/voice-capture"',
    ],
    ["a re-export of the whole kit", 'export * from "@some-ui/voice-capture"'],
    [
      "an import past the entry",
      'import { takeRunner } from "@some-ui/voice-capture/src/lib/take"\nexport { takeRunner }',
    ],
    [
      "a relative import of the kit's source",
      'import { micRecorder } from "../../voice-capture/src/lib/recorder"\nexport { micRecorder }',
    ],
    [
      "micRecorder driven by hand",
      'import { micRecorder } from "@some-ui/voice-capture"\nexport const open = () => micRecorder({})()',
    ],
    [
      "micRecorder handed on uncalled",
      'import { micRecorder } from "@some-ui/voice-capture"\nexport const ports = { startRecording: micRecorder }',
    ],
    [
      "micRecorder handed to another slot",
      'import { micRecorder } from "@some-ui/voice-capture"\nexport const ports = { open: micRecorder({}) }',
    ],
    [
      "micRecorder kept in a variable",
      'import { micRecorder } from "@some-ui/voice-capture"\nexport const start = micRecorder({})',
    ],
    [
      "micRecorder off a namespace, driven by hand",
      'import * as kit from "@some-ui/voice-capture"\nexport const open = () => kit.micRecorder({})()',
    ],
    [
      "takeRunner destructured off a namespace",
      'import * as kit from "@some-ui/voice-capture"\nconst { takeRunner } = kit\nexport { takeRunner }',
    ],
    [
      "micRecorder destructured off a namespace",
      'import * as kit from "@some-ui/voice-capture"\nconst { micRecorder: mic } = kit\nexport const ports = { startRecording: mic({}) }',
    ],
    [
      "getUserMedia destructured off mediaDevices",
      "const { getUserMedia } = navigator.mediaDevices\nexport const open = getUserMedia",
    ],
    [
      "getUserMedia destructured out of navigator",
      "const { mediaDevices: { getUserMedia } } = navigator\nexport const open = getUserMedia",
    ],
    [
      "mediaDevices destructured, then read",
      "const { mediaDevices } = navigator\nexport const open = () => mediaDevices.getUserMedia({ audio: true })",
    ],
    ["MediaRecorder kept as a value", "export const R = MediaRecorder"],
    [
      "MediaRecorder's static read",
      "export const ok = MediaRecorder.isTypeSupported('audio/webm')",
    ],
    [
      "a typeof MediaRecorder check",
      "export const can = typeof MediaRecorder !== 'undefined'",
    ],
    [
      "MediaRecorder destructured off window",
      "const { MediaRecorder: R } = window\nexport { R }",
    ],
    ["globalThis.MediaRecorder", "export const R = globalThis.MediaRecorder"],
    [
      "a dynamic import past the entry",
      'export const load = () => import("@some-ui/voice-capture/src/lib/take")',
    ],
    [
      "machinery destructured from a dynamic import",
      'export async function load() { const { takeRunner } = await import("@some-ui/voice-capture"); return takeRunner }',
    ],
    [
      "machinery off a dynamic import kept whole",
      'export async function load() { const kit = await import("@some-ui/voice-capture"); return kit.stepTake }',
    ],
  ])("fires on %s", async (shape, code) => {
    expectMessageForRule(await lint(code), MIC, shape)
  })

  it.each([
    [
      "the pattern and the port handed to its slot",
      `import { micRecorder, ONE_TAKE, savingShelf, takePattern } from "@some-ui/voice-capture"
export const pattern = takePattern({ startRecording: micRecorder({ bitsPerSecond: 64_000 }), shelf: savingShelf("x") }, ONE_TAKE)`,
    ],
    [
      "the port as a parameter's default",
      `import type { StartRecording } from "@some-ui/voice-capture"
import { micRecorder } from "@some-ui/voice-capture"
export function phone(startRecording: StartRecording = micRecorder({})): StartRecording { return startRecording }`,
    ],
    [
      "the port off a namespace, handed to its slot",
      'import * as kit from "@some-ui/voice-capture"\nexport const ports = { startRecording: kit.micRecorder({}), pattern: kit.takePattern }',
    ],
    [
      "the pattern's step and words, and the machinery's types",
      `import type { TakeStep, TakeSignal } from "@some-ui/voice-capture"
import { type TakeLimits, stepTakePattern, takeKit, TAKE_WORDS } from "@some-ui/voice-capture"
export type Step = TakeStep | TakeSignal | TakeLimits
export { stepTakePattern, takeKit, TAKE_WORDS }`,
    ],
    [
      "a key named micRecorder in a mock factory",
      "export const fake = { micRecorder: () => null, getUserMediaCalls: 0 }",
    ],
    [
      "MediaRecorder named as a type",
      "export type R = MediaRecorder\nexport let held: MediaRecorder | null = null",
    ],
    [
      "a local named MediaRecorder",
      "const MediaRecorder = { name: 'mine' }\nexport const r = MediaRecorder",
    ],
    [
      "type-only re-exports",
      'export type * from "@some-ui/voice-capture"\nexport type { TakeStep } from "@some-ui/voice-capture"\nexport { type takeRunner } from "@some-ui/voice-capture"',
    ],
    [
      "the pattern from a dynamic import",
      'export async function load() { const { takePattern } = await import("@some-ui/voice-capture"); const kit = await import("@some-ui/voice-capture"); return [takePattern, kit.ONE_TAKE] }',
    ],
    [
      "an unrelated destructure and spy",
      'import { vi } from "vitest"\nconst api = { open: () => null }\nconst { open } = api\nvi.spyOn(api, "open")\nexport { open }',
    ],
  ])("stays quiet on %s", async (shape, code) => {
    expectNoMessageForRule(await lint(code), MIC, shape)
  })

  it.each([
    ["machinery", "takeRunner"],
    ["the port", "micRecorder"],
  ])("fires on a spy on %s off a namespace", async (_, name) => {
    const code = `import * as kit from "@some-ui/voice-capture"
import { vi } from "vitest"
vi.spyOn(kit, "${name}")`
    expectMessageForRule(await lint(code, "src/lib/screen.test.ts"), MIC, name)
  })

  it.each([
    ["src/lib/phone.ts", "the phone's own code"],
    ["src/fixtures.tsx", "a fixture module the app could bundle"],
  ])("fires on %s importing the testing entry (%s)", async (file, shape) => {
    const code =
      'import { simulatedMicrophone } from "@some-ui/voice-capture/testing"\nexport const mic = simulatedMicrophone'
    expectMessageForRule(await lint(code, file), MIC, shape)
  })

  it.each([
    ["src/lib/phone.test.ts", "a test"],
    ["src/lib/__tests__/fakes.ts", "a test helper"],
    ["tests/ui-fit/panel-page/take.tsx", "a ui-fit page"],
    ["src/lib/take.spec.ts", "a spec"],
  ])("allows the testing entry in %s (%s)", async (file, shape) => {
    const code =
      'import { simulatedMicrophone } from "@some-ui/voice-capture/testing"\nexport const mic = simulatedMicrophone'
    expectNoMessageForRule(await lint(code, file), MIC, shape)
  })

  it("allows a type-only import of the testing entry in source", async () => {
    const code =
      'import type { MicScript } from "@some-ui/voice-capture/testing"\nexport type S = MicScript'
    expectNoMessageForRule(await lint(code), MIC, "import type")
  })

  it("stays quiet in the kit's own files", async () => {
    const code = `import { takeRunner } from "./take"
export const open = () => navigator.mediaDevices.getUserMedia({ audio: true })
export const record = (stream: MediaStream) => new MediaRecorder(stream)
export { takeRunner }`
    expectNoMessageForRule(await lint(code, KIT_FILE), MIC, "the kit")
  })

  it("reports a multi-name import once per name, on the import's first line", async () => {
    const code = `import {
  discardTake,
  finishTake,
  stepTake,
} from "@some-ui/voice-capture"
export { discardTake, finishTake, stepTake }`
    const lines = (await lint(code))
      .filter((m) => m.ruleId === MIC)
      .map((m) => m.line)
    expect(lines).toEqual([1, 1, 1])
  })
})

describe("lint: one-owner/no-hand-written-microphone", () => {
  const types =
    'import type { Recording, StartRecording, Take } from "@some-ui/voice-capture"\n'

  it.each([
    [
      "a function returning a Recording",
      `${types}function recording(durationMs: number): Recording { return { level: () => 0, finish: () => Promise.resolve({} as Take), discard: () => undefined } }`,
    ],
    [
      "an arrow returning a Promise of a Recording",
      `${types}export const start = (): Promise<Recording> => Promise.resolve(null as never)`,
    ],
    [
      "a function literal typed StartRecording",
      `${types}export const held: StartRecording = async () => { throw new Error("never") }`,
    ],
    [
      "an object literal typed Recording",
      `${types}export const r: Recording = { level: () => 0 }`,
    ],
    [
      "an object literal as Recording",
      `${types}export const r = { level: () => 0 } as Recording`,
    ],
    [
      "a function literal satisfying StartRecording",
      `${types}export const start = (() => Promise.reject(new Error("x"))) satisfies StartRecording`,
    ],
    [
      "an untyped object with a recording's members",
      "export const start = () => Promise.resolve({ level: () => 0.3, finish: () => new Promise(() => undefined), discard: () => undefined })",
    ],
    [
      "a renamed Recording type",
      'import type { Recording as Rec } from "@some-ui/voice-capture"\nexport function r(): Rec { return null as never }',
    ],
    [
      'vi.mock("@some-ui/voice-capture")',
      'import { vi } from "vitest"\nvi.mock("@some-ui/voice-capture", async (actual) => ({ ...(await actual<object>()) }))',
    ],
    [
      'vi.doMock("@some-ui/voice-capture")',
      'import { vi } from "vitest"\nvi.doMock(`@some-ui/voice-capture`, () => ({}))',
    ],
    [
      "vi.mock of a path past the entry",
      'import { vi } from "vitest"\nvi.mock("@some-ui/voice-capture/src/lib/recorder", () => ({}))',
    ],
    [
      "vi.mock of import()",
      'import { vi } from "vitest"\nvi.mock(import("@some-ui/voice-capture"), () => ({}))',
    ],
    [
      "vitest.mock",
      'import { vitest } from "vitest"\nvitest.mock("@some-ui/voice-capture", () => ({}))',
    ],
    [
      "vi.fn typed StartRecording",
      `${types}import { vi } from "vitest"\nexport const start = vi.fn<StartRecording>()`,
    ],
    [
      "an angle-bracket Recording assertion",
      `${types}export const r = <Recording>{ level: () => 0 }`,
    ],
    [
      "a class implementing Recording",
      `${types}export class Held implements Recording { level = (): number => 0; finish = (): Promise<Take> => Promise.reject(new Error("x")); discard = (): void => undefined }`,
    ],
    [
      "a class with a recording's members",
      "export class Held { level(): number { return 0 } finish(): Promise<never> { return new Promise(() => undefined) } discard(): void {} }",
    ],
  ])("fires on %s", async (shape, code) => {
    expectMessageForRule(
      await lint(code, "src/lib/screen.test.ts"),
      FAKE,
      shape
    )
  })

  it("reports a function that builds a recording once", async () => {
    const code = `${types}function recording(): Recording {
  return { level: () => 0, finish: () => Promise.resolve({} as Take), discard: () => undefined }
}`
    const msgs = (await lint(code, "src/lib/screen.test.ts")).filter(
      (m) => m.ruleId === FAKE
    )
    expect(msgs.map((m) => m.line)).toEqual([2])
  })

  it.each([
    [
      "the simulated microphone, returned as a StartRecording",
      `${types}import { simulatedMicrophone, SPEAKING } from "@some-ui/voice-capture/testing"
export function speaking(): StartRecording { return simulatedMicrophone({ now: Date.now, fallback: SPEAKING }).startRecording }`,
    ],
    [
      "a parameter typed StartRecording with a default",
      `${types}declare function speaking(): StartRecording
export function opened(mic: StartRecording = speaking()): StartRecording { return mic }`,
    ],
    [
      "a local Recording that is not the kit's",
      "type Recording = { id: string }\nexport function r(): Recording { return { id: 'x' } }\nexport const Rec = (): Recording => ({ id: 'y' })",
    ],
    [
      "an object with only some of a recording's members",
      "export const take = { finish: () => undefined, level: 3 }",
    ],
    [
      "a mock of another module",
      'import { vi } from "vitest"\nvi.mock("@some-ui/core-utils", () => ({}))',
    ],
    [
      "a vi.fn of another type",
      `${types}import { vi } from "vitest"\nexport const done = vi.fn<(take: Take) => void>()`,
    ],
    [
      "a class with only some of a recording's members",
      "export class Clip { finish(): void {} level = 3 }",
    ],
  ])("stays quiet on %s", async (shape, code) => {
    expectNoMessageForRule(
      await lint(code, "src/lib/screen.test.ts"),
      FAKE,
      shape
    )
  })

  it("stays quiet in the kit's own files", async () => {
    const code = `${types}export function recording(): Recording { return { level: () => 0, finish: () => Promise.resolve({} as Take), discard: () => undefined } }`
    expectNoMessageForRule(await lint(code, KIT_FILE), FAKE, "the kit")
  })
})

describe("lint: one-owner/no-local-take-words", () => {
  it.each([
    [
      "a words table's own Too short",
      'export const WORDS = { tooShort: "Too short to keep. Tap, talk, then tap Done." }',
    ],
    [
      "a template starting with the kit's line",
      "export const said = (n: number) => `Another screen is recording. ${n}`",
    ],
    [
      "JSX text",
      "export const Note = () => <p> Kept, but I didn't hear you.</p>",
    ],
    [
      "another case",
      'export const WORDS = { tooShort: "too short to keep, tap again" }',
    ],
    [
      "a curly apostrophe",
      'export const WORDS = { full: "There\u2019s no room for another voice note." }',
    ],
  ])("fires on %s", async (shape, code) => {
    expectMessageForRule(await lint(code, "src/lib/words.tsx"), WORDS, shape)
  })

  it.each([
    [
      "the kit's table, read",
      'import { TAKE_ENDING_WORDS } from "@some-ui/voice-capture"\nexport const WORDS = { tooShort: TAKE_ENDING_WORDS.short, kept: "Kept 5 s." }',
    ],
    [
      "a sentence that only mentions the words later",
      'export const note = "The take was too short to keep."',
    ],
    [
      "a screen's own paraphrase",
      'export const WORDS = { full: "No room on the phone for that take, so it wasn\u2019t kept.", short: "That was too quick to keep." }',
    ],
  ])("stays quiet on %s", async (shape, code) => {
    expectNoMessageForRule(await lint(code, "src/lib/words.tsx"), WORDS, shape)
  })

  it("stays quiet in the kit's own table", async () => {
    const code =
      'export const SAID = { short: "Too short to keep. Tap, talk, then tap again." }'
    expectNoMessageForRule(await lint(code, KIT_FILE), WORDS, "the kit")
  })

  it("leads with every ending sentence of the kit's table but its one-word Kept", () => {
    const kit = path.join(PACKAGE_ROOT, "../voice-capture/src/lib")
    const sentences = [
      ...tableStrings(path.join(kit, "voice-note.ts"), "VOICE_NOTE_SAID"),
      ...tableStrings(path.join(kit, "recorder.ts"), "RECORDING_FAILURE_COPY"),
      ...tableStrings(path.join(kit, "take-kit.ts"), "TAKE_ENDING_WORDS"),
    ]
    const opening = sentences
      .map((sentence) => /^(.*?)[.:]( |$)/.exec(sentence)?.[1] ?? sentence)
      .filter((lead) => lead !== "Kept")
    // Every ending the kit says has a lead, and every lead is one it says.
    expect(
      opening.filter(
        (lead) =>
          !takeEndingLeads.some((candidate) => lead.startsWith(candidate))
      )
    ).toEqual([])
    expect(
      takeEndingLeads.filter(
        (lead) => !sentences.some((s) => s.startsWith(lead))
      )
    ).toEqual([])
  })
})

/** The string values of the object literal `name` is bound to in `file`. */
function tableStrings(file: string, name: string): Array<string> {
  const program = typescriptParser.parse(readFileSync(file, "utf8"))
  const found: Array<string> = []
  const visit = (node: unknown, inTable: boolean): void => {
    if (typeof node !== "object" || node === null) return
    const type: unknown = Reflect.get(node, "type")
    const here =
      inTable ||
      (type === "VariableDeclarator" &&
        Reflect.get(Object(Reflect.get(node, "id")), "name") === name)
    const value: unknown = Reflect.get(node, "value")
    if (here && type === "Literal" && typeof value === "string")
      found.push(value)
    // A template's text, as a person reads it up to its first `${}`.
    const cooked: unknown = Reflect.get(Object(value), "cooked")
    if (here && type === "TemplateElement" && typeof cooked === "string")
      found.push(cooked)
    for (const [key, child] of Object.entries(node)) {
      if (key === "parent" || key === "typeAnnotation") continue
      const children: Array<unknown> = Array.isArray(child) ? child : [child]
      for (const item of children) visit(item, here)
    }
  }
  visit(program, false)
  expect(found.length, `${name} in ${file}`).toBeGreaterThan(0)
  return found
}
