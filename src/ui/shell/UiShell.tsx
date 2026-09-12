import { ButtonIcon } from "#ui/interactive/button/ButtonIcon.jsx"
import { ButtonIconOnly } from "#ui/interactive/button/ButtonIconOnly.jsx"
import { ThemeButton } from "#ui/interactive/theme/ThemeButton.jsx"
import { Icon } from "#ui/static/icon/Icon.jsx"
import { LoadingPage } from "#ui/static/loaders/LoadingPage.jsx"
import { mdiAccount } from "@adaptive-ds/mdi/mdiAccount.js"
import { mdiAccountOutline } from "@adaptive-ds/mdi/mdiAccountOutline.js"
import { mdiArrowLeft } from "@adaptive-ds/mdi/mdiArrowLeft.js"
import { mdiClose } from "@adaptive-ds/mdi/mdiClose.js"
import { mdiFolderMultipleOutline } from "@adaptive-ds/mdi/mdiFolderMultipleOutline.js"
import { mdiLogout } from "@adaptive-ds/mdi/mdiLogout.js"
import { mdiMenu } from "@adaptive-ds/mdi/mdiMenu.js"
import { mdiShieldAccountOutline } from "@adaptive-ds/mdi/mdiShieldAccountOutline.js"
import type { RouteSectionProps } from "@solidjs/router"
import { A } from "@solidjs/router"
import { For, Match, Show, Switch } from "solid-js"
import { classArr } from "#ui/utils/classArr.js"
import { UiLinkButton } from "../common/UiLinkButton.jsx"
import { UiLanguageToggle } from "../localization/UiLanguageToggle.jsx"
import { ttc } from "../localization/ttc.js"
import { UiOrganizationSelector } from "../organization/UiOrganizationSelector.jsx"
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
        {ttc("Skip to content", "Zum Inhalt springen")}
      </a>

      <header class="sticky top-0 z-30 border-b border-slate-200 bg-white/90 text-sm backdrop-blur-md dark:border-slate-800 dark:bg-slate-900/90">
        <div class="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-x-3 gap-y-2 px-4 py-2.5 sm:px-6 sm:py-3 lg:px-8 md:flex-nowrap md:gap-4">
          <A
            href={uiPaths.projects}
            aria-label={ttc("Assets service", "Medien-Service")}
            class="group flex items-center gap-2.5 rounded-lg text-sm font-semibold tracking-tight transition-colors hover:text-slate-700 dark:hover:text-slate-200 shrink-0"
          >
            <div class="flex size-7 items-center justify-center rounded-md bg-slate-900 text-white shadow-xs dark:bg-slate-100 dark:text-slate-900">
              <Icon path={mdiFolderMultipleOutline} class="size-4" />
            </div>
            <span class="font-bold hidden sm:inline">{ttc("Assets service", "Medien-Service")}</span>
          </A>

          <Show when={state.projectId()}>
            <nav
              aria-label={ttc("Breadcrumb", "Brotkrumennavigation")}
              class="order-3 flex w-full items-center gap-1.5 text-sm min-w-0 md:order-none md:w-auto"
            >
              <span class="text-muted-foreground select-none shrink-0" aria-hidden="true">
                /
              </span>
              <UiLinkButton
                href={state.projectPath()}
                variant="ghost"
                class="h-auto py-1 px-2 text-left flex flex-col items-start leading-tight min-w-0"
                aria-label={state.projectLabel()}
              >
                <Show when={state.projectName() !== ""}>
                  <span class="font-medium break-words">{state.projectName()}</span>
                </Show>
                <Show when={state.routeMode() === "contributor" && state.projectName() === ""}>
                  <span class="font-medium">{ttc("Project", "Projekt")}</span>
                </Show>
              </UiLinkButton>

              <Show when={state.breadcrumbPage()}>
                <span class="text-muted-foreground select-none shrink-0" aria-hidden="true">
                  /
                </span>
                <span class="font-medium truncate text-slate-700 dark:text-slate-300">{state.breadcrumbPage()}</span>
              </Show>
            </nav>
          </Show>

          <div class="order-2 flex items-center gap-2 shrink-0 ml-auto md:order-none">
            <Show when={state.session().status === "authenticated"}>
              <UiOrganizationSelector />
              <Show when={state.accountName() !== "" && state.routeMode() === "admin"}>
                <div class="hidden items-center gap-1.5 rounded-full border border-slate-200 bg-slate-100/70 px-2.5 py-1 text-sm md:inline-flex dark:border-slate-800 dark:bg-slate-800/60">
                  <Icon path={mdiAccount} class="size-4 text-muted-foreground" />
                  <span class="flex max-w-[120px] min-w-0 flex-col leading-tight lg:max-w-[180px]">
                    <span class="truncate font-medium">{state.accountName()}</span>
                  </span>
                </div>
              </Show>

              <Show when={state.canSwitchView()}>
                <div
                  class="flex items-center rounded-lg border border-slate-200 bg-slate-100 p-0.5 dark:border-slate-800 dark:bg-slate-900"
                  role="group"
                  aria-label={ttc("Active view", "Aktive Ansicht")}
                >
                  <A
                    href={state.contributorViewPath()}
                    title={ttc("Contributor view", "Mitwirkendenansicht")}
                    aria-label={ttc("Contributor view", "Mitwirkendenansicht")}
                    aria-current={state.routeMode() === "contributor" ? "page" : undefined}
                    class={classArr(
                      "flex size-8 items-center justify-center rounded-md transition-colors",
                      state.routeMode() === "contributor"
                        ? "bg-white text-slate-900 shadow-xs dark:bg-slate-800 dark:text-white"
                        : "text-muted-foreground hover:text-slate-900 dark:hover:text-white",
                    )}
                  >
                    <Icon path={mdiAccountOutline} class="size-4" />
                  </A>
                  <A
                    href={state.adminViewPath()}
                    title={ttc("Admin view", "Adminansicht")}
                    aria-label={ttc("Admin view", "Adminansicht")}
                    aria-current={state.routeMode() === "admin" ? "page" : undefined}
                    class={classArr(
                      "flex size-8 items-center justify-center rounded-md transition-colors",
                      state.routeMode() === "admin"
                        ? "bg-white text-slate-900 shadow-xs dark:bg-slate-800 dark:text-white"
                        : "text-muted-foreground hover:text-slate-900 dark:hover:text-white",
                    )}
                  >
                    <Icon path={mdiShieldAccountOutline} class="size-4" />
                  </A>
                </div>
              </Show>

              <ThemeButton />
              <UiLanguageToggle />

              <ButtonIcon
                icon={mdiLogout}
                aria-label={ttc("Sign out", "Abmelden")}
                variant="outline"
                isLoading={state.isLoggingOut()}
                onClick={() => void state.logout()}
              >
                <span class="hidden sm:inline">{ttc("Sign out", "Abmelden")}</span>
              </ButtonIcon>
            </Show>

            <Show when={state.routeMode() === "admin" && state.links().length > 0}>
              <ButtonIconOnly
                title={
                  state.menuOpen.get()
                    ? ttc("Close navigation", "Navigation schließen")
                    : ttc("Open navigation", "Navigation öffnen")
                }
                icon={state.menuOpen.get() ? mdiClose : mdiMenu}
                variant="ghost"
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
      <Show when={state.routeMode() === "admin" && state.menuOpen.get() && state.links().length > 0}>
        <div
          class="fixed inset-0 z-50 md:hidden"
          role="dialog"
          aria-modal="true"
          aria-label={ttc("Project navigation", "Projektnavigation")}
        >
          <div
            class="fixed inset-0 bg-slate-950/60 backdrop-blur-xs transition-opacity"
            onClick={state.closeMenu}
            aria-hidden="true"
          />
          <div class="fixed inset-y-0 left-0 flex w-72 max-w-[85vw] flex-col gap-5 border-r border-slate-200 bg-white p-5 shadow-2xl overflow-y-auto dark:border-slate-800 dark:bg-slate-900">
            <div class="flex items-center justify-between border-b border-slate-200 pb-3 dark:border-slate-800">
              <div class="flex items-center gap-2 min-w-0">
                <Icon path={mdiFolderMultipleOutline} class="size-5 text-slate-700 dark:text-slate-300 shrink-0" />
                <span class="flex min-w-0 flex-col leading-tight">
                  <span class="truncate text-sm font-semibold">{state.projectLabel()}</span>
                </span>
              </div>
              <ButtonIconOnly
                icon={mdiClose}
                title={ttc("Close navigation", "Navigation schließen")}
                variant="ghost"
                onClick={state.closeMenu}
              />
            </div>

            <Show when={state.accountName() !== ""}>
              <div class="flex min-w-0 items-center gap-2 border-b border-slate-200 pb-4 dark:border-slate-800">
                <Icon path={mdiAccount} class="size-4 shrink-0 text-muted-foreground" />
                <span class="flex min-w-0 flex-col leading-tight">
                  <span class="truncate text-sm font-medium">{state.accountName()}</span>
                </span>
              </div>
            </Show>

            <nav id="mobile-project-navigation" aria-label={ttc("Mobile project sections", "Mobile Projektbereiche")}>
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
                          class={classArr(
                            "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                            active()
                              ? "bg-slate-900 text-white shadow-xs dark:bg-slate-100 dark:text-slate-900"
                              : "text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-100",
                          )}
                        >
                          <Icon
                            path={link.icon}
                            class={classArr(
                              "size-5",
                              active() ? "text-white dark:text-slate-900" : "text-slate-400 dark:text-slate-500",
                            )}
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
                {ttc("Back to all projects", "Zurück zu allen Projekten")}
              </A>
            </div>
          </div>
        </div>
      </Show>

      <div
        class={classArr(
          "mx-auto flex w-full max-w-7xl flex-1 flex-col gap-6 px-4 py-6 sm:px-6 sm:py-8 lg:px-8",
          state.routeMode() === "admin" && "md:flex-row",
        )}
      >
        <Show when={state.routeMode() === "contributor" && state.links().length > 0}>
          <nav aria-label={ttc("Contributor navigation", "Navigation für Mitwirkende")}>
            <ul class="flex flex-wrap items-center gap-2">
              <For each={state.links()}>
                {(link) => {
                  const active = () => state.isCurrent(link.href)
                  return (
                    <li>
                      <A
                        href={link.href}
                        aria-current={active() ? "page" : undefined}
                        class={classArr(
                          "inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                          active()
                            ? "bg-slate-900 text-white shadow-xs dark:bg-slate-100 dark:text-slate-900"
                            : "border border-slate-200 bg-white text-slate-700 hover:bg-slate-100 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800",
                        )}
                      >
                        <Icon path={link.icon} class="size-4" />
                        <span>{link.label}</span>
                      </A>
                    </li>
                  )
                }}
              </For>
              <li class="ml-1 border-l border-slate-200 pl-3 dark:border-slate-800">
                <A href={uiPaths.projects} class="text-sm text-muted-foreground hover:underline">
                  {ttc("All projects", "Alle Projekte")}
                </A>
              </li>
            </ul>
          </nav>
        </Show>

        {/* Desktop Sidebar Navigation */}
        <Show when={state.routeMode() === "admin" && state.links().length > 0}>
          <aside class="hidden md:block md:w-56 md:shrink-0">
            <div class="sticky top-20 flex flex-col gap-4">
              <div class="flex items-center justify-between px-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                <span>{ttc("Navigation", "Navigation")}</span>
                <A href={uiPaths.projects} class="text-xs font-normal normal-case hover:underline">
                  {ttc("All projects", "Alle Projekte")}
                </A>
              </div>

              <nav id="desktop-project-navigation" aria-label={ttc("Project sections", "Projektbereiche")}>
                <ul class="flex flex-col gap-1">
                  <For each={state.links()}>
                    {(link) => {
                      const active = () => state.isCurrent(link.href)
                      return (
                        <li>
                          <A
                            href={link.href}
                            aria-current={active() ? "page" : undefined}
                            class={classArr(
                              "group flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                              active()
                                ? "bg-slate-900 text-white shadow-xs dark:bg-slate-100 dark:text-slate-900"
                                : "text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800/70 dark:hover:text-slate-100",
                            )}
                          >
                            <Icon
                              path={link.icon}
                              class={classArr(
                                "size-5 transition-colors",
                                active()
                                  ? "text-white dark:text-slate-900"
                                  : "text-slate-400 group-hover:text-slate-700 dark:text-slate-500 dark:group-hover:text-slate-300",
                              )}
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
                <LoadingPage loadingItem={ttc("session", "Sitzung")} />
              </div>
            </Match>
          </Switch>
        </main>
      </div>

      <Show when={state.session().status === "authenticated" && state.projectId() !== ""}>
        <footer class="mx-auto w-full max-w-7xl px-4 pb-5 text-[11px] text-slate-400 sm:px-6 lg:px-8 dark:text-slate-600">
          <dl class="flex flex-wrap gap-x-5 gap-y-1 border-t border-slate-200/70 pt-3 dark:border-slate-800/70">
            <div class="flex min-w-0 gap-1.5">
              <dt>{ttc("Project ID", "Projekt-ID")}:</dt>
              <dd class="break-all font-mono">{state.projectId()}</dd>
            </div>
            <Show when={state.accountId() !== ""}>
              <div class="flex min-w-0 gap-1.5">
                <dt>{ttc("Account ID", "Konto-ID")}:</dt>
                <dd class="break-all font-mono">{state.accountId()}</dd>
              </div>
            </Show>
          </dl>
        </footer>
      </Show>
    </div>
  )
}
