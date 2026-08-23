import { mdiCancel } from "@adaptive-ds/mdi/mdiCancel.js"
import { mdiRefresh } from "@adaptive-ds/mdi/mdiRefresh.js"
import { For, Show } from "solid-js"
import { ButtonIcon } from "#ui/interactive/button/ButtonIcon.jsx"
import { Badge } from "#ui/static/badge/Badge.jsx"
import { UiPageHeading } from "../common/UiPageHeading.jsx"
import { UiPager } from "../common/UiPager.jsx"
import { UiQueryView } from "../common/UiQueryView.jsx"
import { uiDestructiveButtonClassesRead } from "../common/uiDestructiveButtonClassesRead.js"
import { uiErrorTextClassesRead } from "../common/uiErrorTextClassesRead.js"
import { uiJobsPageStateCreate } from "./uiJobsPageStateCreate.js"
import { uiJobsTabs } from "./uiJobsTabs.js"

/** Lists workflows and jobs of one project with retry and cancel actions. */
export function UiJobsPage() {
  const state = uiJobsPageStateCreate()

  return (
    <>
      <UiPageHeading title="Jobs" subtitle="Durable workflows and their individual jobs." />

      <div role="tablist" aria-label="Job views" class="mb-6 flex gap-2">
        <For each={uiJobsTabs}>
          {(value) => (
            <button
              type="button"
              role="tab"
              aria-selected={state.tabSignal.get() === value}
              class="rounded-lg border border-gray-300 px-3 py-1.5 capitalize aria-selected:bg-gray-900 aria-selected:text-white dark:border-gray-600 dark:aria-selected:bg-gray-100 dark:aria-selected:text-gray-900"
              onClick={() => state.tabSignal.set(value)}
            >
              {value}
            </button>
          )}
        </For>
      </div>

      <Show when={state.tabSignal.get() === "workflows"}>
        <UiQueryView
          query={state.workflows}
          loadingItem="workflows"
          emptyMessage="No workflows have run yet."
          isEmpty={(data) => (data?.workflows.length ?? 0) === 0}
        >
          {(data) => (
            <ul class="flex flex-col gap-3">
              <For each={data?.workflows ?? []}>
                {(workflow) => (
                  <li class="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-gray-200 p-3 dark:border-gray-700">
                    <div>
                      <p class="font-medium">{workflow.kind}</p>
                      <p class="wrap-anywhere font-mono text-xs text-muted-foreground">{workflow.id}</p>
                    </div>
                    <Badge variant="subtle">{workflow.status}</Badge>
                    <div class="flex gap-2">
                      <ButtonIcon
                        size="sm"
                        variant="outline"
                        icon={mdiRefresh}
                        isLoading={state.pendingId() === workflow.id}
                        onClick={() => state.workflowRetry(workflow.id)}
                      >
                        Retry
                      </ButtonIcon>
                      <ButtonIcon
                        size="sm"
                        variant="outlineRed"
                        class={uiDestructiveButtonClassesRead("outline")}
                        icon={mdiCancel}
                        isLoading={state.pendingId() === workflow.id}
                        onClick={() => state.workflowCancel(workflow.id)}
                      >
                        Cancel
                      </ButtonIcon>
                    </div>
                  </li>
                )}
              </For>
            </ul>
          )}
        </UiQueryView>
      </Show>

      <Show when={state.tabSignal.get() === "jobs"}>
        <UiQueryView
          query={state.jobs}
          loadingItem="jobs"
          emptyMessage="No jobs have been queued yet."
          isEmpty={(data) => (data?.jobs.length ?? 0) === 0}
        >
          {(data) => (
            <ul class="flex flex-col gap-3">
              <For each={data?.jobs ?? []}>
                {(job) => (
                  <li class="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-gray-200 p-3 dark:border-gray-700">
                    <div>
                      <p class="font-medium">{job.kind}</p>
                      <p class="text-sm text-muted-foreground">
                        attempt {job.attempts} of {job.retryLimit}
                      </p>
                      <Show when={job.error}>
                        {(error) => (
                          <p class={`wrap-anywhere text-sm ${uiErrorTextClassesRead()}`}>{error().message}</p>
                        )}
                      </Show>
                    </div>
                    <Badge variant="subtle">{job.status}</Badge>
                    <div class="flex gap-2">
                      <ButtonIcon
                        size="sm"
                        variant="outline"
                        icon={mdiRefresh}
                        isLoading={state.pendingId() === job.id}
                        onClick={() => state.jobRetry(job.id)}
                      >
                        Retry
                      </ButtonIcon>
                      <ButtonIcon
                        size="sm"
                        variant="outlineRed"
                        class={uiDestructiveButtonClassesRead("outline")}
                        icon={mdiCancel}
                        isLoading={state.pendingId() === job.id}
                        onClick={() => state.jobCancel(job.id)}
                      >
                        Cancel
                      </ButtonIcon>
                    </div>
                  </li>
                )}
              </For>
            </ul>
          )}
        </UiQueryView>
      </Show>

      <UiPager
        isFirstPage={state.isFirstPage()}
        nextCursor={state.nextCursor()}
        onFirstPage={state.goToFirstPage}
        onNextPage={state.goToNextPage}
      />
    </>
  )
}
