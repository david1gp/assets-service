import * as v from "valibot"
import type { SignalObject } from "#ui/utils/createSignalObject.js"
import { resultErrorCreate } from "../../schemas/resultErrorCreate.js"
import type { Result } from "../../schemas/resultSchema.js"
import { uiLocalStorageRead } from "./uiLocalStorageRead.js"
import { uiLocalStorageWrite } from "./uiLocalStorageWrite.js"

type UiFormDraftPersistenceOptions = {
  debounceMilliseconds?: number
  storage?: Storage
}

const resultOkCreate = (): Result<true> => ({ success: true, data: true })

/** Creates validated, debounced local persistence for one unfinished form draft. */
export const uiFormDraftPersistenceCreate = <T>(
  keyRead: () => string | undefined,
  schema: v.GenericSchema<unknown, T>,
  valueRead: () => T,
  options?: UiFormDraftPersistenceOptions,
) => {
  const hydrate = (): Result<T | undefined> => {
    const key = keyRead()
    if (key === undefined) return { success: true, data: undefined }
    return uiLocalStorageRead(key, schema, options?.storage)
  }

  const persist = (): Promise<Result<true>> => {
    const op = "uiFormDraftPersistenceCreate"
    const value = valueRead()
    const parsed = v.safeParse(schema, value)
    if (!parsed.success) return Promise.resolve(resultErrorCreate(op, v.summarize(parsed.issues), value))
    const key = keyRead()
    if (key === undefined) return Promise.resolve(resultOkCreate())
    return uiLocalStorageWrite(key, parsed.output, options)
  }

  const clear = (): Promise<Result<true>> => {
    const key = keyRead()
    if (key === undefined) return Promise.resolve(resultOkCreate())
    return uiLocalStorageWrite(key, null, options)
  }

  const signalCreate = <S>(signal: SignalObject<S>, onChange?: () => void): SignalObject<S> => ({
    get: signal.get,
    set: (value: S) => {
      signal.set(value)
      onChange?.()
      void persist()
    },
  })

  return { clear, hydrate, persist, signalCreate }
}
