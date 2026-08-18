import { ButtonIcon } from "#ui/interactive/button/ButtonIcon.jsx"
import { Icon } from "#ui/static/icon/Icon.jsx"
import { LoadingPage } from "#ui/static/loaders/LoadingPage.jsx"
import { mdiClose, mdiLogout, mdiMenu } from "@mdi/js"
import { A } from "@solidjs/router"
import type { RouteSectionProps } from "@solidjs/router"
import { For, Match, Show, Switch } from "solid-js"
import { UiLoginPage } from "../pages/UiLoginPage.jsx"
import { uiPaths } from "../routing/uiPaths.js"
import { uiShellStateCreate } from "./uiShellStateCreate.js"

/** Authenticated application shell with responsive project navigation. */
export function UiShell(p: RouteSectionProps) {
  const state = uiShellStateCreate()

  return (
    <div class="min-h-dvh bg-gray-50 text-gray-900 dark:bg-gray-900 dark:text-gray-50">
      <a
        href="#main"
        class="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-50 focus:rounded focus:bg-white focus:p-2"
      >
        Skip to content
      </a>
      <header class="border-b border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800">
        <div class="mx-auto flex max-w-7xl items-center justify-between gap-4 p-4">
          <A href={uiPaths.projects} class="text-lg font-semibold">
            Assets service
          </A>
          <div class="flex items-center gap-2">
            <Show when={state.session().status === "authenticated"}>
              <span class="hidden text-sm text-muted-foreground sm:inline">{state.session().principal?.subjectId}</span>
              <ButtonIcon
                icon={mdiLogout}
                variant="outline"
                size="sm"
                isLoading={state.isLoggingOut()}
                onClick={() => void state.logout()}
              >
                Sign out
              </ButtonIcon>
            </Show>
            <Show when={state.links().length > 0}>
              <button
                type="button"
                class="rounded-lg border border-gray-300 p-2 md:hidden"
                aria-expanded={state.menuOpen.get()}
                aria-controls="project-navigation"
                aria-label={state.menuOpen.get() ? "Close navigation" : "Open navigation"}
                onClick={state.toggleMenu}
              >
                <Icon path={state.menuOpen.get() ? mdiClose : mdiMenu} class="size-6" />
              </button>
            </Show>
          </div>
        </div>
      </header>

      <div class="mx-auto flex max-w-7xl flex-col gap-6 p-4 md:flex-row">
        <Show when={state.links().length > 0}>
          <nav
            id="project-navigation"
            aria-label="Project sections"
            class={`${state.menuOpen.get() ? "block" : "hidden"} md:block md:w-56 md:shrink-0`}
          >
            <ul class="flex flex-col gap-1">
              <For each={state.links()}>
                {(link) => (
                  <li>
                    <A
                      href={link.href}
                      onClick={state.closeMenu}
                      aria-current={state.isCurrent(link.href) ? "page" : undefined}
                      class="flex items-center gap-2 rounded-lg px-3 py-2 hover:bg-gray-100 aria-[current=page]:bg-gray-200 dark:hover:bg-gray-700 dark:aria-[current=page]:bg-gray-700"
                    >
                      <Icon path={link.icon} class="size-5" />
                      {link.label}
                    </A>
                  </li>
                )}
              </For>
            </ul>
          </nav>
        </Show>

        <main id="main" class="min-w-0 flex-1">
          <Switch>
            <Match when={!state.isKnownRoute()}>{p.children}</Match>
            <Match when={state.session().status === "authenticated"}>{p.children}</Match>
            <Match when={state.session().status === "anonymous" || state.session().status === "error"}>
              <UiLoginPage />
            </Match>
            <Match when={true}>
              <div aria-busy="true" aria-live="polite">
                <LoadingPage loadingItem="session" />
              </div>
            </Match>
          </Switch>
        </main>
      </div>
    </div>
  )
}
