import type { JSXElement } from "solid-js"
import { type UiNoticeTone, uiNoticeToneClassesRead } from "./uiNoticeToneClassesRead.js"

export type UiNoticeProps = {
  tone: UiNoticeTone
  role: "alert" | "status"
  id?: string
  class?: string
  children: JSXElement
}

/** Inline alert or status panel using app tones that keep AA contrast. */
export function UiNotice(p: UiNoticeProps) {
  return (
    <div id={p.id} role={p.role} class={`rounded-lg border p-3 ${uiNoticeToneClassesRead(p.tone)} ${p.class ?? ""}`}>
      {p.children}
    </div>
  )
}
