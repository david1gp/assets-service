import { ButtonIcon } from "#ui/interactive/button/ButtonIcon.jsx"
import { LoadingPage } from "#ui/static/loaders/LoadingPage.jsx"
import { mdiRefresh } from "@adaptive-ds/mdi/mdiRefresh.js"
import type { JSXElement } from "solid-js"
import { Match, Switch } from "solid-js"
import type { UiQuery } from "../query/uiQueryCreate.js"
import { UiNotice } from "./UiNotice.jsx"

export type UiQueryViewProps<T> = {
  query: UiQuery<T>
  loadingItem: string
  emptyMessage?: string
  isEmpty?: (data: T) => boolean
  children: (data: T) => JSXElement
}

/** Renders the loading, error, empty, and ready states of one query. */
export function UiQueryView<T>(p: UiQueryViewProps<T>) {
  return (
    <Switch>
      <Match when={p.query.status() === "error"}>
        <UiNotice tone="negative" role="alert">
          <p>{p.query.errorMessage()}</p>
          <ButtonIcon class="mt-3" icon={mdiRefresh} variant="outline" onClick={() => p.query.reload()}>
            Try again
          </ButtonIcon>
        </UiNotice>
      </Match>
      <Match when={p.query.status() === "ready" && p.query.data() !== null}>
        <Switch>
          <Match when={p.isEmpty !== undefined && p.isEmpty(p.query.data() as T)}>
            <p class="rounded-lg border border-dashed border-gray-300 p-6 text-center text-muted-foreground">
              {p.emptyMessage ?? "Nothing to show yet."}
            </p>
          </Match>
          <Match when={true}>{p.children(p.query.data() as T)}</Match>
        </Switch>
      </Match>
      <Match when={true}>
        <div aria-busy="true" aria-live="polite">
          <LoadingPage loadingItem={p.loadingItem} />
        </div>
      </Match>
    </Switch>
  )
}
