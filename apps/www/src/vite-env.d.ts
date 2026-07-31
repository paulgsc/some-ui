/// <reference types="vite/client" />

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
}
