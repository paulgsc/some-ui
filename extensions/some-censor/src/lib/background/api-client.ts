import { ext } from "@censor/platform/background"
import type {
  ApiConfig,
  DeleteWhitelistResponse,
  GetSettingsResponse,
  GetWhitelistResponse,
  PostWhitelistRequest,
  PostWhitelistResponse,
  PutSettingsRequest,
  PutSettingsResponse,
} from "@censor/types/api"
import type { WhitelistEntry } from "@censor/types/messages"

// eslint-disable-next-line no-restricted-syntax
const DEFAULT_BASE_URL = "http://localhost:7474"
const DEV_API_TIMEOUT_MS = 10_000

/**
 * Localhost persistence API client.
 *
 * All whitelist and settings data is stored on a local HTTP server
 * (not in browser.storage). The server URL is configurable — stored
 * in browser.storage.local under "apiBaseUrl" so it survives restarts.
 *
 * Expected server endpoints:
 *   GET    /whitelist              → { channels: WhitelistEntry[] }
 *   POST   /whitelist              → { channel: WhitelistEntry }
 *   DELETE /whitelist/:channelId   → { ok: true }
 *   GET    /settings               → { enabled: boolean }
 *   PUT    /settings               → { enabled: boolean }
 *
 * All methods throw ApiError on non-2xx responses or network failure.
 * Callers (message-handler.ts) are responsible for catching and mapping
 * to ErrResp.
 */
export class ApiClient {
  private _baseUrl: string = DEFAULT_BASE_URL

  async init(): Promise<void> {
    try {
      const stored = await ext.storage.local.get("apiBaseUrl")
      if (stored["apiBaseUrl"] && typeof stored["apiBaseUrl"] === "string") {
        this._baseUrl = stored["apiBaseUrl"]
      }
    } catch {
      // Keep default
    }
  }

  get config(): ApiConfig {
    return { baseUrl: this._baseUrl }
  }

  // ── Whitelist ─────────────────────────────────────────────────────────────

  async getWhitelist(): Promise<Array<WhitelistEntry>> {
    const data = await this._get<GetWhitelistResponse>("/whitelist")
    return data.channels
  }

  async addToWhitelist(
    channelId: string,
    channelName: string
  ): Promise<WhitelistEntry> {
    const body: PostWhitelistRequest = { channelId, channelName }
    const data = await this._post<PostWhitelistResponse>("/whitelist", body)
    return data.channel
  }

  async removeFromWhitelist(channelId: string): Promise<void> {
    await this._delete<DeleteWhitelistResponse>(
      `/whitelist/${encodeURIComponent(channelId)}`
    )
  }

  async isWhitelisted(channelId: string): Promise<boolean> {
    // Fetch full list and check — simple enough for personal-use scale
    // A future optimisation would be a local in-memory cache in the background script
    const channels = await this.getWhitelist()
    return channels.some((c) => c.channelId === channelId)
  }

  // ── Settings ──────────────────────────────────────────────────────────────

  async getSettings(): Promise<GetSettingsResponse> {
    return this._get<GetSettingsResponse>("/settings")
  }

  async putSettings(body: PutSettingsRequest): Promise<PutSettingsResponse> {
    return this._put<PutSettingsResponse>("/settings", body)
  }

  // ── HTTP helpers ──────────────────────────────────────────────────────────

  private _assertDev(): void {
    if (import.meta.env.PROD) {
      throw new Error(
        "[BOYO] ApiClient: network fetch is disabled in production builds. " +
          "All production I/O must use browser.storage or HTTPS."
      )
    }
  }

  private async _get<T>(path: string): Promise<T> {
    this._assertDev()
    const res = await fetch(`${this._baseUrl}${path}`, {
      signal: AbortSignal.timeout(DEV_API_TIMEOUT_MS),
    })
    return this._unwrap<T>(res)
  }

  private async _post<Res>(path: string, body: object): Promise<Res> {
    this._assertDev()
    const res = await fetch(`${this._baseUrl}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(DEV_API_TIMEOUT_MS),
    })
    return this._unwrap<Res>(res)
  }

  private async _put<Res>(path: string, body: object): Promise<Res> {
    this._assertDev()
    const res = await fetch(`${this._baseUrl}${path}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(DEV_API_TIMEOUT_MS),
    })
    return this._unwrap<Res>(res)
  }

  private async _delete<Res>(path: string): Promise<Res> {
    this._assertDev()
    const res = await fetch(`${this._baseUrl}${path}`, {
      method: "DELETE",
      signal: AbortSignal.timeout(DEV_API_TIMEOUT_MS),
    })
    return this._unwrap<Res>(res)
  }

  private async _unwrap<T>(res: Response): Promise<T> {
    if (!res.ok) {
      let message = res.statusText
      try {
        message = (await res.json()).message ?? message
      } catch {
        /* keep statusText */
      }
      throw { status: res.status, message }
    }
    // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
    return res.json() as Promise<T>
  }
}
