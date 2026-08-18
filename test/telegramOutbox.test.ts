import { describe, expect, test } from "bun:test"
import { eq } from "drizzle-orm"

import { outboxEventRepositoryEnqueue } from "../src/events/outboxEventRepositoryEnqueue.js"
import { outboxEventRepositoryClaimDue } from "../src/events/outboxEventRepositoryClaimDue.js"
import { outboxEventRepositoryRecoverLeases } from "../src/events/outboxEventRepositoryRecoverLeases.js"
import { databaseClose } from "../src/infrastructure/db/databaseClose.js"
import { databaseMigrate } from "../src/infrastructure/db/databaseMigrate.js"
import { databaseOpen } from "../src/infrastructure/db/databaseOpen.js"
import { outboxEventTable } from "../src/infrastructure/db/schema/outboxEventTable.js"
import { telegramAdapterFake } from "../src/infrastructure/telegram/telegramAdapterFake.js"
import { telegramAdapterProduction } from "../src/infrastructure/telegram/telegramAdapterProduction.js"
import { telegramMessageCreate } from "../src/notification/telegramMessageCreate.js"
import { telegramOutboxDispatcherCreate } from "../src/notification/telegramOutboxDispatcherCreate.js"
import type { TelegramUploadEvent } from "../src/notification/telegramUploadEventSchema.js"

const now = "2026-08-17T00:00:00.000Z"

const eventCreate = (overrides: Partial<TelegramUploadEvent> = {}): TelegramUploadEvent => ({
  eventId: "customer-asset-uploaded:upload-1",
  organizationId: "org-1",
  organizationSlug: "adaptive",
  projectId: "project-1",
  projectSlug: "assets",
  uploaderId: "user-1",
  originalFilename: "<hero>&.png",
  integrationNote: 'Use "hero" & keep it <large>',
  uploadedAt: now,
  assetUrl: "https://cdn.example.test/assets/hero.png?a=1&b=2",
  adminUrl: "https://admin.example.test/projects/project-1/assets/asset-1",
  ...overrides,
})

const openDatabase = () => {
  const opened = databaseOpen(":memory:")
  if (!opened.success) throw new Error(opened.errorMessage)
  const migrated = databaseMigrate(opened.data)
  if (!migrated.success) throw new Error(migrated.errorMessage)
  return opened.data
}

const enqueue = (db: ReturnType<typeof openDatabase>, event: TelegramUploadEvent, id = "outbox-1") =>
  outboxEventRepositoryEnqueue(db.db, {
    id,
    eventId: event.eventId,
    kind: "customer_asset_uploaded",
    payload: event,
    status: "pending",
    attempts: 0,
    availableAt: now,
    deliveredAt: null,
    lastError: null,
    createdAt: now,
  })

describe("Telegram outbox", () => {
  test("escapes message text and link attributes", () => {
    const message = telegramMessageCreate(eventCreate())
    expect(message).toContain("&lt;hero&gt;&amp;.png")
    expect(message).toContain("Use &quot;hero&quot; &amp; keep it &lt;large&gt;")
    expect(message).toContain("a=1&amp;b=2")
  })

  test("sends once and persists the sent state", async () => {
    const connection = openDatabase()
    try {
      expect(enqueue(connection, eventCreate()).success).toBe(true)
      const fake = telegramAdapterFake()
      const dispatcher = telegramOutboxDispatcherCreate({
        db: connection.db,
        adapter: fake,
        workerId: "worker-telegram-1",
        clock: () => new Date(now),
      })
      expect(await dispatcher.runOnce()).toEqual({ success: true, data: 1 })
      expect(await dispatcher.runOnce()).toEqual({ success: true, data: 0 })
      expect(fake.invocations).toEqual([eventCreate()])
      expect(connection.db.select().from(outboxEventTable).get()).toMatchObject({ status: "sent", attempts: 0 })
    } finally {
      databaseClose(connection)
    }
  })

  test("backs off failures and moves the event to dead", async () => {
    const connection = openDatabase()
    try {
      expect(enqueue(connection, eventCreate()).success).toBe(true)
      const fake = telegramAdapterFake({ failures: ["temporary", "permanent"] })
      const dispatcher = telegramOutboxDispatcherCreate({
        db: connection.db,
        adapter: fake,
        workerId: "worker-telegram-1",
        maxAttempts: 2,
        retryBaseMs: 1000,
        clock: () => new Date(now),
      })
      expect(await dispatcher.runOnce()).toEqual({ success: true, data: 1 })
      connection.db.update(outboxEventTable).set({ availableAt: now }).run()
      expect(await dispatcher.runOnce()).toEqual({ success: true, data: 1 })
      expect(connection.db.select().from(outboxEventTable).get()).toMatchObject({
        status: "dead",
        attempts: 2,
        lastError: "permanent",
      })
    } finally {
      databaseClose(connection)
    }
  })

  test("dead-letters malformed payloads without calling Telegram", async () => {
    const connection = openDatabase()
    try {
      const inserted = enqueue(connection, eventCreate({ eventId: "customer-asset-uploaded:upload-2" }))
      expect(inserted.success).toBe(true)
      connection.db
        .update(outboxEventTable)
        .set({ payload: { eventId: "customer-asset-uploaded:upload-2" } })
        .where(eq(outboxEventTable.id, "outbox-1"))
        .run()
      const fake = telegramAdapterFake()
      const dispatcher = telegramOutboxDispatcherCreate({
        db: connection.db,
        adapter: fake,
        workerId: "worker-telegram-1",
      })
      expect(await dispatcher.runOnce()).toEqual({ success: true, data: 1 })
      expect(fake.invocations).toHaveLength(0)
      expect(connection.db.select().from(outboxEventTable).get()?.status).toBe("dead")
    } finally {
      databaseClose(connection)
    }
  })

  test("recovers a claimed event after a worker restart", () => {
    const connection = openDatabase()
    try {
      expect(enqueue(connection, eventCreate()).success).toBe(true)
      const claimed = outboxEventRepositoryClaimDue(connection.db, {
        workerId: "worker-telegram-1",
        now,
        leaseMs: 1000,
      })
      expect(claimed).toMatchObject({ success: true, data: { status: "processing" } })
      const recovered = outboxEventRepositoryRecoverLeases(connection.db, {
        now: "2026-08-17T00:00:02.000Z",
      })
      expect(recovered).toEqual({ success: true, data: 1 })
      expect(connection.db.select().from(outboxEventTable).get()).toMatchObject({ status: "pending", leaseOwner: null })
    } finally {
      databaseClose(connection)
    }
  })

  test("redacts the bot token from production adapter errors", async () => {
    const token = "123456:secret-token"
    const adapter = telegramAdapterProduction(
      {
        botToken: token,
        chatId: "-1001",
        apiBaseUrl: "https://api.telegram.org",
        timeoutMs: 1000,
        maxAttempts: 2,
        retryBaseMs: 1000,
        leaseMs: 1000,
        pollMs: 1000,
      },
      async () => new Response(`failed ${token}`, { status: 500 }),
    )
    const result = await adapter.sendUploadNotification(eventCreate())
    expect(result.success).toBe(false)
    if (!result.success) expect(result.errorMessage).not.toContain(token)
  })
})
