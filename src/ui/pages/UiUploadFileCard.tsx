import { mdiAlertCircle } from "@adaptive-ds/mdi/mdiAlertCircle.js"
import { mdiCheckCircle } from "@adaptive-ds/mdi/mdiCheckCircle.js"
import { Show } from "solid-js"
import { Icon } from "#ui/static/icon/Icon.jsx"
import { UiLinkButton } from "../common/UiLinkButton.jsx"
import { UiNotice } from "../common/UiNotice.jsx"
import { UiStatusBadge } from "../common/UiStatusBadge.jsx"
import { uiByteSizeFormat } from "../common/uiByteSizeFormat.js"
import { ttc } from "../localization/ttc.js"
import { UiUploadFolderInput } from "../upload/UiUploadFolderInput.jsx"
import { UiUploadProgressBar } from "../upload/UiUploadProgressBar.jsx"
import type { UiUploadMultiFileItem } from "../upload/UiUploadMultiFileItem.js"

export type UiUploadFileCardProps = {
  file: UiUploadMultiFileItem
  assetHref: (assetId: string) => string
  folderOptions: (level: 1 | 2 | 3, parent1?: string, parent2?: string) => string[]
  folderSet: (fileId: string, level: 1 | 2 | 3, value: string) => void
}

/** One uploading or uploaded file with its progress, status, and canonical folder editors. */
export function UiUploadFileCard(p: UiUploadFileCardProps) {
  const level1 = () => p.file.folders[0] ?? ""
  const level2 = () => p.file.folders[1] ?? ""
  const level3 = () => p.file.folders[2] ?? ""
  const isDone = () => p.file.stage === "done"
  const hasFailed = () => p.file.stage === "failed"

  return (
    <li
      data-testid="upload-file-card"
      data-file-id={p.file.id}
      data-stage={p.file.stage}
      class="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900/40"
    >
      <div class="flex flex-wrap items-start justify-between gap-2">
        <div class="min-w-0">
          <p class="wrap-anywhere font-medium">{p.file.file.name}</p>
          <p class="text-sm text-muted-foreground">{uiByteSizeFormat(p.file.file.size)}</p>
        </div>
        <Show when={isDone()}>
          <UiStatusBadge tone="positive" class="flex items-center gap-1">
            <Icon path={mdiCheckCircle} class="size-4" />
            {ttc("Completed", "Abgeschlossen")}
          </UiStatusBadge>
        </Show>
        <Show when={hasFailed()}>
          <UiStatusBadge tone="negative" class="flex items-center gap-1">
            <Icon path={mdiAlertCircle} class="size-4" />
            {ttc("Failed", "Fehlgeschlagen")}
          </UiStatusBadge>
        </Show>
      </div>

      <UiUploadProgressBar
        labelId={`${p.file.id}-progress-label`}
        label={p.file.progress.label}
        percent={p.file.progress.percent}
        hasFailed={hasFailed()}
      />

      <Show when={p.file.errorMessage}>
        {(message) => (
          <UiNotice tone="negative" role="alert">
            {message()}
          </UiNotice>
        )}
      </Show>

      <Show when={isDone()}>
        <fieldset class="flex flex-col gap-3 sm:flex-row sm:items-end">
          <legend class="sr-only">{ttc("Folders", "Ordner")}</legend>
          <UiUploadFolderInput
            id={`${p.file.id}-folder-1`}
            label={ttc("Folder level 1", "Ordnerebene 1")}
            value={level1()}
            disabled={p.file.folderMovePending}
            options={() => p.folderOptions(1)}
            valueSet={(value) => p.folderSet(p.file.id, 1, value)}
          />
          <Show when={level1() !== ""}>
            <UiUploadFolderInput
              id={`${p.file.id}-folder-2`}
              label={ttc("Folder level 2", "Ordnerebene 2")}
              value={level2()}
              disabled={p.file.folderMovePending}
              options={() => p.folderOptions(2, level1())}
              valueSet={(value) => p.folderSet(p.file.id, 2, value)}
            />
          </Show>
          <Show when={level1() !== "" && level2() !== ""}>
            <UiUploadFolderInput
              id={`${p.file.id}-folder-3`}
              label={ttc("Folder level 3", "Ordnerebene 3")}
              value={level3()}
              disabled={p.file.folderMovePending}
              options={() => p.folderOptions(3, level1(), level2())}
              valueSet={(value) => p.folderSet(p.file.id, 3, value)}
            />
          </Show>
        </fieldset>
      </Show>

      <Show when={p.file.folderErrorMessage}>
        {(message) => (
          <UiNotice tone="negative" role="alert">
            {message()}
          </UiNotice>
        )}
      </Show>

      <Show when={p.file.assetId}>
        {(assetId) => (
          <div>
            <UiLinkButton href={p.assetHref(assetId())} variant="outline">
              {ttc("Open asset", "Medium öffnen")}
            </UiLinkButton>
          </div>
        )}
      </Show>
    </li>
  )
}
