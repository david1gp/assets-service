import * as v from "valibot"
import { createSignalObject } from "#ui/utils/createSignalObject.js"
import { uiLocalStorageRead } from "../storage/uiLocalStorageRead.js"
import { uiLocalStorageWrite } from "../storage/uiLocalStorageWrite.js"
import { type Language, languageSchema } from "./languageSchema.js"

const languagePreferenceKey = "assets-service:ui:language"

type LanguageSignalInitializeOptions = {
  browserLanguage?: string
  debounceMilliseconds?: number
  storage?: Storage
}

const languageState = createSignalObject<Language>("en")
let persistenceOptions: LanguageSignalInitializeOptions = {}

const languageBrowserDefaultRead = (browserLanguage?: string): Language => {
  const locale = browserLanguage ?? (typeof navigator === "undefined" ? undefined : navigator.language)
  return locale?.toLowerCase().startsWith("de") === true ? "de" : "en"
}

const languageSignalSet = (language: Language) => {
  const parsed = v.safeParse(languageSchema, language)
  if (!parsed.success) return
  languageState.set(parsed.output)
  void uiLocalStorageWrite(languagePreferenceKey, parsed.output, persistenceOptions)
}

const languageSignalInitialize = (options?: LanguageSignalInitializeOptions): Language => {
  persistenceOptions = options ?? {}
  const hydrated = uiLocalStorageRead(languagePreferenceKey, languageSchema, options?.storage)
  const language =
    hydrated.success && hydrated.data !== undefined
      ? hydrated.data
      : languageBrowserDefaultRead(options?.browserLanguage)
  languageState.set(language)
  return language
}

/** Global validated language state with browser-default initialization and deferred persistence. */
export const languageSignal = {
  get: languageState.get,
  initialize: languageSignalInitialize,
  set: languageSignalSet,
}
