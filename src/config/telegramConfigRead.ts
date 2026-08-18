import * as v from "valibot"

import { resultErrorCreate } from "../schemas/resultErrorCreate.js"
import type { Result } from "../schemas/resultSchema.js"
import { type TelegramConfig, telegramConfigSchema } from "./telegramConfigSchema.js"

export const telegramConfigRead = (environment: NodeJS.ProcessEnv = process.env): Result<TelegramConfig | null> => {
  const token = environment.ASSETS_TELEGRAM_BOT_TOKEN
  const chatId = environment.ASSETS_TELEGRAM_CHAT_ID
  if (token === undefined && chatId === undefined) return { success: true, data: null }
  const parsed = v.safeParse(telegramConfigSchema, {
    botToken: token,
    chatId,
    apiBaseUrl: environment.ASSETS_TELEGRAM_API_BASE_URL ?? "https://api.telegram.org",
    timeoutMs: Number(environment.ASSETS_TELEGRAM_TIMEOUT_MS ?? "10000"),
    maxAttempts: Number(environment.ASSETS_TELEGRAM_MAX_ATTEMPTS ?? "5"),
    retryBaseMs: Number(environment.ASSETS_TELEGRAM_RETRY_BASE_MS ?? "1000"),
    leaseMs: Number(environment.ASSETS_TELEGRAM_LEASE_MS ?? "60000"),
    pollMs: Number(environment.ASSETS_TELEGRAM_POLL_MS ?? "1000"),
  })
  if (!parsed.success) return resultErrorCreate("telegramConfigRead", v.summarize(parsed.issues))
  return { success: true, data: parsed.output }
}
