import { Input } from "#ui/input/input/Input.jsx"
import { InputS } from "#ui/input/input/InputS.jsx"
import { Label } from "#ui/input/label/Label.jsx"
import { TextareaS } from "#ui/input/textarea/TextareaS.jsx"
import { ButtonIcon } from "#ui/interactive/button/ButtonIcon.jsx"
import { Badge } from "#ui/static/badge/Badge.jsx"
import { CardWrapper } from "#ui/static/card/CardWrapper.jsx"
import { CodeBlock } from "#ui/static/code/CodeBlock.jsx"
import { Icon } from "#ui/static/icon/Icon.jsx"
import { Img } from "#ui/static/img/Img.jsx"
import { mdiArrowLeft } from "@adaptive-ds/mdi/mdiArrowLeft.js"
import { mdiClockOutline } from "@adaptive-ds/mdi/mdiClockOutline.js"
import { mdiContentSave } from "@adaptive-ds/mdi/mdiContentSave.js"
import { mdiDelete } from "@adaptive-ds/mdi/mdiDelete.js"
import { mdiDownload } from "@adaptive-ds/mdi/mdiDownload.js"
import { mdiFolderMove } from "@adaptive-ds/mdi/mdiFolderMove.js"
import { mdiImageOutline } from "@adaptive-ds/mdi/mdiImageOutline.js"
import { mdiOpenInNew } from "@adaptive-ds/mdi/mdiOpenInNew.js"
import { mdiPlus } from "@adaptive-ds/mdi/mdiPlus.js"
import { mdiRestore } from "@adaptive-ds/mdi/mdiRestore.js"
import { mdiShareVariant } from "@adaptive-ds/mdi/mdiShareVariant.js"
import { mdiTrashCan } from "@adaptive-ds/mdi/mdiTrashCan.js"
import { mdiTune } from "@adaptive-ds/mdi/mdiTune.js"
import { A } from "@solidjs/router"
import { For, Show } from "solid-js"
import { UiDialog } from "../common/UiDialog.jsx"
import { UiNotice } from "../common/UiNotice.jsx"
import { UiPageHeading } from "../common/UiPageHeading.jsx"
import { UiQueryView } from "../common/UiQueryView.jsx"
import { UiStatusBadge } from "../common/UiStatusBadge.jsx"
import { uiAssetPathFormat } from "../common/uiAssetPathFormat.js"
import { uiByteSizeFormat } from "../common/uiByteSizeFormat.js"
import { uiDestructiveButtonClassesRead } from "../common/uiDestructiveButtonClassesRead.js"
import { uiDeletionProgressRead } from "../deletion/uiDeletionProgressRead.js"
import { uiDeletionStatusDetailRead } from "../deletion/uiDeletionStatusDetailRead.js"
import { uiDeletionStatusLabelRead } from "../deletion/uiDeletionStatusLabelRead.js"
import { uiDeletionStatusToneRead } from "../deletion/uiDeletionStatusToneRead.js"
import { uiDeepLinkCreate } from "../routing/uiDeepLinkCreate.js"
import { uiPaths } from "../routing/uiPaths.js"
import { uiToastAdd } from "../toast/uiToastAdd.js"
import { uiAssetDetailPageStateCreate } from "./uiAssetDetailPageStateCreate.js"

const imageFormats = ["webp", "avif", "jpg", "png"]

/** Shows one asset with its revisions, outputs, metadata, status, and mutations in a scan-friendly layout. */
export function UiAssetDetailPage() {
  const state = uiAssetDetailPageStateCreate()

  return (
    <>
      <div class="mb-2">
        <A
          href={uiPaths.assets(state.projectId())}
          class="inline-flex items-center gap-1.5 text-xs font-medium text-slate-500 transition-colors hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100"
        >
          <Icon path={mdiArrowLeft} class="size-4" />
          <span>Back to assets</span>
        </A>
      </div>

      <UiPageHeading
        title="Asset"
        subtitle="Source revisions, generated outputs, metadata, processing status, and destructive actions."
        actions={
          <ButtonIcon
            icon={mdiShareVariant}
            variant="outline"
            size="sm"
            onClick={() => {
              void navigator.clipboard?.writeText(uiDeepLinkCreate(uiPaths.asset(state.projectId(), state.assetId())))
              uiToastAdd({ tone: "positive", title: "Asset link copied to clipboard" })
            }}
          >
            Copy link
          </ButtonIcon>
        }
      />

      <Show when={state.actionError()}>
        {(message) => (
          <UiNotice tone="negative" role="alert" class="mb-6">
            {message()}
          </UiNotice>
        )}
      </Show>

      <UiQueryView query={state.query} loadingItem="asset">
        {(asset) => (
          <div class="flex flex-col gap-6">
            {/* Primary Hero Section: Preview + Alt Text / Metadata & Asset Identity */}
            <div class="grid grid-cols-1 gap-6 lg:grid-cols-12">
              {/* Left column: Preview & Alternative text */}
              <div class="flex flex-col gap-6 lg:col-span-7">
                {/* Main Preview Card */}
                <CardWrapper class="p-5">
                  <div class="flex items-center justify-between gap-2 border-b border-slate-100 pb-3 dark:border-slate-800">
                    <div class="flex items-center gap-2 min-w-0">
                      <Icon path={mdiImageOutline} class="size-5 text-slate-500 dark:text-slate-400 shrink-0" />
                      <h2 class="text-sm font-semibold text-slate-900 dark:text-slate-100">Latest original preview</h2>
                    </div>
                    <Show when={state.latestImagePreview()}>
                      {(preview) => (
                        <span class="font-mono text-xs text-slate-500 dark:text-slate-400 truncate max-w-[200px]">
                          {preview().originalFilename}
                        </span>
                      )}
                    </Show>
                  </div>

                  <Show
                    when={state.latestImagePreview()}
                    fallback={
                      <div class="mt-4 flex flex-col items-center justify-center rounded-lg border border-dashed border-slate-200 bg-slate-50/50 py-12 text-center text-sm text-slate-500 dark:border-slate-800 dark:bg-slate-900/30 dark:text-slate-400">
                        <Icon path={mdiImageOutline} class="size-8 text-slate-400 mb-2" />
                        <p>No image preview available for this asset.</p>
                      </div>
                    }
                  >
                    {(preview) => (
                      <div class="mt-4 flex flex-col gap-3">
                        <div class="relative flex min-h-[260px] max-h-[420px] items-center justify-center overflow-hidden rounded-lg border border-slate-200 bg-slate-100/80 p-2 dark:border-slate-800 dark:bg-slate-950/60">
                          <Img
                            class="max-h-[380px] w-full rounded-md object-contain"
                            src={preview().contentUrl}
                            alt={preview().alt}
                          />
                        </div>
                        <Show when={preview().alt}>
                          <p class="text-xs text-slate-500 dark:text-slate-400">
                            <span class="font-medium text-slate-700 dark:text-slate-300">Alt:</span> "{preview().alt}"
                          </p>
                        </Show>
                      </div>
                    )}
                  </Show>
                </CardWrapper>

                {/* Alternative Text & Custom Metadata Card */}
                <CardWrapper class="p-5">
                  <form
                    onSubmit={(event) => {
                      event.preventDefault()
                      void state.altSet()
                    }}
                  >
                    <div class="border-b border-slate-100 pb-3 dark:border-slate-800">
                      <h2 class="text-sm font-semibold text-slate-900 dark:text-slate-100">Alternative text</h2>
                      <p class="mt-0.5 text-xs text-muted-foreground">
                        Accessible description applied to web image outputs and accessibility readers.
                      </p>
                    </div>

                    <div class="mt-3">
                      <Label
                        class="text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-400"
                        for="asset-alt"
                      >
                        Alt text
                      </Label>
                      <div class="mt-1">
                        <TextareaS
                          id="asset-alt"
                          rows={3}
                          valueSignal={state.altDraft}
                          placeholder="Describe the content of this image..."
                        />
                      </div>
                    </div>

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

                  <Show when={asset.metadata}>
                    {(metadata) => (
                      <div class="mt-5 border-t border-slate-100 pt-4 dark:border-slate-800">
                        <h3 class="text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-400 mb-2">
                          Metadata JSON
                        </h3>
                        <CodeBlock data={metadata().metadata} />
                      </div>
                    )}
                  </Show>
                </CardWrapper>
              </div>

              {/* Right column: Asset Identity & Primary Actions */}
              <div class="flex flex-col gap-6 lg:col-span-5">
                <CardWrapper class="p-5">
                  <div class="flex flex-col gap-1">
                    <span class="font-mono text-xs text-slate-500 dark:text-slate-400 truncate">
                      {asset.folders.length > 0 ? `${asset.folders.join("/")}/` : "/"}
                    </span>
                    <h2 class="wrap-anywhere font-mono text-lg font-bold text-slate-900 dark:text-slate-100">
                      {asset.filename}
                    </h2>
                  </div>

                  <div class="mt-3 flex flex-wrap items-center gap-2">
                    <Badge variant="subtle" class="font-mono text-xs capitalize">
                      {asset.class}
                    </Badge>
                    <span class="inline-flex items-center gap-1 text-xs text-slate-500 dark:text-slate-400">
                      <Icon path={mdiClockOutline} class="size-3.5" />
                      Updated {asset.updatedAt.slice(0, 10)}
                    </span>
                  </div>

                  {/* Primary Action Controls */}
                  <div class="mt-4 flex flex-wrap gap-2 border-y border-slate-100 py-3 dark:border-slate-800">
                    <ButtonIcon
                      icon={mdiFolderMove}
                      variant="outline"
                      size="sm"
                      onClick={() => state.openDialogSet("move")}
                    >
                      Move
                    </ButtonIcon>
                    <ButtonIcon
                      icon={mdiTune}
                      variant="outline"
                      size="sm"
                      onClick={() => state.openDialogSet("outputs")}
                    >
                      Edit outputs
                    </ButtonIcon>
                    <ButtonIcon
                      icon={mdiDelete}
                      variant="filledRed"
                      size="sm"
                      class={uiDestructiveButtonClassesRead("filled")}
                      onClick={() => state.openDialogSet("delete")}
                    >
                      Request deletion
                    </ButtonIcon>
                  </div>

                  {/* Integration note callout */}
                  <Show when={asset.integrationNote}>
                    <div class="mt-4 rounded-lg border border-blue-200 bg-blue-50/70 p-3 text-xs text-blue-900 dark:border-blue-900/60 dark:bg-blue-950/40 dark:text-blue-200">
                      <span class="font-semibold block mb-0.5">Where should this asset be included?</span>
                      <span class="wrap-anywhere text-slate-700 dark:text-slate-300">{asset.integrationNote}</span>
                    </div>
                  </Show>

                  {/* Structured Details */}
                  <dl class="mt-4 flex flex-col divide-y divide-slate-100 text-xs dark:divide-slate-800">
                    <div class="flex justify-between py-2">
                      <dt class="text-slate-500 dark:text-slate-400">Folder</dt>
                      <dd class="font-mono font-medium text-slate-800 dark:text-slate-200">
                        {asset.folders.length > 0 ? asset.folders.join("/") : "(root)"}
                      </dd>
                    </div>
                    <div class="flex flex-col gap-0.5 py-2">
                      <dt class="text-slate-500 dark:text-slate-400">Path</dt>
                      <dd class="font-mono break-all text-slate-800 dark:text-slate-200">
                        {uiAssetPathFormat(asset.folders, asset.filename)}
                      </dd>
                    </div>
                    <div class="flex flex-col gap-0.5 py-2">
                      <dt class="text-slate-500 dark:text-slate-400">Source path</dt>
                      <dd class="font-mono break-all text-slate-600 dark:text-slate-400">{asset.sourcePath}</dd>
                    </div>
                    <div class="flex justify-between py-2">
                      <dt class="text-slate-500 dark:text-slate-400">Revisions</dt>
                      <dd class="font-mono font-medium text-slate-800 dark:text-slate-200">
                        {asset.sourceHistory.length}
                      </dd>
                    </div>
                    <div class="flex justify-between py-2">
                      <dt class="text-slate-500 dark:text-slate-400">Outputs defined</dt>
                      <dd class="font-mono font-medium text-slate-800 dark:text-slate-200">
                        {asset.outputHistory.length}
                      </dd>
                    </div>
                  </dl>
                </CardWrapper>
              </div>
            </div>

            {/* Outputs Section */}
            <CardWrapper class="p-5">
              <div class="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-4 dark:border-slate-800">
                <div>
                  <div class="flex items-center gap-2">
                    <h2 class="text-base font-semibold text-slate-900 dark:text-slate-100">Outputs</h2>
                    <Badge variant="subtle" class="font-mono text-xs">
                      {state.outputHistoryLinks().length}
                    </Badge>
                  </div>
                  <p class="mt-0.5 text-xs text-muted-foreground">
                    Target variations generated from the source file with public and download links.
                  </p>
                </div>
                <ButtonIcon size="sm" variant="outline" icon={mdiTune} onClick={() => state.openDialogSet("outputs")}>
                  Edit output set
                </ButtonIcon>
              </div>

              <ul class="mt-4 flex flex-col gap-4">
                <For
                  each={state.outputHistoryLinks()}
                  fallback={
                    <li class="rounded-lg border border-dashed border-slate-200 py-8 text-center text-sm text-muted-foreground dark:border-slate-800">
                      No outputs are defined yet.
                    </li>
                  }
                >
                  {(entry) => (
                    <li class="rounded-xl border border-slate-200 bg-slate-50/50 p-4 dark:border-slate-800 dark:bg-slate-800/30">
                      <div class="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200/60 pb-3 dark:border-slate-700/60">
                        <div class="flex items-center gap-2 min-w-0">
                          <span class="font-mono text-sm font-bold text-slate-900 dark:text-slate-100">
                            {entry.definition.key}
                          </span>
                          <Badge variant="subtle" class="font-mono text-xs capitalize">
                            {entry.definition.kind}
                          </Badge>
                        </div>
                        <div class="flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                          <Show when={entry.definition.kind === "image" ? entry.definition : undefined}>
                            {(definition) => (
                              <>
                                <span class="font-mono">
                                  {definition().width}×{definition().height}
                                </span>
                                <span>·</span>
                                <span class="font-mono uppercase">{definition().format}</span>
                                <Show when={definition().quality}>{(quality) => <> · q{quality()}</>}</Show>
                                <Show when={definition().showAiLabel !== undefined}>
                                  <span class="rounded bg-slate-200/80 px-1.5 py-0.5 text-2xs dark:bg-slate-700">
                                    AI label {definition().showAiLabel ? "on" : "off"}
                                  </span>
                                </Show>
                              </>
                            )}
                          </Show>
                          <span>·</span>
                          <span>
                            {entry.versions.length} version{entry.versions.length === 1 ? "" : "s"}
                          </span>
                        </div>
                      </div>

                      <ul class="mt-3 flex flex-col gap-2">
                        <For each={entry.versions}>
                          {(version) => (
                            <li class="flex flex-col gap-2 rounded-lg border border-slate-200/80 bg-white p-3 sm:flex-row sm:items-center sm:justify-between dark:border-slate-700/60 dark:bg-slate-900/60">
                              <div class="flex flex-col min-w-0 gap-1">
                                <div class="flex flex-wrap items-center gap-2">
                                  <span class="font-mono text-xs font-semibold text-slate-800 dark:text-slate-200">
                                    v{version.version}
                                  </span>
                                  <Show when={version.current}>
                                    <UiStatusBadge tone="positive">current</UiStatusBadge>
                                  </Show>
                                  <span class="font-mono text-xs text-slate-600 dark:text-slate-400">
                                    {uiByteSizeFormat(version.byteSize)}
                                  </span>
                                  <Show when={version.width && version.height}>
                                    <span class="text-xs text-slate-400">·</span>
                                    <span class="font-mono text-xs text-slate-600 dark:text-slate-400">
                                      {version.width}×{version.height}
                                    </span>
                                  </Show>
                                  <span class="text-xs text-slate-400">·</span>
                                  <span class="text-xs text-slate-500 dark:text-slate-400">{version.mediaType}</span>
                                </div>
                                <div class="wrap-anywhere font-mono text-2xs text-slate-400 dark:text-slate-500">
                                  sha256 {version.sha256}
                                </div>
                              </div>

                              <div class="flex flex-wrap items-center gap-2 shrink-0">
                                <Show
                                  when={version.publicUrl}
                                  fallback={
                                    <span class="font-mono text-xs text-slate-500 dark:text-slate-400">
                                      {version.objectKey}
                                    </span>
                                  }
                                >
                                  {(publicUrl) => (
                                    <div class="flex items-center gap-2">
                                      <a
                                        class="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 shadow-2xs hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700 transition-colors"
                                        href={publicUrl()}
                                        target="_blank"
                                        rel="noreferrer"
                                      >
                                        <Icon path={mdiOpenInNew} class="size-3.5" />
                                        <span>Open</span>
                                      </a>
                                      <a
                                        class="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 shadow-2xs hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700 transition-colors"
                                        href={version.downloadUrl ?? undefined}
                                        download={version.downloadFilename}
                                      >
                                        <Icon path={mdiDownload} class="size-3.5" />
                                        <span>Download</span>
                                      </a>
                                    </div>
                                  )}
                                </Show>
                              </div>
                            </li>
                          )}
                        </For>
                      </ul>
                    </li>
                  )}
                </For>
              </ul>
            </CardWrapper>

            {/* Source Revisions Section */}
            <CardWrapper class="p-5">
              <div class="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-4 dark:border-slate-800">
                <div>
                  <div class="flex items-center gap-2">
                    <h2 class="text-base font-semibold text-slate-900 dark:text-slate-100">Source revisions</h2>
                    <Badge variant="subtle" class="font-mono text-xs">
                      {state.sourceRevisionLinks().length}
                    </Badge>
                  </div>
                  <p class="mt-0.5 text-xs text-muted-foreground">
                    History of uploaded master source files and backup receipts.
                  </p>
                </div>
              </div>

              <ul class="mt-4 flex flex-col gap-3">
                <For
                  each={state.sourceRevisionLinks()}
                  fallback={
                    <li class="rounded-lg border border-dashed border-slate-200 py-8 text-center text-sm text-muted-foreground dark:border-slate-800">
                      No source revisions were recorded.
                    </li>
                  }
                >
                  {(revision) => (
                    <li class="flex flex-col gap-3 rounded-xl border border-slate-200 bg-slate-50/50 p-4 sm:flex-row sm:items-start sm:justify-between dark:border-slate-800 dark:bg-slate-800/30">
                      <div class="flex flex-col gap-1.5 min-w-0">
                        <div class="flex flex-wrap items-center gap-2">
                          <Badge variant="subtle" class="font-mono text-xs font-semibold">
                            r{revision.revision}
                          </Badge>
                          <span class="font-semibold text-sm text-slate-900 dark:text-slate-100 truncate">
                            {revision.originalFilename}
                          </span>
                          <span class="text-xs text-slate-400">·</span>
                          <span class="font-mono text-xs text-slate-600 dark:text-slate-400">
                            {uiByteSizeFormat(revision.byteSize)}
                          </span>
                          <span class="text-xs text-slate-400">·</span>
                          <span class="text-xs text-slate-500 dark:text-slate-400">{revision.mediaType}</span>
                          <span class="text-xs text-slate-400">·</span>
                          <span class="text-xs text-slate-500 dark:text-slate-400">
                            {revision.createdAt.slice(0, 10)}
                          </span>
                        </div>
                        <p class="font-mono text-xs text-slate-500 dark:text-slate-400 break-all">
                          {revision.objectKey}
                        </p>
                        <p class="wrap-anywhere font-mono text-2xs text-slate-400 dark:text-slate-500">
                          sha256 {revision.sha256}
                        </p>
                        <Show
                          when={state.activity
                            .data()
                            ?.backups.find((receipt) => receipt.sourceRevisionId === revision.id)}
                          fallback={<p class="text-xs text-slate-400">No backup receipt yet.</p>}
                        >
                          {(receipt) => (
                            <div class="mt-1 flex flex-wrap items-center gap-2 text-xs">
                              <UiStatusBadge tone={receipt().checkResult === "verified" ? "positive" : "negative"}>
                                backup {receipt().checkResult}
                              </UiStatusBadge>
                              <span class="font-mono text-2xs text-slate-500 break-all">{receipt().remotePath}</span>
                            </div>
                          )}
                        </Show>
                      </div>

                      <div class="shrink-0 pt-1">
                        <a
                          class="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 shadow-2xs hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700 transition-colors"
                          href={revision.contentUrl}
                          download={revision.originalFilename}
                        >
                          <Icon path={mdiDownload} class="size-3.5" />
                          <span>Download original</span>
                        </a>
                      </div>
                    </li>
                  )}
                </For>
              </ul>
            </CardWrapper>

            {/* Processing, Workflows and Deletion Section */}
            <CardWrapper class="p-5">
              <div class="border-b border-slate-100 pb-3 dark:border-slate-800">
                <h2 class="text-base font-semibold text-slate-900 dark:text-slate-100">Processing and deletion</h2>
                <p class="mt-0.5 text-xs text-muted-foreground">
                  Workflow execution logs, backup receipts, and asset deletion status.
                </p>
              </div>

              <UiQueryView query={state.activity} loadingItem="asset status">
                {(activity) => (
                  <div class="mt-4 grid grid-cols-1 gap-6 md:grid-cols-3">
                    {/* Workflows Column */}
                    <div class="flex flex-col gap-2 rounded-xl border border-slate-200 bg-slate-50/50 p-4 dark:border-slate-800 dark:bg-slate-800/30">
                      <div class="flex items-center justify-between">
                        <h3 class="text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-400">
                          Workflows
                        </h3>
                        <a
                          class="text-xs font-medium text-blue-600 hover:underline dark:text-blue-400"
                          href={uiPaths.jobs(state.projectId())}
                        >
                          Open in jobs
                        </a>
                      </div>
                      <ul class="mt-2 flex flex-col gap-2 text-xs">
                        <For
                          each={activity.workflows}
                          fallback={<li class="text-slate-400">No workflow has run for this asset.</li>}
                        >
                          {(workflow) => (
                            <li class="flex flex-wrap items-center justify-between gap-2 rounded-md border border-slate-200/60 bg-white p-2 dark:border-slate-700/60 dark:bg-slate-900/60">
                              <span class="font-medium text-slate-800 dark:text-slate-200">{workflow.kind}</span>
                              <Badge variant="subtle" class="font-mono text-2xs capitalize">
                                {workflow.status}
                              </Badge>
                            </li>
                          )}
                        </For>
                      </ul>
                    </div>

                    {/* Backups Column */}
                    <div class="flex flex-col gap-2 rounded-xl border border-slate-200 bg-slate-50/50 p-4 dark:border-slate-800 dark:bg-slate-800/30">
                      <div class="flex items-center justify-between">
                        <h3 class="text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-400">
                          Backups
                        </h3>
                        <a
                          class="text-xs font-medium text-blue-600 hover:underline dark:text-blue-400"
                          href={uiPaths.backups(state.projectId())}
                        >
                          Open backups
                        </a>
                      </div>
                      <div class="mt-2 text-xs">
                        <Show
                          when={activity.backups.length > 0}
                          fallback={<p class="text-slate-400">No backup receipt was recorded.</p>}
                        >
                          <div class="flex flex-col gap-2">
                            <div class="flex items-center gap-2">
                              <UiStatusBadge
                                tone={
                                  activity.backups.every((receipt) => receipt.checkResult === "verified")
                                    ? "positive"
                                    : "negative"
                                }
                              >
                                {activity.backups.filter((receipt) => receipt.checkResult === "verified").length} of{" "}
                                {activity.backups.length} verified
                              </UiStatusBadge>
                            </div>
                            <p class="text-slate-500 dark:text-slate-400">
                              Receipts are tracked and verified in project backup storage.
                            </p>
                          </div>
                        </Show>
                      </div>
                    </div>

                    {/* Deletion Column */}
                    <div class="flex flex-col gap-2 rounded-xl border border-slate-200 bg-slate-50/50 p-4 dark:border-slate-800 dark:bg-slate-800/30">
                      <h3 class="text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-400">
                        Deletion
                      </h3>
                      <div class="mt-2 text-xs">
                        <Show
                          when={activity.deletion}
                          fallback={<p class="text-slate-400">No deletion was requested.</p>}
                        >
                          {(deletion) => (
                            <Show when={uiDeletionProgressRead(deletion())}>
                              {(progress) => (
                                <div class="flex flex-col gap-2.5" role="status">
                                  <div class="flex flex-wrap items-center gap-2">
                                    <UiStatusBadge tone={uiDeletionStatusToneRead(deletion().status)}>
                                      {uiDeletionStatusLabelRead(deletion().status)}
                                    </UiStatusBadge>
                                    <span class="font-medium text-slate-700 dark:text-slate-300">
                                      {uiDeletionStatusDetailRead(deletion())}
                                    </span>
                                  </div>
                                  <div
                                    role="progressbar"
                                    aria-label="Deletion progress"
                                    aria-valuemin={0}
                                    aria-valuemax={100}
                                    aria-valuenow={progress().percent}
                                    aria-valuetext={progress().label}
                                    class="h-2 w-full overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700"
                                  >
                                    <div
                                      class="h-full bg-blue-600 transition-all duration-300 dark:bg-blue-500"
                                      style={{ width: `${progress().percent}%` }}
                                    />
                                  </div>
                                  <dl class="grid grid-cols-2 gap-2 text-2xs">
                                    <div class="flex flex-col">
                                      <dt class="text-slate-500 dark:text-slate-400">Steps</dt>
                                      <dd class="font-mono font-semibold text-slate-800 dark:text-slate-200">
                                        {progress().completedSteps} of {progress().totalSteps}
                                      </dd>
                                    </div>
                                    <div class="flex flex-col">
                                      <dt class="text-slate-500 dark:text-slate-400">Removed</dt>
                                      <dd class="font-mono font-semibold text-slate-800 dark:text-slate-200">
                                        {progress().removedObjects} of{" "}
                                        {progress().removedObjects + progress().pendingObjects}
                                      </dd>
                                    </div>
                                    <div class="col-span-2 flex flex-col">
                                      <dt class="text-slate-500 dark:text-slate-400">Remaining</dt>
                                      <dd class="font-mono font-semibold text-slate-800 dark:text-slate-200">
                                        {progress().pendingObjects} remote objects left
                                      </dd>
                                    </div>
                                  </dl>
                                  <p class="text-2xs text-slate-500 dark:text-slate-400">{progress().label}</p>
                                </div>
                              )}
                            </Show>
                          )}
                        </Show>
                      </div>
                    </div>
                  </div>
                )}
              </UiQueryView>
            </CardWrapper>

            {/* Dialogs */}
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
