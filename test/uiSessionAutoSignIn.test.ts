import { describe, expect, test } from "bun:test"

import { uiSessionAutoSignInAttemptRecord } from "../src/ui/session/uiSessionAutoSignInAttemptRecord.js"
import { uiSessionAutoSignInAttemptsExhaust } from "../src/ui/session/uiSessionAutoSignInAttemptsExhaust.js"
import { uiSessionAutoSignInAttemptsRead } from "../src/ui/session/uiSessionAutoSignInAttemptsRead.js"
import { uiSessionAutoSignInAttemptsReset } from "../src/ui/session/uiSessionAutoSignInAttemptsReset.js"
import { uiSessionAutoSignInMaxAttempts } from "../src/ui/session/uiSessionAutoSignInMaxAttempts.js"
import { uiSessionAutoSignInPreferenceRead } from "../src/ui/session/uiSessionAutoSignInPreferenceRead.js"
import { uiSessionAutoSignInPreferenceWrite } from "../src/ui/session/uiSessionAutoSignInPreferenceWrite.js"
import { uiSessionAutoSignInStorageKeys } from "../src/ui/session/uiSessionAutoSignInStorageKeys.js"

const storageCreate = () => {
  const values = new Map<string, string>()
  const storage = {
    getItem: (key: string) => values.get(key) ?? null,
    removeItem: (key: string) => values.delete(key),
    setItem: (key: string, value: string) => values.set(key, value),
  } as unknown as Storage
  return { storage, values }
}

describe("uiSessionAutoSignInPreference", () => {
  test("reads false by default and only accepts validated booleans", () => {
    const { storage, values } = storageCreate()

    expect(uiSessionAutoSignInPreferenceRead(storage)).toBe(false)

    values.set(uiSessionAutoSignInStorageKeys.preference, JSON.stringify(true))
    expect(uiSessionAutoSignInPreferenceRead(storage)).toBe(true)

    values.set(uiSessionAutoSignInStorageKeys.preference, JSON.stringify("invalid"))
    expect(uiSessionAutoSignInPreferenceRead(storage)).toBe(false)
  })

  test("writes preference to storage and resets attempt counter on change", () => {
    const { storage, values } = storageCreate()
    values.set(uiSessionAutoSignInStorageKeys.attempts, JSON.stringify(2))

    const writeResult = uiSessionAutoSignInPreferenceWrite(true, storage)
    expect(writeResult).toEqual({ success: true, data: true })
    expect(values.get(uiSessionAutoSignInStorageKeys.preference)).toBe(JSON.stringify(true))
    expect(values.has(uiSessionAutoSignInStorageKeys.attempts)).toBe(false)
    expect(uiSessionAutoSignInAttemptsRead(storage)).toBe(0)

    const invalidResult = uiSessionAutoSignInPreferenceWrite("not-a-boolean" as never, storage)
    expect(invalidResult.success).toBe(false)
  })
})

describe("uiSessionAutoSignInAttempts", () => {
  test("reads 0 by default and falls back safely on corrupted data", () => {
    const { storage, values } = storageCreate()

    expect(uiSessionAutoSignInAttemptsRead(storage)).toBe(0)

    values.set(uiSessionAutoSignInStorageKeys.attempts, JSON.stringify(2))
    expect(uiSessionAutoSignInAttemptsRead(storage)).toBe(2)

    values.set(uiSessionAutoSignInStorageKeys.attempts, "invalid json")
    expect(uiSessionAutoSignInAttemptsRead(storage)).toBe(0)

    values.set(uiSessionAutoSignInStorageKeys.attempts, JSON.stringify(-1))
    expect(uiSessionAutoSignInAttemptsRead(storage)).toBe(0)
  })

  test("bounds consecutive automatic sign-in attempts to the maximum limit", () => {
    const { storage, values } = storageCreate()

    expect(uiSessionAutoSignInMaxAttempts).toBe(3)

    const attempt1 = uiSessionAutoSignInAttemptRecord(storage)
    expect(attempt1).toEqual({ success: true, data: { allowed: true, attempts: 1 } })
    expect(values.get(uiSessionAutoSignInStorageKeys.attempts)).toBe(JSON.stringify(1))

    // Simulating second redirect attempt with persisted storage
    const attempt2 = uiSessionAutoSignInAttemptRecord(storage)
    expect(attempt2).toEqual({ success: true, data: { allowed: true, attempts: 2 } })
    expect(values.get(uiSessionAutoSignInStorageKeys.attempts)).toBe(JSON.stringify(2))

    // Simulating third redirect attempt with persisted storage
    const attempt3 = uiSessionAutoSignInAttemptRecord(storage)
    expect(attempt3).toEqual({ success: true, data: { allowed: true, attempts: 3 } })
    expect(values.get(uiSessionAutoSignInStorageKeys.attempts)).toBe(JSON.stringify(3))

    // Fourth attempt: maximum limit reached, redirect disallowed to prevent endless loop
    const attempt4 = uiSessionAutoSignInAttemptRecord(storage)
    expect(attempt4).toEqual({ success: true, data: { allowed: false, attempts: 3 } })
    expect(values.get(uiSessionAutoSignInStorageKeys.attempts)).toBe(JSON.stringify(3))
  })

  test("resets attempt budget when explicitly requested", () => {
    const { storage, values } = storageCreate()
    values.set(uiSessionAutoSignInStorageKeys.attempts, JSON.stringify(3))

    expect(uiSessionAutoSignInAttemptRecord(storage)).toEqual({
      success: true,
      data: { allowed: false, attempts: 3 },
    })

    const resetResult = uiSessionAutoSignInAttemptsReset(storage)
    expect(resetResult).toEqual({ success: true, data: true })
    expect(uiSessionAutoSignInAttemptsRead(storage)).toBe(0)

    const retryAttempt = uiSessionAutoSignInAttemptRecord(storage)
    expect(retryAttempt).toEqual({ success: true, data: { allowed: true, attempts: 1 } })
  })

  test("exhausts attempts to prevent auto-redirect immediately after logout", () => {
    const { storage, values } = storageCreate()
    expect(uiSessionAutoSignInAttemptsRead(storage)).toBe(0)

    const exhaustResult = uiSessionAutoSignInAttemptsExhaust(storage)
    expect(exhaustResult).toEqual({ success: true, data: true })
    expect(values.get(uiSessionAutoSignInStorageKeys.attempts)).toBe(JSON.stringify(3))

    const nextAttempt = uiSessionAutoSignInAttemptRecord(storage)
    expect(nextAttempt).toEqual({ success: true, data: { allowed: false, attempts: 3 } })
  })

  test("disabling or re-enabling preference resets exhausted budget", () => {
    const { storage } = storageCreate()
    uiSessionAutoSignInAttemptsExhaust(storage)
    expect(uiSessionAutoSignInAttemptsRead(storage)).toBe(3)

    uiSessionAutoSignInPreferenceWrite(true, storage)
    expect(uiSessionAutoSignInAttemptsRead(storage)).toBe(0)

    const nextAttempt = uiSessionAutoSignInAttemptRecord(storage)
    expect(nextAttempt).toEqual({ success: true, data: { allowed: true, attempts: 1 } })
  })
})
