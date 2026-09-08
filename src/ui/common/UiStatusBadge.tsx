import type { JSXElement } from "solid-js"
import { Badge } from "#ui/static/badge/Badge.jsx"
import { classArr } from "#ui/utils/classArr.js"
import { type UiStatusTone, uiStatusToneClassesRead } from "./uiStatusToneClassesRead.js"

export type UiStatusBadgeProps = {
  tone: UiStatusTone
  class?: string
  children: JSXElement
}

/** Badge with app status colors that keep AA contrast in light and dark mode. */
export function UiStatusBadge(p: UiStatusBadgeProps) {
  return (
    <Badge variant="outline" class={classArr(uiStatusToneClassesRead(p.tone), p.class)}>
      {p.children}
    </Badge>
  )
}
