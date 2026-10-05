import { ownerGuardConfig, uiRecommended } from "@some-ui/eslint-kit"
import { defineConfig } from "eslint/config"

// ownerGuardConfig: aph's screens act on values other things own (the
// host's clock, the store's entries), and #1659's review found a mount-time
// copy of one five times. See the config's doc comment.
export default defineConfig([...uiRecommended, ...ownerGuardConfig])
