import { extensionConfig } from "@some-extension/common/vite"

// Single source of truth for `pnpm dev` and `pnpm build`. One `vite build`
// emits every entry; the classic entries (content + background) are flattened
// into self-contained IIFEs so they load as classic scripts, while the popup is
// a module page and keeps its ESM. JS-imported stylesheets land in dist/styles/
// (content.css is referenced from the manifest's content_scripts.css[]; popup.css
// is auto-injected into the emitted popup.html).
export default extensionConfig({
  alias: { "@mujik": "src" },
  entries: [
    { name: "content", input: "src/content/content.ts" },
    { name: "background", input: "src/background/background.ts" },
    { name: "popup", input: "popup.html", classic: false },
  ],
})
