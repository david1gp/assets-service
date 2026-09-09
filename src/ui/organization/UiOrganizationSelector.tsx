import { Icon } from "#ui/static/icon/Icon.jsx"
import { mdiChevronDown } from "@adaptive-ds/mdi/mdiChevronDown.js"
import { mdiDomain } from "@adaptive-ds/mdi/mdiDomain.js"
import { mdiLoading } from "@adaptive-ds/mdi/mdiLoading.js"
import { For, Show } from "solid-js"
import { ttc } from "../localization/ttc.js"
import { uiOrganizationSelectorStateCreate } from "./uiOrganizationSelectorStateCreate.js"

/** Compact organization selector or current organization badge for the authenticated shell. */
export function UiOrganizationSelector() {
  const state = uiOrganizationSelectorStateCreate()

  return (
    <Show when={state.currentOrganizationId() !== ""}>
      <Show
        when={state.showSelector()}
        fallback={
          <Show when={state.showLabel()}>
            <div class="hidden sm:inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-slate-100/70 px-2.5 py-1 text-xs dark:border-slate-800 dark:bg-slate-800/60">
              <Icon path={mdiDomain} class="size-3.5 text-muted-foreground" />
              <span class="truncate font-medium max-w-[140px]">{state.currentOrganizationName()}</span>
            </div>
          </Show>
        }
      >
        <div class="relative inline-flex items-center text-xs">
          <div class="pointer-events-none absolute left-2.5 flex items-center text-muted-foreground">
            <Icon path={mdiDomain} class="size-3.5" />
          </div>
          <select
            id="ui-organization-selector"
            aria-label={ttc("Organization", "Organisation")}
            value={state.selectedOrganizationId()}
            disabled={state.isSwitching()}
            onChange={(event) => void state.switchOrganization(event.currentTarget.value)}
            class="h-7 rounded-full border border-slate-200 bg-slate-100/70 pl-7 pr-6 py-0.5 text-xs font-medium text-slate-900 appearance-none focus:outline-none focus:ring-2 focus:ring-slate-400 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed dark:border-slate-800 dark:bg-slate-800/60 dark:text-slate-100 dark:focus:ring-slate-500 max-w-[130px] sm:max-w-[170px]"
          >
            <For each={state.organizations()}>
              {(org) => (
                <option
                  value={org.id}
                  selected={org.id === state.currentOrganizationId()}
                  class="bg-white text-slate-900 dark:bg-slate-900 dark:text-slate-50"
                >
                  {org.name}
                </option>
              )}
            </For>
          </select>
          <div class="pointer-events-none absolute right-2 flex items-center text-muted-foreground">
            <Show when={state.isSwitching()} fallback={<Icon path={mdiChevronDown} class="size-3" />}>
              <Icon path={mdiLoading} class="size-3 animate-spin" />
            </Show>
          </div>
        </div>
      </Show>
    </Show>
  )
}
