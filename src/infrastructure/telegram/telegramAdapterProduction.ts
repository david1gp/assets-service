import type { TelegramConfig } from "../../config/telegramConfigSchema.js"
import { resultErrorCreate } from "../../schemas/resultErrorCreate.js"
import type { TelegramAdapter } from "./telegramAdapter.js"
import { telegramMessageCreate } from "../../notification/telegramMessageCreate.js"
import type { TelegramUploadEvent } from "../../notification/telegramUploadEventSchema.js"

type TelegramFetch = (input: string | URL | Request, init?: RequestInit) => Promise<Response>

const errorMessageRead = (value: unknown, token: string): string => {
  const message = value instanceof Error ? value.message : String(value)
  return message.replaceAll(token, "[REDACTED]").replaceAll(/bot[^/\s]+/gi, "bot[REDACTED]")
}

export const telegramAdapterProduction = (
  config: TelegramConfig,
  fetchImplementation: TelegramFetch = fetch,
): TelegramAdapter => ({
  sendUploadNotification: async (event: TelegramUploadEvent) => {
    const op = "telegramAdapterProduction"
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), config.timeoutMs)
    try {
      const response = await fetchImplementation(`${config.apiBaseUrl}/bot${config.botToken}/sendMessage`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          chat_id: config.chatId,
          text: telegramMessageCreate(event),
          parse_mode: "HTML",
          disable_web_page_preview: false,
        }),
        signal: controller.signal,
      })
      const body = await response.text()
      if (!response.ok) {
        return resultErrorCreate(
          op,
          `Telegram returned HTTP ${response.status}: ${errorMessageRead(body, config.botToken)}`,
        )
      }
      let parsed: unknown
      try {
        parsed = JSON.parse(body)
      } catch {
        return resultErrorCreate(op, "Telegram returned invalid JSON")
      }
      if (!parsed || typeof parsed !== "object" || !("ok" in parsed) || parsed.ok !== true)
        return resultErrorCreate(op, "Telegram rejected the notification")
      return { success: true, data: null }
    } catch (error) {
      if (controller.signal.aborted) return resultErrorCreate(op, "Telegram request timed out")
      return resultErrorCreate(op, `Telegram request failed: ${errorMessageRead(error, config.botToken)}`)
    } finally {
      clearTimeout(timeout)
    }
  },
})
