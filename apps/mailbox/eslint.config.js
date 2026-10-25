import someUIEslint, { logGuardConfig } from "@some-ui/eslint-kit"
import { defineConfig } from "eslint/config"

// MB3 (README.md): the one console call is `report`'s, and logs a message.
export default defineConfig([...someUIEslint, ...logGuardConfig])
