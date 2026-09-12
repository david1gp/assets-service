import { mdiClipboardTextClock } from "@adaptive-ds/mdi/mdiClipboardTextClock.js"
import { mdiCloudUpload } from "@adaptive-ds/mdi/mdiCloudUpload.js"
import { mdiCogOutline } from "@adaptive-ds/mdi/mdiCogOutline.js"
import { mdiDatabaseArrowUp } from "@adaptive-ds/mdi/mdiDatabaseArrowUp.js"
import { mdiFileTree } from "@adaptive-ds/mdi/mdiFileTree.js"
import { mdiImageMultiple } from "@adaptive-ds/mdi/mdiImageMultiple.js"
import { mdiPlaylistCheck } from "@adaptive-ds/mdi/mdiPlaylistCheck.js"
import type { AuthenticationMode } from "../../authentication/authenticationModeSchema.js"
import { ttc } from "../localization/ttc.js"
import { uiPaths } from "../routing/uiPaths.js"

export type UiNavigationLink = { href: string; label: string; icon: string }
type UiNavigationProject = { organizationSlug: string; projectSlug: string }

/** Lists the primary navigation targets of one project. */
export const uiNavigationLinksRead = (
  project: string | UiNavigationProject,
  mode: AuthenticationMode = "admin",
): readonly UiNavigationLink[] => {
  const path = typeof project === "string" ? undefined : project
  const projectId = typeof project === "string" ? project : ""
  const contributor = uiPaths.contributor
  const admin = uiPaths.admin
  const contributorAssets = () =>
    path ? contributor.assets(path.organizationSlug, path.projectSlug) : contributor.assets(projectId)
  const contributorUpload = () =>
    path ? contributor.upload(path.organizationSlug, path.projectSlug) : contributor.upload(projectId)
  const adminAssets = () => (path ? admin.assets(path.organizationSlug, path.projectSlug) : admin.assets(projectId))
  const adminUpload = () => (path ? admin.upload(path.organizationSlug, path.projectSlug) : admin.upload(projectId))
  const adminJobs = () => (path ? admin.jobs(path.organizationSlug, path.projectSlug) : admin.jobs(projectId))
  const adminBackups = () => (path ? admin.backups(path.organizationSlug, path.projectSlug) : admin.backups(projectId))
  const adminCatalog = () => (path ? admin.catalog(path.organizationSlug, path.projectSlug) : admin.catalog(projectId))
  const adminAudit = () => (path ? admin.audit(path.organizationSlug, path.projectSlug) : admin.audit(projectId))
  const adminSettings = () =>
    path ? admin.projectSettings(path.organizationSlug, path.projectSlug) : admin.projectSettings(projectId)
  if (mode === "contributor") {
    return [
      {
        href: contributorUpload(),
        label: ttc("Upload new", "Neu hochladen"),
        icon: mdiCloudUpload,
      },
      {
        href: contributorAssets(),
        label: ttc("View/edit existing", "Medien ansehen/bearbeiten"),
        icon: mdiImageMultiple,
      },
    ]
  }
  return [
    { href: adminAssets(), label: ttc("Assets", "Medien"), icon: mdiImageMultiple },
    { href: adminUpload(), label: ttc("Upload", "Hochladen"), icon: mdiCloudUpload },
    { href: adminJobs(), label: ttc("Jobs", "Aufträge"), icon: mdiPlaylistCheck },
    { href: adminBackups(), label: ttc("Backups", "Sicherungen"), icon: mdiDatabaseArrowUp },
    { href: adminCatalog(), label: ttc("Catalog", "Katalog"), icon: mdiFileTree },
    { href: adminAudit(), label: ttc("Audit", "Protokoll"), icon: mdiClipboardTextClock },
    { href: adminSettings(), label: ttc("Settings", "Einstellungen"), icon: mdiCogOutline },
  ]
}
