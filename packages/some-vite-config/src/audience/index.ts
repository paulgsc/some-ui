// The vite-free half of build audiences: the schema, the manifest reader that
// scripts/check-ui-manifests.ts shares with `audiencePlugin`, and A2's walk of
// a contract. The plugin itself lives on the package's main entry, next to the
// rest of the vite config.
export * from "./contract.js"
export * from "./manifests.js"
export * from "./schema.js"
