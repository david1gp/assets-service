import { For } from "solid-js"
import { Badge } from "#ui/static/badge/Badge.jsx"
import type { OutputDefinition } from "../../output/outputDefinitionSchema.js"
import { uiOutputTargetLabelRead } from "./uiOutputTargetLabelRead.js"

export type UiOutputTargetBadgesProps = {
  targets: OutputDefinition[]
  class?: string
}

/** Renders every output target of an asset as its own chip after the filename. */
export function UiOutputTargetBadges(p: UiOutputTargetBadgesProps) {
  return (
    <For each={p.targets}>
      {(target) => (
        <Badge
          variant="outline"
          title={target.key}
          class={`shrink-0 font-mono text-2xs whitespace-nowrap ${p.class ?? ""}`}
        >
          {uiOutputTargetLabelRead(target)}
        </Badge>
      )}
    </For>
  )
}
