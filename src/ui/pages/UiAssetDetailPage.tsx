import { ButtonIcon } from "#ui/interactive/button/ButtonIcon.jsx"
import { Input } from "#ui/input/input/Input.jsx"
import { InputS } from "#ui/input/input/InputS.jsx"
import { Label } from "#ui/input/label/Label.jsx"
import { TextareaS } from "#ui/input/textarea/TextareaS.jsx"
import { Badge } from "#ui/static/badge/Badge.jsx"
import { CardWrapper } from "#ui/static/card/CardWrapper.jsx"
import { CodeBlock } from "#ui/static/code/CodeBlock.jsx"
import { Img } from "#ui/static/img/Img.jsx"
import { mdiContentSave } from "@adaptive-ds/mdi/mdiContentSave.js"
import { mdiDelete } from "@adaptive-ds/mdi/mdiDelete.js"
import { mdiFolderMove } from "@adaptive-ds/mdi/mdiFolderMove.js"
import { mdiPlus } from "@adaptive-ds/mdi/mdiPlus.js"
import { mdiRestore } from "@adaptive-ds/mdi/mdiRestore.js"
import { mdiShareVariant } from "@adaptive-ds/mdi/mdiShareVariant.js"
import { mdiTrashCan } from "@adaptive-ds/mdi/mdiTrashCan.js"
import { mdiTune } from "@adaptive-ds/mdi/mdiTune.js"
import { For, Show } from "solid-js"
import { uiAssetPathFormat } from "../common/uiAssetPathFormat.js"
import { uiByteSizeFormat } from "../common/uiByteSizeFormat.js"
import { UiPageHeading } from "../common/UiPageHeading.jsx"
import { UiDialog } from "../common/UiDialog.jsx"
import { UiQueryView } from "../common/UiQueryView.jsx"
import { UiStatusBadge } from "../common/UiStatusBadge.jsx"
import { uiDeepLinkCreate } from "../routing/uiDeepLinkCreate.js"
import { uiPaths } from "../routing/uiPaths.js"
import { uiAssetDetailPageStateCreate } from "./uiAssetDetailPageStateCreate.js"
import { UiNotice } from "../common/UiNotice.jsx"
import { uiDeletionStatusToneRead } from "../deletion/uiDeletionStatusToneRead.js"
import { uiDeletionStatusLabelRead } from "../deletion/uiDeletionStatusLabelRead.js"
import { uiDeletionStatusDetailRead } from "../deletion/uiDeletionStatusDetailRead.js"
import { uiDeletionProgressRead } from "../deletion/uiDeletionProgressRead.js"
import { uiDestructiveButtonClassesRead } from "../common/uiDestructiveButtonClassesRead.js"

const imageFormats = ["webp", "avif", "jpg", "png"]

/** Shows one asset with its revisions, outputs, metadata, status, and mutations. */
export function UiAssetDetailPage() {
  const state = uiAssetDetailPageStateCreate()

  return (
    <>
      <UiPageHeading
        title="Asset"
        subtitle="Source revisions, generated outputs, metadata, processing status, and destructive actions."
        actions={
          <ButtonIcon
            icon={mdiShareVariant}
            variant="outline"
            onClick={() =>
              void navigator.clipboard?.writeText(uiDeepLinkCreate(uiPaths.asset(state.projectId(), state.assetId())))
            }
          >
            Copy link
          </ButtonIcon>
        }
      />

      <Show when={state.actionError()}>
        {(message) => (
          <UiNotice tone="negative" role="alert" class="mb-4">
            {message()}
          </UiNotice>
        )}
      </Show>

      <UiQueryView query={state.query} loadingItem="asset">
        {(asset) => (
          <div class="flex flex-col gap-6">
            <CardWrapper class="p-4">
              <h2 class="wrap-anywhere text-lg font-semibold">{uiAssetPathFormat(asset.folders, asset.filename)}</h2>
              <div class="mt-2 flex flex-wrap items-center gap-2">
                <Badge variant="subtle">{asset.class}</Badge>
                <span class="text-sm text-muted-foreground">Updated {asset.updatedAt.slice(0, 10)}</span>
              </div>
              <Show when={asset.integrationNote}>
                <p class="mt-3 wrap-anywhere">
                  <span class="font-medium">Where should this asset be included?</span> {asset.integrationNote}
                </p>
              </Show>
              <p class="mt-3 wrap-anywhere font-mono text-sm">{asset.sourcePath}</p>

              <div class="mt-4 flex flex-wrap gap-2">
                <ButtonIcon icon={mdiFolderMove} variant="outline" onClick={() => state.openDialogSet("move")}>
                  Move
                </ButtonIcon>
                <ButtonIcon icon={mdiTune} variant="outline" onClick={() => state.openDialogSet("outputs")}>
                  Edit outputs
                </ButtonIcon>
                <ButtonIcon
                  icon={mdiDelete}
                  variant="filledRed"
                  class={uiDestructiveButtonClassesRead("filled")}
                  onClick={() => state.openDialogSet("delete")}
                >
                  Request deletion
                </ButtonIcon>
              </div>
            </CardWrapper>

            <Show when={state.latestImagePreview()}>
              {(preview) => (
                <CardWrapper class="p-4">
                  <h2 class="text-lg font-semibold">Latest original preview</h2>
                  <Img
                    class="mt-3 max-h-[36rem] w-full rounded-lg bg-gray-100 object-contain dark:bg-gray-800"
                    src={preview().contentUrl}
                    alt={preview().alt}
                  />
                </CardWrapper>
              )}
            </Show>

            <CardWrapper class="p-4">
              <form
                onSubmit={(event) => {
                  event.preventDefault()
                  void state.altSet()
                }}
              >
                <h2 class="text-lg font-semibold">Alternative text</h2>
                <Label class="mt-3" for="asset-alt">
                  Alt text
                </Label>
                <TextareaS id="asset-alt" rows={3} valueSignal={state.altDraft} />
                <div class="mt-3 flex flex-wrap gap-2">
                  <ButtonIcon type="submit" icon={mdiContentSave} isLoading={state.pendingLabel() === "Alt text"}>
                    Save alt text
                  </ButtonIcon>
                  <ButtonIcon
                    type="button"
                    icon={mdiTrashCan}
                    variant="outline"
                    isLoading={state.pendingLabel() === "Alt text removal"}
                    onClick={() => void state.altUnset()}
                  >
                    Remove alt text
                  </ButtonIcon>
                </div>
              </form>
              <Show when={asset.metadata}>{(metadata) => <CodeBlock class="mt-4" data={metadata().metadata} />}</Show>
            </CardWrapper>

            <CardWrapper class="p-4">
              <div class="flex flex-wrap items-center justify-between gap-2">
                <h2 class="text-lg font-semibold">Outputs</h2>
                <ButtonIcon size="sm" variant="outline" icon={mdiTune} onClick={() => state.openDialogSet("outputs")}>
                  Edit output set
                </ButtonIcon>
              </div>
              <ul class="mt-3 flex flex-col gap-3">
                <For
                  each={state.outputHistoryLinks()}
                  fallback={<li class="text-muted-foreground">No outputs are defined yet.</li>}
                >
                  {(entry) => (
                    <li class="rounded-lg border border-gray-200 p-3 dark:border-gray-700">
                      <p class="font-medium">{entry.definition.key}</p>
                      <p class="text-sm text-muted-foreground">
                        {entry.definition.kind}
                        <Show when={entry.definition.kind === "image" ? entry.definition : undefined}>
                          {(definition) => (
                            <>
                              {" · "}
                              {definition().width}×{definition().height} · {definition().format}
                              <Show when={definition().quality}>{(quality) => <> · q{quality()}</>}</Show>
                              <Show when={definition().showAiLabel !== undefined}>
                                {" · AI label "}
                                {definition().showAiLabel ? "on" : "off"}
                              </Show>
                            </>
                          )}
                        </Show>
                        {" · "}
                        {entry.versions.length} version{entry.versions.length === 1 ? "" : "s"}
                      </p>
                      <ul class="mt-2 flex flex-col gap-1 text-sm">
                        <For each={entry.versions}>
                          {(version) => (
                            <li class="wrap-anywhere">
                              v{version.version} · {uiByteSizeFormat(version.byteSize)}
                              <Show when={version.width && version.height}>
                                {" · "}
                                {version.width}×{version.height}
                              </Show>{" "}
                              · {version.mediaType}
                              <Show when={version.current}>
                                <UiStatusBadge class="ml-2" tone="positive">
                                  current
                                </UiStatusBadge>
                              </Show>
                              <br />
                              <Show
                                when={version.publicUrl}
                                fallback={<span class="font-mono">{version.objectKey}</span>}
                              >
                                {(publicUrl) => (
                                  <div class="flex flex-wrap gap-2">
                                    <a
                                      class="inline-flex items-center rounded-lg border border-gray-300 px-3 py-1.5 font-medium hover:bg-gray-100 dark:border-gray-600 dark:hover:bg-gray-800"
                                      href={publicUrl()}
                                      target="_blank"
                                      rel="noreferrer"
                                    >
                                      Open
                                    </a>
                                    <a
                                      class="inline-flex items-center rounded-lg border border-gray-300 px-3 py-1.5 font-medium hover:bg-gray-100 dark:border-gray-600 dark:hover:bg-gray-800"
                                      href={version.downloadUrl ?? undefined}
                                      download={version.downloadFilename}
                                    >
                                      Download
                                    </a>
                                  </div>
                                )}
                              </Show>
                              <br />
                              <span class="wrap-anywhere font-mono text-xs text-muted-foreground">
                                sha256 {version.sha256}
                              </span>
                            </li>
                          )}
                        </For>
                      </ul>
                    </li>
                  )}
                </For>
              </ul>
            </CardWrapper>

            <CardWrapper class="p-4">
              <h2 class="text-lg font-semibold">Source revisions</h2>
              <ul class="mt-3 flex flex-col gap-3 text-sm">
                <For
                  each={state.sourceRevisionLinks()}
                  fallback={<li class="text-muted-foreground">No source revisions were recorded.</li>}
                >
                  {(revision) => (
                    <li class="wrap-anywhere">
                      <p>
                        r{revision.revision} · {revision.originalFilename} · {uiByteSizeFormat(revision.byteSize)} ·{" "}
                        {revision.mediaType} · {revision.createdAt.slice(0, 10)}
                      </p>
                      <p class="font-mono text-muted-foreground">{revision.objectKey}</p>
                      <a
                        class="mt-2 inline-flex items-center rounded-lg border border-gray-300 px-3 py-1.5 font-medium hover:bg-gray-100 dark:border-gray-600 dark:hover:bg-gray-800"
                        href={revision.contentUrl}
                        download={revision.originalFilename}
                      >
                        Download original
                      </a>
                      <p class="wrap-anywhere font-mono text-xs text-muted-foreground">sha256 {revision.sha256}</p>
                      <Show
                        when={state.activity
                          .data()
                          ?.backups.find((receipt) => receipt.sourceRevisionId === revision.id)}
                        fallback={<p class="text-muted-foreground">No backup receipt yet.</p>}
                      >
                        {(receipt) => (
                          <p>
                            <UiStatusBadge tone={receipt().checkResult === "verified" ? "positive" : "negative"}>
                              backup {receipt().checkResult}
                            </UiStatusBadge>{" "}
                            <span class="font-mono">{receipt().remotePath}</span>
                          </p>
                        )}
                      </Show>
                    </li>
                  )}
                </For>
              </ul>
            </CardWrapper>

            <CardWrapper class="p-4">
              <h2 class="text-lg font-semibold">Processing and deletion</h2>
              <UiQueryView query={state.activity} loadingItem="asset status">
                {(activity) => (
                  <div class="mt-3 flex flex-col gap-4 text-sm">
                    <div>
                      <h3 class="font-medium">Workflows</h3>
                      <ul class="mt-2 flex flex-col gap-1">
                        <For
                          each={activity.workflows}
                          fallback={<li class="text-muted-foreground">No workflow has run for this asset.</li>}
                        >
                          {(workflow) => (
                            <li class="flex flex-wrap items-center gap-2">
                              <Badge variant="subtle">{workflow.status}</Badge>
                              <span>{workflow.kind}</span>
                              <a class="underline" href={uiPaths.jobs(state.projectId())}>
                                Open in jobs
                              </a>
                            </li>
                          )}
                        </For>
                      </ul>
                    </div>
                    <div>
                      <h3 class="font-medium">Backups</h3>
                      <p class="mt-1">
                        <Show
                          when={activity.backups.length > 0}
                          fallback={<span class="text-muted-foreground">No backup receipt was recorded.</span>}
                        >
                          {activity.backups.filter((receipt) => receipt.checkResult === "verified").length} of{" "}
                          {activity.backups.length} receipts verified ·{" "}
                          <a class="underline" href={uiPaths.backups(state.projectId())}>
                            Open backups
                          </a>
                        </Show>
                      </p>
                    </div>
                    <div>
                      <h3 class="font-medium">Deletion</h3>
                      <Show
                        when={activity.deletion}
                        fallback={<p class="mt-1 text-muted-foreground">No deletion was requested.</p>}
                      >
                        {(deletion) => (
                          <Show when={uiDeletionProgressRead(deletion())}>
                            {(progress) => (
                              <div class="mt-1 flex flex-col gap-2" role="status">
                                <div class="flex flex-wrap items-center gap-2">
                                  <UiStatusBadge tone={uiDeletionStatusToneRead(deletion().status)}>
                                    {uiDeletionStatusLabelRead(deletion().status)}
                                  </UiStatusBadge>
                                  <span>{uiDeletionStatusDetailRead(deletion())}</span>
                                </div>
                                <div
                                  role="progressbar"
                                  aria-label="Deletion progress"
                                  aria-valuemin={0}
                                  aria-valuemax={100}
                                  aria-valuenow={progress().percent}
                                  aria-valuetext={progress().label}
                                  class="h-2 w-full max-w-sm overflow-hidden rounded-full bg-gray-200 dark:bg-gray-700"
                                >
                                  <div class="h-full bg-blue-700" style={{ width: `${progress().percent}%` }} />
                                </div>
                                <dl class="flex flex-wrap gap-x-6 gap-y-1">
                                  <div class="flex gap-1">
                                    <dt class="text-muted-foreground">Steps</dt>
                                    <dd>
                                      {progress().completedSteps} of {progress().totalSteps}
                                    </dd>
                                  </div>
                                  <div class="flex gap-1">
                                    <dt class="text-muted-foreground">Remote objects removed</dt>
                                    <dd>
                                      {progress().removedObjects} of{" "}
                                      {progress().removedObjects + progress().pendingObjects}
                                    </dd>
                                  </div>
                                  <div class="flex gap-1">
                                    <dt class="text-muted-foreground">Remote objects left</dt>
                                    <dd>{progress().pendingObjects}</dd>
                                  </div>
                                </dl>
                                <p class="text-muted-foreground">{progress().label}</p>
                              </div>
                            )}
                          </Show>
                        )}
                      </Show>
                    </div>
                  </div>
                )}
              </UiQueryView>
            </CardWrapper>

            <UiDialog title="Move asset" open={state.openDialog() === "move"} onClose={state.closeDialog}>
              <form
                class="flex w-[min(32rem,90vw)] flex-col gap-3"
                onSubmit={(event) => {
                  event.preventDefault()
                  void state.move()
                }}
              >
                <div>
                  <Label for="move-folder-1">Folder level 1</Label>
                  <InputS id="move-folder-1" valueSignal={state.moveFolder1} />
                </div>
                <div>
                  <Label for="move-folder-2">Folder level 2</Label>
                  <InputS id="move-folder-2" valueSignal={state.moveFolder2} />
                </div>
                <div>
                  <Label for="move-folder-3">Folder level 3</Label>
                  <InputS id="move-folder-3" valueSignal={state.moveFolder3} />
                </div>
                <div>
                  <Label for="move-filename">Filename</Label>
                  <InputS id="move-filename" required valueSignal={state.moveFilename} />
                </div>
                <ButtonIcon type="submit" isLoading={state.pendingLabel() === "Move"}>
                  Move asset
                </ButtonIcon>
              </form>
            </UiDialog>

            <UiDialog
              title="Edit output set"
              description="Saving replaces the whole output set in one step."
              open={state.openDialog() === "outputs"}
              onClose={state.closeDialog}
            >
              <form
                class="flex w-[min(46rem,92vw)] flex-col gap-4"
                onSubmit={(event) => {
                  event.preventDefault()
                  void state.outputsSave()
                }}
              >
                <ul class="flex flex-col gap-4">
                  <For
                    each={state.outputDrafts.get()}
                    fallback={<li class="text-muted-foreground">The output set is empty.</li>}
                  >
                    {(draft, index) => (
                      <li class="rounded-lg border border-gray-200 p-3 dark:border-gray-700">
                        <div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
                          <div>
                            <Label for={`output-key-${draft.id}`}>Output key</Label>
                            <Input
                              id={`output-key-${draft.id}`}
                              required
                              value={draft.key}
                              onInput={(event) => state.outputDraftSet(draft.id, "key", event.currentTarget.value)}
                            />
                          </div>
                          <Show when={asset.class === "image"}>
                            <div>
                              <Label for={`output-format-${draft.id}`}>Format</Label>
                              <select
                                id={`output-format-${draft.id}`}
                                class="block w-full rounded-lg border border-gray-300 bg-gray-50 p-2.5 dark:border-gray-500 dark:bg-gray-700"
                                value={draft.format}
                                onChange={(event) =>
                                  state.outputDraftSet(draft.id, "format", event.currentTarget.value)
                                }
                              >
                                <For each={imageFormats}>{(format) => <option value={format}>{format}</option>}</For>
                              </select>
                            </div>
                            <div>
                              <Label for={`output-width-${draft.id}`}>Width</Label>
                              <Input
                                id={`output-width-${draft.id}`}
                                type="number"
                                min="1"
                                value={draft.width}
                                onInput={(event) => state.outputDraftSet(draft.id, "width", event.currentTarget.value)}
                              />
                            </div>
                            <div>
                              <Label for={`output-height-${draft.id}`}>Height</Label>
                              <Input
                                id={`output-height-${draft.id}`}
                                type="number"
                                min="1"
                                value={draft.height}
                                onInput={(event) => state.outputDraftSet(draft.id, "height", event.currentTarget.value)}
                              />
                            </div>
                            <div>
                              <Label for={`output-quality-${draft.id}`}>Quality (optional, 1 to 100)</Label>
                              <Input
                                id={`output-quality-${draft.id}`}
                                type="number"
                                min="1"
                                max="100"
                                value={draft.quality}
                                onInput={(event) =>
                                  state.outputDraftSet(draft.id, "quality", event.currentTarget.value)
                                }
                              />
                            </div>
                            <div>
                              <Label for={`output-ai-label-${draft.id}`}>AI label</Label>
                              <select
                                id={`output-ai-label-${draft.id}`}
                                class="block w-full rounded-lg border border-gray-300 bg-gray-50 p-2.5 dark:border-gray-500 dark:bg-gray-700"
                                value={draft.aiLabel}
                                onChange={(event) =>
                                  state.outputDraftSet(draft.id, "aiLabel", event.currentTarget.value)
                                }
                              >
                                <option value="inherit">Follow the asset metadata</option>
                                <option value="on">Always draw the label</option>
                                <option value="off">Never draw the label</option>
                              </select>
                            </div>
                          </Show>
                        </div>
                        <ButtonIcon
                          class={`mt-3 ${uiDestructiveButtonClassesRead("outline")}`}
                          type="button"
                          size="sm"
                          variant="outlineRed"
                          icon={mdiTrashCan}
                          disabled={state.outputDrafts.get().length <= 1}
                          onClick={() => state.outputDraftRemove(draft.id)}
                        >
                          Remove output {index() + 1}
                        </ButtonIcon>
                      </li>
                    )}
                  </For>
                </ul>

                <ButtonIcon type="button" variant="outline" icon={mdiPlus} onClick={state.outputDraftAdd}>
                  Add output
                </ButtonIcon>

                <Show when={state.outputError()}>
                  {(message) => (
                    <UiNotice tone="negative" role="alert">
                      {message()}
                    </UiNotice>
                  )}
                </Show>

                <Show when={state.outputChanges()?.isDestructive}>
                  <UiNotice tone="caution" role="status" id="output-destructive-notice">
                    <p class="font-medium">Saving deletes published objects</p>
                    <p class="mt-1">
                      Removed outputs: {state.outputChanges()?.removedKeys.join(", ") || "none"}. Rebuilt from the
                      source: {state.outputChanges()?.rebuiltKeys.join(", ") || "none"}. The current public URLs of
                      those outputs stop resolving.
                    </p>
                    <label class="mt-3 flex items-start gap-2 font-medium" for="output-destructive-confirm">
                      <input
                        id="output-destructive-confirm"
                        type="checkbox"
                        class="mt-1"
                        checked={state.confirmOutputs.get()}
                        onChange={(event) => state.confirmOutputs.set(event.currentTarget.checked)}
                      />
                      <span>I understand that these published outputs are deleted and rebuilt.</span>
                    </label>
                  </UiNotice>
                </Show>

                <div class="flex flex-wrap gap-2">
                  <ButtonIcon
                    type="submit"
                    icon={mdiContentSave}
                    isLoading={state.pendingLabel() === "Output set"}
                    disabled={state.outputSaveBlockedReason() !== null}
                    aria-describedby={
                      state.outputSaveBlockedReason() === null ? undefined : "output-save-blocked-reason"
                    }
                  >
                    Save output set
                  </ButtonIcon>
                  <ButtonIcon type="button" variant="outline" icon={mdiRestore} onClick={state.outputsReset}>
                    Discard changes
                  </ButtonIcon>
                </div>

                <Show when={state.outputSaveBlockedReason()}>
                  {(reason) => (
                    <p id="output-save-blocked-reason" role="status" class="text-sm text-muted-foreground">
                      {reason()}
                    </p>
                  )}
                </Show>
              </form>
            </UiDialog>

            <UiDialog
              title="Request deletion of this asset?"
              description="Deletion runs in the background. Nothing is removed until the deletion workflow finishes."
              open={state.openDialog() === "delete"}
              onClose={state.closeDialog}
            >
              <div class="w-[min(32rem,90vw)]">
                <form
                  onSubmit={(event) => {
                    event.preventDefault()
                    void state.deleteAsset()
                  }}
                >
                  <p>
                    A deletion workflow is queued for{" "}
                    <strong>{uiAssetPathFormat(asset.folders, asset.filename)}</strong>. Once it completes, every source
                    revision, output object, and catalog entry is gone and cannot be restored.
                  </p>
                  <label class="mt-4 flex items-start gap-2 font-medium" for="delete-confirm">
                    <input
                      id="delete-confirm"
                      type="checkbox"
                      class="mt-1"
                      checked={state.confirmDeletion.get()}
                      onChange={(event) => state.confirmDeletion.set(event.currentTarget.checked)}
                    />
                    <span>I understand that this asset is deleted permanently once the workflow completes.</span>
                  </label>
                  <div class="mt-4 flex flex-wrap gap-2">
                    <ButtonIcon
                      type="submit"
                      variant="filledRed"
                      class={uiDestructiveButtonClassesRead("filled")}
                      icon={mdiDelete}
                      isLoading={state.pendingLabel() === "Deletion"}
                      disabled={!state.confirmDeletion.get()}
                      aria-describedby={state.confirmDeletion.get() ? undefined : "delete-blocked-reason"}
                    >
                      Request deletion
                    </ButtonIcon>
                    <ButtonIcon type="button" variant="outline" onClick={state.closeDialog}>
                      Cancel
                    </ButtonIcon>
                  </div>
                  <Show when={!state.confirmDeletion.get()}>
                    <p id="delete-blocked-reason" role="status" class="mt-2 text-sm text-muted-foreground">
                      Tick the confirmation above to request deletion.
                    </p>
                  </Show>
                </form>
              </div>
            </UiDialog>
          </div>
        )}
      </UiQueryView>
    </>
  )
}
