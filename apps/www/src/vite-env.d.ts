/// <reference types="vite/client" />
/// <reference types="@some-ui/vite-config/build-profile-client" />

// eslint-disable-next-line @typescript-eslint/consistent-type-definitions -- merging into Vite's own ImportMetaEnv requires `interface`; a `type` alias cannot declaration-merge, and silently leaves every key `any` via Vite's index signature
interface ImportMetaEnv {
  /**
   * `"true"` only for the GitHub Pages build, which ships no companion data
   * at all. Set alongside `VITE_BASE_PATH` in .github/workflows/pages.yml;
   * left unset everywhere else (`vite dev`, `vite preview`, and the
   * Docker/nginx image), all of which serve `public/` and so can be fetched
   * from. See src/lib/data-mode.
   *
   * A string, not a boolean: Vite inlines env vars verbatim as strings.
   */
  readonly VITE_STATIC_DATA?: string

  /**
   * `"true"` only for the Android app's build (`apps/mobile` `build:web`).
   * The app then answers its own `file_host` requests in-process, from an
   * on-device SQLite database, instead of over the network - so it runs
   * every server-mode code path with no server. Mutually exclusive with
   * `VITE_STATIC_DATA`. See src/lib/device-backend.
   *
   * `DATA_MODE` (src/lib/data-mode) stays `"server"` there, and that is the
   * point: the device has a backend, it just lives in the same process. This
   * flag is only for the few places where "a backend" and "a network" part
   * ways: what the device has no service for (a TTS server) and what it
   * delivers differently (a nudge is a native local notification, not a web
   * push). Keep that list short; each is a place the device build diverges.
   *
   * **Read it where you branch on it**, as
   * `import.meta.env.VITE_DEVICE_BACKEND === "true"`, never through a
   * constant exported from another module. Vite writes the value into each
   * module that reads it, so the bundler drops the dead branch, and the
   * `import()` and modules behind it, before it lays out chunks. Through an
   * imported constant it folds the branch only after: the code goes, but the
   * chunks it reached are still emitted, and the web builds carried ~118 KiB
   * of native code that way. `pnpm --filter www check:bundle-paths` fails on
   * it (packages/some-vite-config/AUDIENCES.md, "Paths").
   *
   * Typed as the one value it is ever set to, so a misspelled comparison is a
   * type error rather than a branch that is silently always false.
   */
  readonly VITE_DEVICE_BACKEND?: "true"

  /**
   * Overrides where the app looks for its speech backend (the
   * `openai-edge-tts` service in `infra/compose/tts.yml`). Left unset, the
   * app follows the page it is served from: `http://<current
   * hostname>:5050/v1/audio/speech` over plain HTTP, and the same-origin
   * `/api/tts/v1/audio/speech` over HTTPS, where an absolute http:// URL
   * would be blocked as mixed content. Both `vite dev`/`vite preview` and
   * the www container proxy that path to the TTS service, so all the usual
   * ways of running this app work with this unset. Set it when the service
   * is fronted somewhere else entirely. See src/lib/tts-config.
   *
   * Irrelevant to the GitHub Pages build: that one has no backend at all
   * and `@some-ui/speech` resolves it to the browser's own voice.
   */
  readonly VITE_TTS_ENDPOINT?: string
}
