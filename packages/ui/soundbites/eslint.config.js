import { ownerGuardConfig, uiRecommended } from "@some-ui/eslint-kit"
import { defineConfig } from "eslint/config"

// ownerGuardConfig: #1659's review found this page's copy read once from a
// prop while the runtime moved on, twice. See the config's doc comment.
export default defineConfig([...uiRecommended, ...ownerGuardConfig])
