/**
 * The real recorder in Chromium (MIC9, #2379): one project per clip, since
 * the clip Chromium's fake microphone plays is fixed at launch
 * (`--use-file-for-fake-audio-capture`). Each case is tagged with its clip
 * (`@speech`, `@silence`) and runs in that clip's project only.
 *
 * `pnpm --filter @some-ui/voice-capture test:e2e` builds the page first.
 */
import { resolve } from "node:path"
import { defineConfig, devices } from "@playwright/test"

import type { Clip } from "./cases"

const CLIPS: ReadonlyArray<Clip> = ["speech", "silence"]

const executablePath = process.env["PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH"]

export default defineConfig({
  testDir: import.meta.dirname,
  testMatch: "*.spec.ts",
  timeout: 30_000,
  retries: 0,
  workers: 1,
  forbidOnly: process.env["CI"] !== undefined,
  reporter: [["list"]],
  use: { trace: "retain-on-failure" },
  outputDir: resolve(import.meta.dirname, "dist/results"),
  projects: CLIPS.map((clip) => ({
    name: clip,
    grep: new RegExp(`@${clip}\\b`),
    use: {
      ...devices["Desktop Chrome"],
      launchOptions: {
        ...(executablePath === undefined ? {} : { executablePath }),
        args: [
          // Grants the microphone without a prompt.
          "--use-fake-ui-for-media-stream",
          "--use-fake-device-for-media-stream",
          `--use-file-for-fake-audio-capture=${resolve(import.meta.dirname, "clips", `${clip}.wav`)}`,
          // The level meter's AudioContext starts without a gesture.
          "--autoplay-policy=no-user-gesture-required",
        ],
      },
    },
  })),
})
