import { rawSourceRecommended } from "@some-ui/eslint-kit"

// Raw source with no build step, so "../" stays allowed (and "@types/*" is
// DefinitelyTyped's scope): see the kit's raw-source.config.ts.
export default rawSourceRecommended
