import { resultErrorCreate } from "../../schemas/resultErrorCreate.js"
import type { TelegramUploadEvent } from "../../notification/telegramUploadEventSchema.js"
import type { TelegramAdapter } from "./telegramAdapter.js"

type TelegramAdapterFakeOptions = {
  failures?: readonly string[]
}

export const telegramAdapterFake = (options: TelegramAdapterFakeOptions = {}) => {
  const invocations: TelegramUploadEvent[] = []
  let invocationIndex = 0
  const adapter: TelegramAdapter & { invocations: TelegramUploadEvent[] } = {
    invocations,
    sendUploadNotification: async (event) => {
      invocations.push(event)
      const failure = options.failures?.[invocationIndex]
      invocationIndex += 1
      if (failure !== undefined) return resultErrorCreate("telegramAdapterFake", failure)
      return { success: true, data: null }
    },
  }
  return adapter
}
