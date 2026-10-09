import type { SurveyReport } from "@topik/lib/topik/core/lesson-survey"

/** The survey store's document holding `reports`, newest first. Test-only. */
export const reportsDocument = (reports: Array<SurveyReport>): string =>
  JSON.stringify({ version: 1, reports })
