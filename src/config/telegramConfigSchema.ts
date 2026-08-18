import * as v from "valibot"

export const telegramConfigSchema = v.strictObject({
  botToken: v.pipe(v.string(), v.minLength(1)),
  chatId: v.pipe(v.string(), v.minLength(1)),
  apiBaseUrl: v.pipe(v.string(), v.url()),
  timeoutMs: v.pipe(v.number(), v.integer(), v.minValue(1)),
  maxAttempts: v.pipe(v.number(), v.integer(), v.minValue(1)),
  retryBaseMs: v.pipe(v.number(), v.integer(), v.minValue(1)),
  leaseMs: v.pipe(v.number(), v.integer(), v.minValue(1)),
  pollMs: v.pipe(v.number(), v.integer(), v.minValue(1)),
})

export type TelegramConfig = v.InferOutput<typeof telegramConfigSchema>
