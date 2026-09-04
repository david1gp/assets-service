import { languageSignal } from "./languageSignal.js"

/** Selects the English or German copy while preserving Solid reactivity. */
export const ttc = (englishText: string, germanText: string): string =>
  languageSignal.get() === "de" ? germanText : englishText
