import type { AuthenticationMode } from "../../authentication/authenticationModeSchema.js"
import { uiProjectRouteStore } from "./uiProjectRouteStore.js"

type UiProjectPaths = {
  project: (organizationSlug: string, projectSlug?: string) => string
  assets: (organizationSlug: string, projectSlug?: string) => string
  asset: (organizationSlug: string, projectSlug: string, assetId?: string) => string
  upload: (organizationSlug: string, projectSlug?: string) => string
}

const routeArgumentsRead = (projectId: string, projectSlug?: string): readonly [string, string?] => {
  if (projectSlug !== undefined) return [projectId, projectSlug]
  const route = uiProjectRouteStore.get()
  return route?.projectId === projectId ? [route.organizationSlug, route.projectSlug] : [projectId]
}

const projectPathsCreate = (mode: AuthenticationMode): UiProjectPaths => ({
  project: (organizationSlug, projectSlug) => {
    const [org, slug] = routeArgumentsRead(organizationSlug, projectSlug)
    return slug === undefined
      ? `/projects/${encodeURIComponent(org)}/${mode}`
      : `/orgs/${encodeURIComponent(org)}/projects/${encodeURIComponent(slug)}/${mode}`
  },
  assets: (organizationSlug, projectSlug) => {
    const [org, slug] = routeArgumentsRead(organizationSlug, projectSlug)
    return slug === undefined
      ? `/projects/${encodeURIComponent(org)}/${mode}/assets`
      : `/orgs/${encodeURIComponent(org)}/projects/${encodeURIComponent(slug)}/${mode}/assets`
  },
  asset: (organizationSlug, projectSlug, assetId) => {
    if (assetId === undefined) {
      const route = uiProjectRouteStore.get()
      if (route?.projectId === organizationSlug)
        return `/orgs/${encodeURIComponent(route.organizationSlug)}/projects/${encodeURIComponent(route.projectSlug)}/${mode}/assets/${encodeURIComponent(projectSlug)}`
      return `/projects/${encodeURIComponent(organizationSlug)}/${mode}/assets/${encodeURIComponent(projectSlug)}`
    }
    return `/orgs/${encodeURIComponent(organizationSlug)}/projects/${encodeURIComponent(projectSlug)}/${mode}/assets/${encodeURIComponent(assetId)}`
  },
  upload: (organizationSlug, projectSlug) => {
    const [org, slug] = routeArgumentsRead(organizationSlug, projectSlug)
    return slug === undefined
      ? `/projects/${encodeURIComponent(org)}/${mode}/upload`
      : `/orgs/${encodeURIComponent(org)}/projects/${encodeURIComponent(slug)}/${mode}/upload`
  },
})

const adminProjectPaths = {
  ...projectPathsCreate("admin"),
  projectSettings: (organizationSlug: string, projectSlug?: string) => {
    const [org, slug] = routeArgumentsRead(organizationSlug, projectSlug)
    return slug === undefined
      ? `/projects/${encodeURIComponent(org)}/admin/settings`
      : `/orgs/${encodeURIComponent(org)}/projects/${encodeURIComponent(slug)}/admin/settings`
  },
  jobs: (organizationSlug: string, projectSlug?: string) => {
    const [org, slug] = routeArgumentsRead(organizationSlug, projectSlug)
    return slug === undefined
      ? `/projects/${encodeURIComponent(org)}/admin/jobs`
      : `/orgs/${encodeURIComponent(org)}/projects/${encodeURIComponent(slug)}/admin/jobs`
  },
  backups: (organizationSlug: string, projectSlug?: string) => {
    const [org, slug] = routeArgumentsRead(organizationSlug, projectSlug)
    return slug === undefined
      ? `/projects/${encodeURIComponent(org)}/admin/backups`
      : `/orgs/${encodeURIComponent(org)}/projects/${encodeURIComponent(slug)}/admin/backups`
  },
  catalog: (organizationSlug: string, projectSlug?: string) => {
    const [org, slug] = routeArgumentsRead(organizationSlug, projectSlug)
    return slug === undefined
      ? `/projects/${encodeURIComponent(org)}/admin/catalog`
      : `/orgs/${encodeURIComponent(org)}/projects/${encodeURIComponent(slug)}/admin/catalog`
  },
  audit: (organizationSlug: string, projectSlug?: string) => {
    const [org, slug] = routeArgumentsRead(organizationSlug, projectSlug)
    return slug === undefined
      ? `/projects/${encodeURIComponent(org)}/admin/audit`
      : `/orgs/${encodeURIComponent(org)}/projects/${encodeURIComponent(slug)}/admin/audit`
  },
}

const contributorProjectPaths = projectPathsCreate("contributor")

/** Deep-linkable route paths for the admin and contributor project views. */
export const uiPaths = {
  login: "/login",
  projects: "/",
  orgProject: (organizationSlug: string, projectSlug: string) =>
    `/orgs/${encodeURIComponent(organizationSlug)}/projects/${encodeURIComponent(projectSlug)}`,
  admin: adminProjectPaths,
  contributor: contributorProjectPaths,
  // Kept as a compatibility surface for callers that have not migrated to a view yet.
  project: (projectId: string) => `/projects/${encodeURIComponent(projectId)}`,
  projectSettings: (projectId: string) => `/projects/${encodeURIComponent(projectId)}/settings`,
  assets: (projectId: string) => `/projects/${encodeURIComponent(projectId)}/assets`,
  asset: (projectId: string, assetId: string) =>
    `/projects/${encodeURIComponent(projectId)}/assets/${encodeURIComponent(assetId)}`,
  upload: (projectId: string) => `/projects/${encodeURIComponent(projectId)}/upload`,
  jobs: (projectId: string) => `/projects/${encodeURIComponent(projectId)}/jobs`,
  backups: (projectId: string) => `/projects/${encodeURIComponent(projectId)}/backups`,
  catalog: (projectId: string) => `/projects/${encodeURIComponent(projectId)}/catalog`,
  audit: (projectId: string) => `/projects/${encodeURIComponent(projectId)}/audit`,
} as const
