import { mdiDatabase } from "@adaptive-ds/mdi/mdiDatabase.js"
import { mdiFileMultiple } from "@adaptive-ds/mdi/mdiFileMultiple.js"
import { A } from "@solidjs/router"
import { Icon } from "#ui/static/icon/Icon.jsx"
import type { ProjectListItem } from "../../api-client/projectListItemSchema.js"
import { uiByteSizeFormat } from "../common/uiByteSizeFormat.js"
import { ttc } from "../localization/ttc.js"
import { uiSessionStore } from "../session/uiSessionStore.js"
import { uiProjectCardHrefRead } from "./uiProjectCardHrefRead.js"

export type UiProjectCardProps = {
  project: ProjectListItem
}

/** Project overview card linking to the project assets and showing its totals. */
export function UiProjectCard(p: UiProjectCardProps) {
  return (
    <A
      href={uiProjectCardHrefRead(p.project.id, uiSessionStore.get().principal?.mode)}
      class="flex flex-col gap-4 rounded-lg bg-white p-4 shadow-lg hover:shadow-xl dark:border dark:border-gray-500 dark:bg-zinc-800"
    >
      <h2 class="font-medium text-blue-700 text-lg dark:text-blue-300">{p.project.name}</h2>
      <dl class="flex flex-wrap gap-x-6 gap-y-2 text-muted-foreground text-sm">
        <div class="flex items-center gap-2">
          <Icon path={mdiFileMultiple} class="size-4" />
          <dt class="sr-only">{ttc("Assets", "Medien")}</dt>
          <dd>
            {p.project.assetCount.toLocaleString("en-US")} {ttc("assets", "Medien")}
          </dd>
        </div>
        <div class="flex items-center gap-2">
          <Icon path={mdiDatabase} class="size-4" />
          <dt class="sr-only">{ttc("Space used", "Speicher verwendet")}</dt>
          <dd>{uiByteSizeFormat(p.project.totalFileSize)}</dd>
        </div>
      </dl>
    </A>
  )
}
