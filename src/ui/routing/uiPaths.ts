import type { AuthenticationMode } from "../../authentication/authenticationModeSchema.js"

type UiProjectPaths = {
  project: (projectId: string) => string
  assets: (projectId: string) => string
  asset: (projectId: string, assetId: string) => string
  upload: (projectId: string) => string
}

const projectPathsCreate = (mode: AuthenticationMode): UiProjectPaths => ({
  project: (projectId) => `/projects/${encodeURIComponent(projectId)}/${mode}`,
  assets: (projectId) => `/projects/${encodeURIComponent(projectId)}/${mode}/assets`,
  asset: (projectId, assetId) =>
    `/projects/${encodeURIComponent(projectId)}/${mode}/assets/${encodeURIComponent(assetId)}`,
  upload: (projectId) => `/projects/${encodeURIComponent(projectId)}/${mode}/upload`,
})

const adminProjectPaths = {
  ...projectPathsCreate("admin"),
  projectSettings: (projectId: string) => `/projects/${encodeURIComponent(projectId)}/admin/settings`,
  jobs: (projectId: string) => `/projects/${encodeURIComponent(projectId)}/admin/jobs`,
  backups: (projectId: string) => `/projects/${encodeURIComponent(projectId)}/admin/backups`,
  catalog: (projectId: string) => `/projects/${encodeURIComponent(projectId)}/admin/catalog`,
  audit: (projectId: string) => `/projects/${encodeURIComponent(projectId)}/admin/audit`,
}

const contributorProjectPaths = projectPathsCreate("contributor")

/** Deep-linkable route paths for the admin and contributor project views. */
export const uiPaths = {
  login: "/login",
  projects: "/",
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
