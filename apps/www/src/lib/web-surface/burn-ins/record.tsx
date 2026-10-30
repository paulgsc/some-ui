import type { JSX } from "react"
import { BurnInRecorder } from "@some-ui/burn-ins"

// The same font as the preview, so a recording is the preview's picture.
import "@fontsource/barlow-condensed/latin-600.css"
import "@fontsource/barlow-condensed/latin-800.css"

/** The page the recorder captures burn-ins from (`tests/record/burn-ins.ts`). */
export const BurnInRecordPage = (): JSX.Element => <BurnInRecorder />
