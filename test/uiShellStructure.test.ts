import { readFile } from "node:fs/promises"
import { describe, expect, test } from "bun:test"

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

  test("aligns primary navbar typography to text-sm and preserves subtle secondary IDs", async () => {
    expect(shellSource).toContain('<header class="sticky top-0 z-30 border-b border-slate-200 bg-white/90 text-sm')
    expect(shellSource).toContain('state.accountName() === "" ? "font-medium" : "text-xs text-muted-foreground"')
    expect(shellSource).toContain('state.projectName() === "" ? "font-medium" : "text-xs text-muted-foreground"')

    const orgSource = await readFile("src/ui/organization/UiOrganizationSelector.tsx", "utf8")
    expect(orgSource).toContain("text-sm")
    expect(orgSource).not.toContain("text-xs")
  })
})
