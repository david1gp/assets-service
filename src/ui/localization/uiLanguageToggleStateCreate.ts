import { createMemo } from "solid-js"
import { languageSignal } from "./languageSignal.js"
import { ttc } from "./ttc.js"

/** Holds the reactive label and action for the global language control. */
export const uiLanguageToggleStateCreate = () => {
  const title = createMemo(() => ttc("Switch to German", "Auf Englisch wechseln"))

  return {
    title,
    shortLabel: () => ttc("DE", "EN"),
    toggle: () => languageSignal.set(languageSignal.get() === "en" ? "de" : "en"),
  }
}
