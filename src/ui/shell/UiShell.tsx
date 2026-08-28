import { ButtonIcon } from "#ui/interactive/button/ButtonIcon.jsx"
import { ButtonIconOnly } from "#ui/interactive/button/ButtonIconOnly.jsx"
import { ThemeButton } from "#ui/interactive/theme/ThemeButton.jsx"
import { Badge } from "#ui/static/badge/Badge.jsx"
import { Icon } from "#ui/static/icon/Icon.jsx"
import { LoadingPage } from "#ui/static/loaders/LoadingPage.jsx"
import { mdiAccount } from "@adaptive-ds/mdi/mdiAccount.js"
import { mdiArrowLeft } from "@adaptive-ds/mdi/mdiArrowLeft.js"
import { mdiChevronRight } from "@adaptive-ds/mdi/mdiChevronRight.js"
import { mdiClose } from "@adaptive-ds/mdi/mdiClose.js"
import { mdiFolderMultipleOutline } from "@adaptive-ds/mdi/mdiFolderMultipleOutline.js"
import { mdiLogout } from "@adaptive-ds/mdi/mdiLogout.js"
import { mdiMenu } from "@adaptive-ds/mdi/mdiMenu.js"
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
    <div class="min-h-dvh flex flex-col bg-slate-50 text-slate-900 dark:bg-slate-950 dark:text-slate-50">
      <a
        href="#main"
        class="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-slate-900 focus:px-4 focus:py-2 focus:text-sm focus:font-medium focus:text-white focus:shadow-lg focus:outline-none focus:ring-2 focus:ring-slate-400 dark:focus:bg-slate-100 dark:focus:text-slate-900"
      >
        Skip to content
      </a>

      <header class="sticky top-0 z-30 border-b border-slate-200 bg-white/90 backdrop-blur-md dark:border-slate-800 dark:bg-slate-900/90">
        <div class="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-3 sm:px-6 lg:px-8">
          <div class="flex items-center gap-3 min-w-0">
            <A
              href={uiPaths.projects}
              aria-label="Assets service"
              class="group flex items-center gap-2.5 rounded-lg text-sm font-semibold tracking-tight transition-colors hover:text-slate-700 dark:hover:text-slate-200 shrink-0"
            >
              <div class="flex size-7 items-center justify-center rounded-md bg-slate-900 text-white shadow-xs dark:bg-slate-100 dark:text-slate-900">
                <Icon path={mdiFolderMultipleOutline} class="size-4" />
              </div>
              <span class="font-bold hidden sm:inline">Assets service</span>
            </A>

            <Show when={state.projectId()}>
              <div class="flex items-center gap-1.5 min-w-0 text-sm">
                <Icon path={mdiChevronRight} class="size-4 text-muted-foreground shrink-0" />
                <Badge variant="subtle" class="font-mono font-medium max-w-[140px] truncate sm:max-w-[240px]">
                  {state.projectId()}
                </Badge>
              </div>
            </Show>
          </div>

          <div class="flex items-center gap-2 shrink-0">
            <Show when={state.session().status === "authenticated"}>
              <Show when={state.session().principal?.subjectId}>
                <div class="hidden items-center gap-1.5 rounded-full border border-slate-200 bg-slate-100/70 px-2.5 py-1 text-xs text-muted-foreground md:inline-flex dark:border-slate-800 dark:bg-slate-800/60">
                  <Icon path={mdiAccount} class="size-3.5" />
                  <span class="max-w-[120px] truncate lg:max-w-[180px]">{state.session().principal?.subjectId}</span>
                </div>
              </Show>

              <ThemeButton />

              <ButtonIcon
                icon={mdiLogout}
                aria-label="Sign out"
                variant="outline"
                size="sm"
                isLoading={state.isLoggingOut()}
                onClick={() => void state.logout()}
              >
                <span class="hidden sm:inline">Sign out</span>
              </ButtonIcon>
            </Show>

            <Show when={state.links().length > 0}>
              <ButtonIconOnly
                title={state.menuOpen.get() ? "Close navigation" : "Open navigation"}
                icon={state.menuOpen.get() ? mdiClose : mdiMenu}
                variant="ghost"
                size="sm"
                class="md:hidden"
                aria-expanded={state.menuOpen.get()}
                aria-controls="mobile-project-navigation"
                onClick={state.toggleMenu}
              />
            </Show>
          </div>
        </div>
      </header>

      {/* Mobile Drawer Navigation */}
      <Show when={state.menuOpen.get() && state.links().length > 0}>
        <div class="fixed inset-0 z-50 md:hidden" role="dialog" aria-modal="true" aria-label="Project navigation">
          <div
            class="fixed inset-0 bg-slate-950/60 backdrop-blur-xs transition-opacity"
            onClick={state.closeMenu}
            aria-hidden="true"
          />
          <div class="fixed inset-y-0 left-0 flex w-72 max-w-[85vw] flex-col gap-5 border-r border-slate-200 bg-white p-5 shadow-2xl overflow-y-auto dark:border-slate-800 dark:bg-slate-900">
            <div class="flex items-center justify-between border-b border-slate-200 pb-3 dark:border-slate-800">
              <div class="flex items-center gap-2 min-w-0">
                <Icon path={mdiFolderMultipleOutline} class="size-5 text-slate-700 dark:text-slate-300 shrink-0" />
                <span class="font-mono text-sm font-semibold truncate">{state.projectId()}</span>
              </div>
              <ButtonIconOnly
                icon={mdiClose}
                title="Close navigation"
                variant="ghost"
                size="sm"
                onClick={state.closeMenu}
              />
            </div>

            <nav id="mobile-project-navigation" aria-label="Mobile project sections">
              <ul class="flex flex-col gap-1">
                <For each={state.links()}>
                  {(link) => {
                    const active = () => state.isCurrent(link.href)
                    return (
                      <li>
                        <A
                          href={link.href}
                          onClick={state.closeMenu}
                          aria-current={active() ? "page" : undefined}
                          class={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                            active()
                              ? "bg-slate-900 text-white shadow-xs dark:bg-slate-100 dark:text-slate-900"
                              : "text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-100"
                          }`}
                        >
                          <Icon
                            path={link.icon}
                            class={`size-5 ${
                              active() ? "text-white dark:text-slate-900" : "text-slate-400 dark:text-slate-500"
                            }`}
                          />
                          <span>{link.label}</span>
                        </A>
                      </li>
                    )
                  }}
                </For>
              </ul>
            </nav>

            <div class="mt-auto border-t border-slate-200 pt-4 dark:border-slate-800">
              <A
                href={uiPaths.projects}
                onClick={state.closeMenu}
                class="flex items-center gap-2 text-xs font-medium text-muted-foreground hover:text-slate-900 dark:hover:text-slate-100"
              >
                <Icon path={mdiArrowLeft} class="size-4" />
                Back to all projects
              </A>
            </div>
          </div>
        </div>
      </Show>

      <div class="mx-auto flex w-full max-w-7xl flex-1 flex-col gap-6 px-4 py-6 sm:px-6 sm:py-8 lg:px-8 md:flex-row">
        {/* Desktop Sidebar Navigation */}
        <Show when={state.links().length > 0}>
          <aside class="hidden md:block md:w-56 md:shrink-0">
            <div class="sticky top-20 flex flex-col gap-4">
              <div class="flex items-center justify-between px-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                <span>Navigation</span>
                <A href={uiPaths.projects} class="text-xs font-normal normal-case hover:underline">
                  All projects
                </A>
              </div>

              <nav id="desktop-project-navigation" aria-label="Project sections">
                <ul class="flex flex-col gap-1">
                  <For each={state.links()}>
                    {(link) => {
                      const active = () => state.isCurrent(link.href)
                      return (
                        <li>
                          <A
                            href={link.href}
                            aria-current={active() ? "page" : undefined}
                            class={`group flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                              active()
                                ? "bg-slate-900 text-white shadow-xs dark:bg-slate-100 dark:text-slate-900"
                                : "text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800/70 dark:hover:text-slate-100"
                            }`}
                          >
                            <Icon
                              path={link.icon}
                              class={`size-5 transition-colors ${
                                active()
                                  ? "text-white dark:text-slate-900"
                                  : "text-slate-400 group-hover:text-slate-700 dark:text-slate-500 dark:group-hover:text-slate-300"
                              }`}
                            />
                            <span>{link.label}</span>
                          </A>
                        </li>
                      )
                    }}
                  </For>
                </ul>
              </nav>
            </div>
          </aside>
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
