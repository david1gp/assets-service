import { SetPageTitle } from "#ui/static/meta/SetPageTitle.jsx"
import type { JSXElement } from "solid-js"
import { Show } from "solid-js"

export type UiPageHeadingProps = {
  title: string
  subtitle?: string
  actions?: JSXElement
}

/** Page title block with an optional subtitle and action area. */
export function UiPageHeading(p: UiPageHeadingProps) {
  return (
    <>
      <SetPageTitle title={`${p.title} · Assets service`} />
      <div class="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 class="text-2xl font-semibold">{p.title}</h1>
          <Show when={p.subtitle}>
            <p class="mt-1 text-muted-foreground">{p.subtitle}</p>
          </Show>
        </div>
        <Show when={p.actions}>
          <div class="flex flex-wrap gap-2">{p.actions}</div>
        </Show>
      </div>
    </>
  )
}
