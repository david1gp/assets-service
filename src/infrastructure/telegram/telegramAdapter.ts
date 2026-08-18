import type { Result } from "../../schemas/resultSchema.js"
import type { TelegramUploadEvent } from "../../notification/telegramUploadEventSchema.js"

export type TelegramAdapter = {
  sendUploadNotification: (event: TelegramUploadEvent) => Promise<Result<null>>
}
