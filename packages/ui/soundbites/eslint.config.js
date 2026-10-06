import { ownerGuardConfig, uiRecommended } from "@some-ui/eslint-kit"
import { defineConfig } from "eslint/config"

// ownerGuardConfig: this page reads values the runtime owns and moves on.
// See the config's doc comment.
export default defineConfig([...uiRecommended, ...ownerGuardConfig])
