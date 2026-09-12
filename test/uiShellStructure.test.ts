import { describe, expect, test } from "bun:test"
import { readFile } from "node:fs/promises"

const shellSource = await readFile("src/ui/shell/UiShell.tsx", "utf8")

describe("UiShell navigation structure", () => {
  test("scopes view toggle to the shell navbar header with titles and accessible labels", () => {
    expect(shellSource).toContain('<header class="sticky top-0')
    expect(shellSource).toContain('title={ttc("Contributor view", "Mitwirkendenansicht")}')
    expect(shellSource).toContain('aria-label={ttc("Contributor view", "Mitwirkendenansicht")}')
    expect(shellSource).toContain('title={ttc("Admin view", "Adminansicht")}')
    expect(shellSource).toContain('aria-label={ttc("Admin view", "Adminansicht")}')
    expect(shellSource).toContain("mdiAccountOutline")
    expect(shellSource).toContain("mdiShieldAccountOutline")
    expect(shellSource).toContain("<Show when={state.canSwitchView()}>")
  })

  test("renders the single view toggle independently of the project breadcrumb", () => {
    const toggleStart = shellSource.indexOf("<Show when={state.canSwitchView()}>")
    const breadcrumbStart = shellSource.indexOf("<Show when={state.projectId()}>")
    expect(toggleStart).toBeGreaterThan(breadcrumbStart)
    expect(shellSource.slice(toggleStart, toggleStart + 2500)).toContain("state.contributorViewPath()")
    expect(shellSource.slice(toggleStart, toggleStart + 2500)).toContain("state.adminViewPath()")
  })

  test("uses UiLinkButton for the project breadcrumb targeting projectPath", () => {
    expect(shellSource).toContain("<UiLinkButton")
    expect(shellSource).toContain("href={state.projectPath()}")
    expect(shellSource).toContain("aria-label={state.projectLabel()}")
  })

  test("renders slash breadcrumb separators and current page crumb", () => {
    expect(shellSource).toContain('<nav\n              aria-label={ttc("Breadcrumb", "Brotkrumennavigation")}')
    expect(shellSource).toContain("state.breadcrumbPage()")
  })

  test("does not duplicate the view toggle in the mobile drawer or desktop sidebar", () => {
    // There should be exactly one canSwitchView check, situated in the navbar header
    const matches = shellSource.match(/state\.canSwitchView\(\)/g)
    expect(matches?.length).toBe(1)
  })

  test("keeps project IDs in the technical footer instead of under the project name", async () => {
    expect(shellSource).toContain('<header class="sticky top-0 z-30 border-b border-slate-200 bg-white/90 text-sm')
    expect(shellSource).toContain('state.accountName() !== "" && state.routeMode() === "admin"')
    expect(shellSource).not.toContain('state.accountName() === "" ? "font-medium" : "text-xs text-muted-foreground"')
    expect(shellSource).toContain('state.session().status === "authenticated" && state.projectId() !== ""')

    const breadcrumbStart = shellSource.indexOf(
      '<nav\n              aria-label={ttc("Breadcrumb", "Brotkrumennavigation")}',
    )
    const breadcrumbEnd = shellSource.indexOf("              </nav>", breadcrumbStart)
    expect(breadcrumbStart).toBeGreaterThanOrEqual(0)
    expect(breadcrumbEnd).toBeGreaterThan(breadcrumbStart)
    expect(shellSource.slice(breadcrumbStart, breadcrumbEnd)).not.toContain("state.projectId()")

    const headerEnd = shellSource.indexOf("      </header>")
    expect(headerEnd).toBeGreaterThanOrEqual(0)
    expect(shellSource.slice(0, headerEnd)).not.toContain(">{state.projectId()}</")
    expect(shellSource.slice(0, headerEnd)).not.toContain(">{state.accountId()}</")

    const mobileNavigationStart = shellSource.indexOf('<nav id="mobile-project-navigation"')
    expect(mobileNavigationStart).toBeGreaterThanOrEqual(0)
    expect(
      shellSource.slice(shellSource.indexOf("{/* Mobile Drawer Navigation */}"), mobileNavigationStart),
    ).not.toContain("state.accountId()")

    const footerStart = shellSource.indexOf('      <Show when={state.session().status === "authenticated"')
    expect(footerStart).toBeGreaterThanOrEqual(0)
    const technicalFooter = shellSource.slice(footerStart)
    expect(technicalFooter).toContain("state.projectId()")
    expect(technicalFooter).toContain("state.accountId()")
    expect(technicalFooter).toContain('<dt>{ttc("Project ID", "Projekt-ID")}:</dt>')

    const orgSource = await readFile("src/ui/organization/UiOrganizationSelector.tsx", "utf8")
    expect(orgSource).toContain("text-sm")
    expect(orgSource).not.toContain("text-xs")
  })
})
