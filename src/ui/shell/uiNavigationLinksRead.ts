import {
  mdiClipboardTextClock,
  mdiCloudUpload,
  mdiCogOutline,
  mdiDatabaseArrowUp,
  mdiFileTree,
  mdiImageMultiple,
  mdiPlaylistCheck,
  mdiSwapHorizontal,
} from "@mdi/js"
import { uiPaths } from "../routing/uiPaths.js"

export type UiNavigationLink = { href: string; label: string; icon: string }

/** Lists the primary navigation targets of one project. */
export const uiNavigationLinksRead = (projectId: string): readonly UiNavigationLink[] => [
  { href: uiPaths.assets(projectId), label: "Assets", icon: mdiImageMultiple },
  { href: uiPaths.upload(projectId), label: "Upload", icon: mdiCloudUpload },
  { href: uiPaths.jobs(projectId), label: "Jobs", icon: mdiPlaylistCheck },
  { href: uiPaths.backups(projectId), label: "Backups", icon: mdiDatabaseArrowUp },
  { href: uiPaths.catalog(projectId), label: "Catalog", icon: mdiFileTree },
  { href: uiPaths.imports(projectId), label: "Imports", icon: mdiSwapHorizontal },
  { href: uiPaths.audit(projectId), label: "Audit", icon: mdiClipboardTextClock },
  { href: uiPaths.projectSettings(projectId), label: "Settings", icon: mdiCogOutline },
]
