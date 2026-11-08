import { readFileSync } from "node:fs"
import {
  encodeArgs,
  fetched,
  HYPERFRAMES_VERSION,
  renderArgs,
  renderEnv,
} from "@video-motion/pin"
import { describe, expect, it } from "vitest"
import { z } from "zod"

const ManifestSchema = z.object({
  dependencies: z.record(z.string(), z.string()).default({}),
})
const manifest = (file: string): z.infer<typeof ManifestSchema> =>
  ManifestSchema.parse(JSON.parse(readFileSync(file, "utf8")))

describe("the HyperFrames pin (HYPER1)", () => {
  it("is exact in the manifest", () => {
    const own = manifest(
      new URL("../../package.json", import.meta.url).pathname
    )
    expect(own.dependencies["hyperframes"]).toBe(HYPERFRAMES_VERSION)
  })

  it("renders frames on one worker, low memory, no GPU, strictly", () => {
    const args = renderArgs({
      project: "/w/project",
      frames: "/w/frames",
      variables: "/w/v.json",
      fps: 30,
    })
    const after = (flag: string): string | undefined =>
      args[args.indexOf(flag) + 1]
    expect(after("--workers")).toBe("1")
    expect(args).toEqual(
      expect.arrayContaining([
        "--low-memory-mode",
        "--no-browser-gpu",
        "--strict",
        "--strict-variables",
        "--no-best-effort",
      ])
    )
  })

  it("runs with telemetry off and its temporary files where it is told", () => {
    const env = renderEnv(
      { PATH: "/bin", TMPDIR: "/tmp" },
      "/c/chrome",
      "/w/tmp"
    )
    expect(env).toMatchObject({
      HYPERFRAMES_NO_TELEMETRY: "1",
      DO_NOT_TRACK: "1",
      PRODUCER_LOW_MEMORY_MODE: "true",
      PRODUCER_HEADLESS_SHELL_PATH: "/c/chrome",
      TMPDIR: "/w/tmp",
    })
  })

  it("encodes the frames on one thread, bit-exact", () => {
    const args = encodeArgs("/w/frames", 30, 60, "/o/clip.mkv")
    expect(args.filter((a) => a === "-threads")).toHaveLength(2)
    expect(args).toEqual(
      expect.arrayContaining(["ffv1", "+bitexact", "-map_metadata"])
    )
  })

  it("names a font fetched from the network", () => {
    const out = [
      "[INFO] [Compiler] Embedded local font file: fonts/a.woff2",
      '[INFO] [Compiler] Fetched 11 font face(s) for "Inter" from Google Fonts',
    ].join("\n")
    expect(fetched(out)).toHaveLength(1)
    expect(fetched("[INFO] nothing fetched here")).toEqual([])
  })
})
