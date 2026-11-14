/// <reference types="vite/client" />
/// <reference types="@some-ui/vite-config/build-profile-client" />

// eslint-disable-next-line @typescript-eslint/consistent-type-definitions -- merging into Vite's own ImportMetaEnv requires `interface`; a `type` alias cannot declaration-merge, and silently leaves every key `any` via Vite's index signature
interface ImportMetaEnv {
  /**
   * `"true"` only for the GitHub Pages build, which ships no companion data
   * (set in .github/workflows/pages.yml). See src/lib/data-mode. A string:
   * Vite inlines env vars verbatim.
   */
  readonly VITE_STATIC_DATA?: string

  /**
   * `"true"` only for the Android app's build (`apps/mobile` `build:web`),
   * which answers its own `file_host` requests in-process from on-device
   * SQLite (src/lib/device-backend). Mutually exclusive with
   * `VITE_STATIC_DATA`. `DATA_MODE` stays `"server"`: this flag is only for
   * where "a backend" and "a network" part ways (the phone's own voice,
   * native notifications instead of push). Keep that list short.
   *
   * **Read it where you branch on it**, as
   * `import.meta.env.VITE_DEVICE_BACKEND === "true"`, never through an
   * imported constant: inlined per module, the bundler drops the dead branch
   * and its `import()` chunks; through a constant the chunks are still
   * emitted. `pnpm --filter www check:bundle-paths` fails on it
   * (packages/some-vite-config/AUDIENCES.md, "Paths").
   *
   * Typed as its one value, so a misspelled comparison is a type error.
   */
  readonly VITE_DEVICE_BACKEND?: "true"

  /**
   * The commit this build is made from (`buildCommit` in vite.config.ts),
   * empty when unknown. `/assurance` names it as the ledger's copy.
   */
  readonly VITE_BUILD_COMMIT?: string
}
