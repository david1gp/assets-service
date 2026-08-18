/** Deep-linkable route paths of the admin SPA. */
export const uiPaths = {
  login: "/login",
  projects: "/",
  project: (projectId: string) => `/projects/${encodeURIComponent(projectId)}`,
  projectSettings: (projectId: string) => `/projects/${encodeURIComponent(projectId)}/settings`,
  assets: (projectId: string) => `/projects/${encodeURIComponent(projectId)}/assets`,
  asset: (projectId: string, assetId: string) =>
    `/projects/${encodeURIComponent(projectId)}/assets/${encodeURIComponent(assetId)}`,
  upload: (projectId: string) => `/projects/${encodeURIComponent(projectId)}/upload`,
  jobs: (projectId: string) => `/projects/${encodeURIComponent(projectId)}/jobs`,
  backups: (projectId: string) => `/projects/${encodeURIComponent(projectId)}/backups`,
  catalog: (projectId: string) => `/projects/${encodeURIComponent(projectId)}/catalog`,
  imports: (projectId: string) => `/projects/${encodeURIComponent(projectId)}/imports`,
  audit: (projectId: string) => `/projects/${encodeURIComponent(projectId)}/audit`,
} as const
