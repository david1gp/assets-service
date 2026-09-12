import { describe, expect, test } from "bun:test"
import { uiLegacyRouteRedirectRead } from "../src/ui/routing/uiLegacyRouteRedirectRead.js"
import { uiPaths } from "../src/ui/routing/uiPaths.js"
import { uiProjectRouteModeRead } from "../src/ui/routing/uiProjectRouteModeRead.js"
import { uiRouteIsKnown } from "../src/ui/routing/uiRouteIsKnown.js"
import { uiRouteModeAllowed } from "../src/ui/routing/uiRouteModeAllowed.js"
import { uiAssetIdFromPathnameRead } from "../src/ui/shell/uiAssetIdFromPathnameRead.js"
import { uiNavigationActiveCheck } from "../src/ui/shell/uiNavigationActiveCheck.js"
import { uiNavigationLinksRead } from "../src/ui/shell/uiNavigationLinksRead.js"
import { uiProjectIdFromPathnameRead } from "../src/ui/shell/uiProjectIdFromPathnameRead.js"

describe("uiNavigationActiveCheck", () => {
  test("matches exact routes", () => {
    expect(uiNavigationActiveCheck("/", "/")).toBe(true)
    expect(uiNavigationActiveCheck("/projects/demo/assets", "/projects/demo/assets")).toBe(true)
    expect(uiNavigationActiveCheck("/projects/demo/upload", "/projects/demo/upload")).toBe(true)
  })

  test("matches nested sub-routes under a section", () => {
    expect(uiNavigationActiveCheck("/projects/demo/assets/asset-1", "/projects/demo/assets")).toBe(true)
    expect(uiNavigationActiveCheck("/projects/demo/assets/asset-1/edit", "/projects/demo/assets")).toBe(true)
  })

  test("does not match different sections with similar prefixes", () => {
    expect(uiNavigationActiveCheck("/projects/demo/assets-extended", "/projects/demo/assets")).toBe(false)
    expect(uiNavigationActiveCheck("/projects/demo/upload", "/projects/demo/assets")).toBe(false)
    expect(uiNavigationActiveCheck("/projects/demo/jobs", "/projects/demo/assets")).toBe(false)
  })

  test("root does not match arbitrary nested paths", () => {
    expect(uiNavigationActiveCheck("/projects/demo/assets", "/")).toBe(false)
  })
})

describe("uiProjectIdFromPathnameRead", () => {
  test("extracts project id from project routes", () => {
    expect(uiProjectIdFromPathnameRead("/projects/demo")).toBe("demo")
    expect(uiProjectIdFromPathnameRead("/projects/demo/assets")).toBe("demo")
    expect(uiProjectIdFromPathnameRead("/projects/demo/assets/asset-123")).toBe("demo")
  })

  test("decodes URI-encoded project identifiers", () => {
    expect(uiProjectIdFromPathnameRead("/projects/my%20cool%20project/assets")).toBe("my cool project")
  })

  test("returns undefined for non-project routes", () => {
    expect(uiProjectIdFromPathnameRead("/")).toBeUndefined()
    expect(uiProjectIdFromPathnameRead("/login")).toBeUndefined()
    expect(uiProjectIdFromPathnameRead("/about")).toBeUndefined()
  })
})

describe("mode-specific project routing", () => {
  test("builds canonical organization-scoped paths", () => {
    expect(uiPaths.orgProject("adaptive", "media-library")).toBe("/orgs/adaptive/projects/media-library")
    expect(uiPaths.admin.assets("adaptive", "media-library")).toBe("/orgs/adaptive/projects/media-library/admin/assets")
    expect(uiPaths.contributor.asset("adaptive", "media-library", "hero image")).toBe(
      "/orgs/adaptive/projects/media-library/contributor/assets/hero%20image",
    )
    expect(
      uiNavigationLinksRead({ organizationSlug: "adaptive", projectSlug: "media-library" }, "admin")[0]?.href,
    ).toBe("/orgs/adaptive/projects/media-library/admin/assets")
  })

  test("recognizes canonical routes and extracts canonical asset ids", () => {
    expect(uiRouteIsKnown("/orgs/adaptive/projects/media-library/admin/assets")).toBe(true)
    expect(uiRouteIsKnown("/orgs/adaptive/projects/media-library/contributor/assets/hero")).toBe(true)
    expect(uiRouteIsKnown("/orgs/adaptive/projects/media-library/contributor/jobs")).toBe(false)
    expect(uiAssetIdFromPathnameRead("/orgs/adaptive/projects/media-library/admin/assets/hero%20image")).toBe(
      "hero image",
    )
  })

  test("builds paths inside the selected project view", () => {
    expect(uiPaths.admin.assets("demo")).toBe("/projects/demo/admin/assets")
    expect(uiPaths.contributor.asset("demo", "hero image")).toBe("/projects/demo/contributor/assets/hero%20image")
    expect(uiPaths.admin.jobs("demo")).toBe("/projects/demo/admin/jobs")
  })

  test("keeps shell navigation inside the active view", () => {
    expect(uiNavigationLinksRead("demo", "contributor").map((link) => link.href)).toEqual([
      "/projects/demo/contributor/upload",
      "/projects/demo/contributor/assets",
    ])
    expect(uiNavigationLinksRead("demo", "admin").every((link) => link.href.includes("/admin/"))).toBe(true)
  })

  test("recognizes only supported mode-specific routes", () => {
    expect(uiRouteIsKnown("/projects/demo/admin")).toBe(true)
    expect(uiRouteIsKnown("/projects/demo/contributor")).toBe(true)
    expect(uiRouteIsKnown("/projects/demo/admin/assets")).toBe(true)
    expect(uiRouteIsKnown("/projects/demo/admin/assets/asset-1")).toBe(true)
    expect(uiRouteIsKnown("/projects/demo/contributor/upload")).toBe(true)
    expect(uiRouteIsKnown("/projects/demo/contributor/jobs")).toBe(false)
    expect(uiRouteIsKnown("/projects/demo/admin/unknown")).toBe(false)
  })

  test("recognizes every canonical direct route in both view trees", () => {
    for (const section of ["settings", "assets", "upload", "jobs", "backups", "catalog", "audit"]) {
      expect(uiRouteIsKnown(`/projects/demo/admin/${section}`)).toBe(true)
    }
    for (const path of [
      "/projects/demo/contributor",
      "/projects/demo/contributor/assets",
      "/projects/demo/contributor/assets/hero",
      "/projects/demo/contributor/upload",
    ]) {
      expect(uiRouteIsKnown(path)).toBe(true)
    }
    expect(uiRouteIsKnown("/projects/demo/contributor/jobs")).toBe(false)
    expect(uiRouteIsKnown("/projects/demo/admin/assets/hero/extra")).toBe(false)
  })

  test("reads the explicit route view and trusts the principal mode for access", () => {
    expect(uiProjectRouteModeRead("/projects/demo/admin/assets")).toBe("admin")
    expect(uiProjectRouteModeRead("/projects/demo/contributor/assets")).toBe("contributor")
    expect(uiProjectRouteModeRead("/orgs/adaptive/projects/media-library/admin/assets")).toBe("admin")
    expect(uiProjectRouteModeRead("/orgs/adaptive/projects/media-library/contributor/assets")).toBe("contributor")
    expect(uiProjectRouteModeRead("/projects/demo/assets")).toBeUndefined()
    expect(uiRouteModeAllowed("/projects/demo/admin/assets", "admin")).toBe(true)
    expect(uiRouteModeAllowed("/projects/demo/contributor/assets", "admin")).toBe(true)
    expect(uiRouteModeAllowed("/projects/demo/admin/assets", "contributor")).toBe(false)
  })

  test("redirects legacy routes without allowing a contributor to enter admin", () => {
    expect(uiLegacyRouteRedirectRead("/projects/demo/assets/hero", "admin", "?dialog=outputs")).toBe(
      "/projects/demo/admin/assets/hero?dialog=outputs",
    )
    expect(uiLegacyRouteRedirectRead("/projects/demo/jobs", "contributor")).toBe("/projects/demo/contributor")
    expect(uiLegacyRouteRedirectRead("/projects/demo/jobs", "admin")).toBe("/projects/demo/admin/jobs")
    expect(uiLegacyRouteRedirectRead("/projects/demo/not-a-route", "admin")).toBeUndefined()
    expect(uiLegacyRouteRedirectRead("/projects/demo/%E0%A4%A", "admin")).toBeUndefined()
    expect(uiLegacyRouteRedirectRead("/projects/team%2Fblue/assets", "admin")).toBe(
      "/projects/team%2Fblue/admin/assets",
    )
  })

  test("redirects legacy routes to canonical organization/project paths", () => {
    expect(
      uiLegacyRouteRedirectRead(
        "/projects/project-id/assets/hero",
        "admin",
        "?dialog=outputs",
        "adaptive",
        "media-library",
      ),
    ).toBe("/orgs/adaptive/projects/media-library/admin/assets/hero?dialog=outputs")
    expect(uiLegacyRouteRedirectRead("/projects/project-id/admin/jobs", "admin", "", "adaptive", "media-library")).toBe(
      "/orgs/adaptive/projects/media-library/admin/jobs",
    )
  })

  test("redirects every explicit ID-based mode route to its canonical path", () => {
    const adminRoutes = [
      ["/projects/project-id/admin", "/orgs/adaptive/projects/media-library/admin"],
      ["/projects/project-id/admin/settings", "/orgs/adaptive/projects/media-library/admin/settings"],
      ["/projects/project-id/admin/assets", "/orgs/adaptive/projects/media-library/admin/assets"],
      [
        "/projects/project-id/admin/assets/hero%20image",
        "/orgs/adaptive/projects/media-library/admin/assets/hero%20image",
      ],
      ["/projects/project-id/admin/upload", "/orgs/adaptive/projects/media-library/admin/upload"],
      ["/projects/project-id/admin/jobs", "/orgs/adaptive/projects/media-library/admin/jobs"],
      ["/projects/project-id/admin/backups", "/orgs/adaptive/projects/media-library/admin/backups"],
      ["/projects/project-id/admin/catalog", "/orgs/adaptive/projects/media-library/admin/catalog"],
      ["/projects/project-id/admin/audit", "/orgs/adaptive/projects/media-library/admin/audit"],
    ] as const
    for (const [pathname, target] of adminRoutes) {
      expect(uiLegacyRouteRedirectRead(pathname, "admin", "?tab=overview", "adaptive", "media-library")).toBe(
        `${target}?tab=overview`,
      )
    }

    const contributorRoutes = [
      ["/projects/project-id/contributor", "/orgs/adaptive/projects/media-library/contributor"],
      ["/projects/project-id/contributor/assets", "/orgs/adaptive/projects/media-library/contributor/assets"],
      [
        "/projects/project-id/contributor/assets/hero%20image",
        "/orgs/adaptive/projects/media-library/contributor/assets/hero%20image",
      ],
      ["/projects/project-id/contributor/upload", "/orgs/adaptive/projects/media-library/contributor/upload"],
    ] as const
    for (const [pathname, target] of contributorRoutes) {
      expect(uiLegacyRouteRedirectRead(pathname, "contributor", "?tab=overview", "adaptive", "media-library")).toBe(
        `${target}?tab=overview`,
      )
    }
    expect(
      uiLegacyRouteRedirectRead(
        "/projects/project-id/admin/assets",
        "contributor",
        "?tab=overview",
        "adaptive",
        "media-library",
      ),
    ).toBe("/orgs/adaptive/projects/media-library/admin/assets?tab=overview")
    expect(
      uiLegacyRouteRedirectRead(
        "/projects/project-id/contributor/assets",
        "admin",
        "?tab=overview",
        "adaptive",
        "media-library",
      ),
    ).toBe("/orgs/adaptive/projects/media-library/contributor/assets?tab=overview")
  })

  test("redirects every recognized legacy admin section and preserves contributor fallback", () => {
    for (const section of ["settings", "assets", "upload", "jobs", "backups", "catalog", "audit"]) {
      expect(uiLegacyRouteRedirectRead(`/projects/demo/${section}`, "admin")).toBe(`/projects/demo/admin/${section}`)
    }
    for (const section of ["settings", "jobs", "backups", "catalog", "audit"]) {
      expect(uiLegacyRouteRedirectRead(`/projects/demo/${section}`, "contributor", "?tab=overview")).toBe(
        "/projects/demo/contributor?tab=overview",
      )
    }
    expect(uiLegacyRouteRedirectRead("/projects/demo/assets/hero%20image", "contributor")).toBe(
      "/projects/demo/contributor/assets/hero%20image",
    )
  })

  test("guards every admin direct route while allowing contributor routes for both modes", () => {
    for (const section of ["settings", "assets", "upload", "jobs", "backups", "catalog", "audit"]) {
      const path = `/projects/demo/admin/${section}`
      expect(uiRouteModeAllowed(path, "admin")).toBe(true)
      expect(uiRouteModeAllowed(path, "contributor")).toBe(false)
    }
    for (const path of [
      "/projects/demo/contributor",
      "/projects/demo/contributor/assets",
      "/projects/demo/contributor/assets/hero",
      "/projects/demo/contributor/upload",
    ]) {
      expect(uiRouteModeAllowed(path, "admin")).toBe(true)
      expect(uiRouteModeAllowed(path, "contributor")).toBe(true)
    }
  })
})
