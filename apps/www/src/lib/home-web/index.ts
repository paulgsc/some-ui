/**
 * The lan build's own pages that the phone opens in its browser on the home
 * network rather than carrying: the résumé builder and home's switches.
 * Capacitor opens an absolute address in the phone's browser, where the
 * passkey signs the owner in; the APK bundles neither page. Each is another
 * deployable's address, never a link inside this build.
 */
const HOME_WEB = "https://www.home.maishatu.com"

/** The résumé builder. */
export const RESUME_BUILDER = `${HOME_WEB}/resume-build`

/** Home's switches, at the teams followed live (#3329). */
export const GAME_TEAMS_SWITCH = `${HOME_WEB}/home-switches#game-teams`
