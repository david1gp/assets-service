import * as v from "valibot"

import { outboxEventRepositoryClaimDue } from "../events/outboxEventRepositoryClaimDue.js"
import { outboxEventRepositoryMarkAttemptFailed } from "../events/outboxEventRepositoryMarkAttemptFailed.js"
import { outboxEventRepositoryMarkDead } from "../events/outboxEventRepositoryMarkDead.js"
import { outboxEventRepositoryMarkSent } from "../events/outboxEventRepositoryMarkSent.js"
import { outboxEventRepositoryRecoverLeases } from "../events/outboxEventRepositoryRecoverLeases.js"
import type { AssetDatabase } from "../infrastructure/db/assetDatabase.js"
import type { TelegramAdapter } from "../infrastructure/telegram/telegramAdapter.js"
import { telegramUploadEventSchema } from "./telegramUploadEventSchema.js"
import type { Result } from "../schemas/resultSchema.js"

type TelegramOutboxDispatcherCreateInput = {
  db: AssetDatabase
  adapter: TelegramAdapter
  workerId: string
  maxAttempts?: number
  leaseMs?: number
  pollMs?: number
  retryBaseMs?: number
  clock?: () => Date
}

const sleep = async (milliseconds: number, signal: AbortSignal): Promise<void> => {
  if (signal.aborted) return
  await new Promise<void>((resolve) => {
    const timer = setTimeout(resolve, milliseconds)
    signal.addEventListener(
      "abort",
      () => {
        clearTimeout(timer)
        resolve()
      },
      { once: true },
    )
  })
}

const isoDateCreate = (clock: () => Date): string => clock().toISOString()

export const telegramOutboxDispatcherCreate = (input: TelegramOutboxDispatcherCreateInput) => {
  const maxAttempts = input.maxAttempts ?? 5
  const leaseMs = input.leaseMs ?? 60_000
  const pollMs = input.pollMs ?? 1_000
  const retryBaseMs = input.retryBaseMs ?? 1_000
  const clock = input.clock ?? (() => new Date())
  const controller = new AbortController()
  let runPromise: Promise<Result<null>> | undefined

  const runOnce = async (): Promise<Result<number>> => {
    const recovered = outboxEventRepositoryRecoverLeases(input.db, { now: clock() })
    if (!recovered.success) return recovered
    const claimed = outboxEventRepositoryClaimDue(input.db, {
      workerId: input.workerId,
      now: clock(),
      leaseMs,
      kinds: ["customer_asset_uploaded"],
    })
    if (!claimed.success) return claimed
    if (claimed.data === null) return { success: true, data: 0 }
    const event = v.safeParse(telegramUploadEventSchema, claimed.data.payload)
    if (!event.success || event.output.eventId !== claimed.data.eventId) {
      const dead = outboxEventRepositoryMarkDead(input.db, {
        id: claimed.data.id,
        workerId: input.workerId,
        errorMessage: "Notification payload is invalid",
        deadAt: isoDateCreate(clock),
      })
      if (!dead.success) return dead
      return { success: true, data: 1 }
    }
    const sent = await input.adapter.sendUploadNotification(event.output)
    if (sent.success) {
      const marked = outboxEventRepositoryMarkSent(input.db, {
        id: claimed.data.id,
        workerId: input.workerId,
        sentAt: isoDateCreate(clock),
      })
      if (!marked.success) return marked
      return { success: true, data: 1 }
    }
    const attempt = claimed.data.attempts + 1
    const availableAt = new Date(
      clock().getTime() + Math.min(3_600_000, retryBaseMs * 2 ** Math.max(0, attempt - 1)),
    ).toISOString()
    const failed = outboxEventRepositoryMarkAttemptFailed(input.db, {
      id: claimed.data.id,
      workerId: input.workerId,
      errorMessage: sent.errorMessage.replaceAll(/bot[^/\s]+/gi, "bot[REDACTED]"),
      availableAt,
      maxAttempts,
    })
    if (!failed.success) return failed
    return { success: true, data: 1 }
  }

  const run = (signal?: AbortSignal): Promise<Result<null>> => {
    if (runPromise !== undefined) return runPromise
    const abortExternal = () => controller.abort()
    signal?.addEventListener("abort", abortExternal, { once: true })
    const started: Promise<Result<null>> = (async () => {
      while (!controller.signal.aborted) {
        const result = await runOnce()
        if (!result.success) return result
        if (result.data === 0) await sleep(pollMs, controller.signal)
      }
      return { success: true, data: null } as const
    })().finally(() => signal?.removeEventListener("abort", abortExternal))
    runPromise = started
    return started
  }

  return { run, runOnce, stop: () => controller.abort() }
}
