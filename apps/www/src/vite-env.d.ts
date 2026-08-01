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

  /**
   * Overrides where the app looks for its speech backend (the
   * `openai-edge-tts` service in `infra/compose/tts.yml`). Left unset, the
   * app derives `http://<current hostname>:5050/v1/audio/speech`, which is
   * correct for `vite dev`, `vite preview` and the Docker image alike. Set
   * it when the service is fronted somewhere else - notably any HTTPS
   * deployment, where the plain-HTTP default would be blocked as mixed
   * content. See src/lib/tts-config.
   *
   * Irrelevant to the GitHub Pages build: that one has no backend at all
   * and `@some-ui/speech` resolves it to the browser's own voice.
   */
  readonly VITE_TTS_ENDPOINT?: string
}
