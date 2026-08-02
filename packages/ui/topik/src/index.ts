export * from "./components"

/**
 * The applet's data seam, for hosts that own where the material lives.
 *
 * `KoreanStudyPage` takes `topikRepository`/`metadataRepository` overrides,
 * and those props are unusable from outside this package unless the
 * factories that build them are public too. `apps/www` uses them to resolve
 * the manifest per deployment - fetched from `public/topiks` where one is
 * served, empty on GitHub Pages, which ships no companion data.
 */
export {
  createTopikMetadataRepository,
  createTopikRepository,
} from "./lib/topik"
export type {
  ITopikMetadataRepository,
  ITopikRepository,
  TopikManifestFile,
} from "./lib/topik"
