// The vite-free half of build audiences: the schema, and the manifest reader
// that scripts/check-ui-manifests.mjs shares with `audiencePlugin`. The plugin
// itself lives on the package's main entry, next to the rest of the vite
// config.
export * from "./manifests.js"
export * from "./schema.js"
