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

/** Lists the primary navigation targets of one project. */
export const uiNavigationLinksRead = (
  projectId: string,
  mode: AuthenticationMode = "admin",
): readonly UiNavigationLink[] => {
  if (mode === "contributor") {
    return [
      { href: uiPaths.contributor.upload(projectId), label: ttc("Upload new", "Neu hochladen"), icon: mdiCloudUpload },
      {
        href: uiPaths.contributor.assets(projectId),
        label: ttc("View/edit existing", "Medien ansehen/bearbeiten"),
        icon: mdiImageMultiple,
      },
    ]
  }
  return [
    { href: uiPaths.admin.assets(projectId), label: ttc("Assets", "Medien"), icon: mdiImageMultiple },
    { href: uiPaths.admin.upload(projectId), label: ttc("Upload", "Hochladen"), icon: mdiCloudUpload },
    { href: uiPaths.admin.jobs(projectId), label: ttc("Jobs", "Aufträge"), icon: mdiPlaylistCheck },
    { href: uiPaths.admin.backups(projectId), label: ttc("Backups", "Sicherungen"), icon: mdiDatabaseArrowUp },
    { href: uiPaths.admin.catalog(projectId), label: ttc("Catalog", "Katalog"), icon: mdiFileTree },
    { href: uiPaths.admin.audit(projectId), label: ttc("Audit", "Protokoll"), icon: mdiClipboardTextClock },
    { href: uiPaths.admin.projectSettings(projectId), label: ttc("Settings", "Einstellungen"), icon: mdiCogOutline },
  ]
}
