/**
 * What a page outside this workspace needs to mount Studio on fakes, as the
 * ui-fit phone page does (www `tests/ui-fit/phone-page`): a project store in
 * memory, a microphone that always hears, and the two readers that turn a
 * primer into the project it opens as. Not the phone's code: nothing here
 * reaches IndexedDB, the microphone or the page's storage. A build that
 * leaves `apk` out stubs this subpath with the rest of the workspace.
 */
export { fakeMic } from "./lib/fake-mic"
export type { Cut, Primer } from "./lib/journal/primer"
export { readPrimer } from "./lib/journal/primer"
export type { MemoryProjectStore } from "./lib/project/memory-store"
export { memoryProjectStore } from "./lib/project/memory-store"
export { cutListOf } from "./lib/project/script"
