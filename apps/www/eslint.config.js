import { appsRecommended } from "@some-ui/eslint-kit"

// `appsRecommended`, not the default export: this is a deployable host with
// an entry chunk, so the lints about what lands in that chunk apply here and
// nowhere else. See the preset's doc comment.
export default appsRecommended
